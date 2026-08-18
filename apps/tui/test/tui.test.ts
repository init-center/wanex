import { mkdtemp, rm } from "node:fs/promises"
import { createServer, type Server } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  createAppExtensionCatalog,
  createStaticAppExtensionCatalogSource,
  resolveAppExtensionContributions,
  type AppCommandContribution
} from "@wanex/extension"
import {
  createShell,
  createSurfaceAdapter,
  type Shell
} from "@wanex/product"
import {
  createInProcessSurfaceClientTransport,
  createSurfaceClient
} from "@wanex/product/surface"
import {
  createTuiCliSecretResolver,
  createTuiHostSurfaceClient,
  createTuiSurface,
  main as runTuiCli,
  parseTuiCliCommand,
  createTuiCliComposition,
  resolveTuiCliModelEndpoint,
  parseTuiLineCommand,
  renderTuiCommandCatalog,
  renderTuiConversationOperation,
  renderTuiExecutionActivity,
  renderTuiFrame,
  runTuiLineSession,
  type TuiCliEnvironment,
  type TuiSurface
} from "../src/index.js"
import {
  createTuiConversationSettlementFixture,
  type TuiConversationSettlementObserver
} from "./conversation-settlement-fixture.js"
import { TuiVirtualTerminal } from "./full-screen/virtual-terminal.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)

const tempDirs: string[] = []
const servers: Server[] = []

afterEach(async () => {
  while (servers.length > 0) {
    await closeServer(servers.pop()!)
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

describe("@wanex/tui", () => {
  it("refreshes the line-session catalog after a Surface invalidation", async () => {
    const catalog = createAppExtensionCatalog({
      revision: "tui-catalog-zero",
      snapshot: resolveAppExtensionContributions([])
    })
    await withSurface(
      async ({ surface }) => {
        async function* input() {
          yield "commands"
          catalog.publish({
            revision: "tui-catalog-one",
            snapshot: resolveAppExtensionContributions([])
          })
          yield "quit"
        }

        await runTuiLineSession({
          surface,
          input: input(),
          write() {}
        })
        expect(surface.snapshot().commandCatalog).toMatchObject({
          ok: true,
          value: { extensionRevision: "tui-catalog-one" }
        })
      },
      { extensions: { source: catalog.source } }
    )
  })

  it("parses real Provider endpoint evidence through the canonical schema", () => {
    const endpoint = resolveTuiCliModelEndpoint({
      WANEX_MODEL_ENDPOINT_ID: "tui-real",
      WANEX_PROVIDER_CONNECTION_ID: "tui-real-connection",
      WANEX_PROVIDER_PROTOCOL: "openai-chat-completions",
      WANEX_PROVIDER_ID: "openai-compatible",
      WANEX_PROVIDER_BASE_URL: "https://provider.example.test/v1/",
      WANEX_PROVIDER_SECRET_REF: "env://WANEX_TUI_REAL_KEY",
      WANEX_PROVIDER_MODEL_ID: "tui-real-model",
      WANEX_MODEL_OPERATIONS: "conversation",
      WANEX_MODEL_INPUT_MODALITIES: "text,image",
      WANEX_MODEL_OUTPUT_MODALITIES: "text",
      WANEX_MODEL_FEATURES: "tool_calling,parallel_tool_calls,reasoning",
      WANEX_MODEL_REASONING_REPLAY: "optional"
    })

    expect(endpoint).toMatchObject({
      id: "tui-real",
      connection: {
        id: "tui-real-connection",
        providerId: "openai-compatible",
        baseUrl: "https://provider.example.test/v1",
        secretRef: "env://WANEX_TUI_REAL_KEY"
      },
      protocol: { id: "openai-chat-completions" },
      model: {
        id: "tui-real-model",
        operations: ["conversation"],
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
        features: ["tool_calling", "parallel_tool_calls", "reasoning"],
        behavior: { reasoningReplay: "optional" }
      }
    })
  })

  it("fails closed on incomplete, unsupported, or incoherent endpoint evidence", () => {
    expect(() => resolveTuiCliModelEndpoint({
      WANEX_MODEL_ENDPOINT_ID: "incomplete"
    })).toThrow("must be set together")
    expect(() => resolveTuiCliModelEndpoint({
      WANEX_MODEL_ENDPOINT_ID: "unsupported",
      WANEX_PROVIDER_PROTOCOL: "custom-wire",
      WANEX_PROVIDER_ID: "custom",
      WANEX_PROVIDER_MODEL_ID: "custom-model"
    })).toThrow("unsupported TUI Provider protocol")
    expect(() => resolveTuiCliModelEndpoint({
      WANEX_MODEL_ENDPOINT_ID: "missing-secret",
      WANEX_PROVIDER_PROTOCOL: "openai-chat-completions",
      WANEX_PROVIDER_ID: "openai",
      WANEX_PROVIDER_MODEL_ID: "model",
      WANEX_PROVIDER_BASE_URL: "https://api.example.test/v1"
    })).toThrow("WANEX_PROVIDER_BASE_URL, WANEX_PROVIDER_SECRET_REF")
    expect(() => resolveTuiCliModelEndpoint({
      WANEX_MODEL_ENDPOINT_ID: "fake-with-secret",
      WANEX_PROVIDER_PROTOCOL: "fake",
      WANEX_PROVIDER_ID: "fake",
      WANEX_PROVIDER_MODEL_ID: "model",
      WANEX_PROVIDER_SECRET_REF: "env://RAW_SECRET"
    })).toThrow("fake Provider endpoint does not accept")
    expect(() => resolveTuiCliModelEndpoint({
      WANEX_MODEL_ENDPOINT_ID: "parallel-only",
      WANEX_PROVIDER_PROTOCOL: "fake",
      WANEX_PROVIDER_ID: "fake",
      WANEX_PROVIDER_MODEL_ID: "model",
      WANEX_MODEL_FEATURES: "parallel_tool_calls"
    })).toThrow("parallel_tool_calls requires tool_calling")
  })

  it("routes env secrets without loading keychain and exposes no raw credential", async () => {
    const storeDir = await createStoreDir()
    const env = {
      WANEX_STORE_DIR: storeDir,
      WANEX_TUI_REAL_KEY: "tui-environment-secret"
    }
    const resolver = createTuiCliSecretResolver({ env, storeDir })
    const secret = await resolver.resolve("env://WANEX_TUI_REAL_KEY")
    expect(secret.reveal()).toBe("tui-environment-secret")
    secret.dispose()

    const options = createTuiCliComposition(env).hostOptions
    expect(JSON.stringify(options)).not.toContain("tui-environment-secret")
    await expect(
      resolver.resolve("vault://credential")
    ).rejects.toThrow("no TUI secret resolver for scheme: vault")
  })

  it("renders setup-required capability interactions as a read-only fallback", () => {
    const capabilityRequest = {
      kind: "product.capability-request" as const,
      operation: "image.generate" as const,
      requirements: [
        {
          requirement: {
            operation: "image.generate" as const,
            inputModalities: ["text" as const],
            outputModalities: ["image" as const],
            features: []
          },
          status: "unconfigured" as const,
          reason: "image generation is not configured"
        }
      ],
      setupRequired: true
    }
    const rendered = renderTuiConversationOperation({
      kind: "product.conversation-operation.found",
      operation: {
        kind: "product.conversation-operation",
        operationId: "operation_tui_capability",
        sessionId: "session_tui_capability",
        state: "succeeded",
        createdAt: 10,
        updatedAt: 11,
        finishedAt: 11,
        transcript: {
          rows: [
            {
              key: "row_tui_capability",
              kind: "message",
              role: "tool",
              status: "completed",
              parts: [
                {
                  key: "reasoning_tui_capability",
                  type: "reasoning",
                  text: "Checked configured routes"
                },
                {
                  key: "tool_tui_capability",
                  type: "tool",
                  name: "request_capability",
                  state: "succeeded",
                  presentation: {
                    summary: "Image setup required",
                    details: [{ label: "Capability", value: "image.generate" }]
                  }
                }
              ],
              capabilityRequests: [capabilityRequest, capabilityRequest],
              createdAt: 10,
              updatedAt: 10
            }
          ],
          totalRows: 1,
          truncated: false
        },
        capabilities: {
          steerable: false,
          cancellable: false,
          regeneratable: true,
          terminal: true
        }
      }
    })

    expect(rendered.lines).toContain(
      "capability:image.generate:setup-required"
    )
    expect(rendered.lines).toContain("reasoning:Checked configured routes")
    expect(rendered.lines).toContain("tool:Image setup required:succeeded")
    expect(rendered.lines).toContain(
      "tool-detail:Capability=image.generate"
    )
    expect(
      rendered.lines.filter(
        (line) => line === "capability:image.generate:setup-required"
      )
    ).toHaveLength(1)
    expect(rendered.text).not.toContain("secretRef")
    expect(rendered.text).not.toContain("credential")
  })

  it("renders bounded Tool approvals and parses explicit approval decisions", () => {
    const rendered = renderTuiConversationOperation({
      kind: "product.conversation-operation.found",
      operation: {
        kind: "product.conversation-operation",
        operationId: "operation_tui_approval",
        sessionId: "session_tui_approval",
        state: "waiting",
        createdAt: 10,
        updatedAt: 11,
        transcript: { rows: [], totalRows: 0, truncated: false },
        approvals: {
          items: [
            {
              approvalId: "approval_tui_opaque",
              approvalRevision: 2,
              tool: {
                name: "publish_external",
                title: "Publish externally",
                risk: "external",
                idempotent: false
              },
              presentation: {
                summary: "Publish the reviewed artifact?",
                summaryTruncated: false,
                details: [
                  {
                    label: "Destination",
                    labelTruncated: false,
                    value: "Configured service",
                    valueTruncated: false
                  }
                ],
                detailsTruncated: false
              },
              attemptCount: 0,
              createdAt: 10,
              updatedAt: 11,
              availableDecisions: ["approve_once", "deny"]
            }
          ],
          truncated: false
        },
        capabilities: {
          steerable: true,
          cancellable: true,
          regeneratable: false,
          terminal: false
        }
      }
    })

    expect(rendered.text).toContain("approval:approval_tui_opaque")
    expect(rendered.text).toContain("approval-summary:Publish the reviewed artifact?")
    expect(rendered.text).toContain("approval-detail:Destination=Configured service")
    expect(rendered.text).toContain("approval-actions:approve_once,deny")
    expect(rendered.text).not.toContain("executionId")
    expect(rendered.text).not.toContain("authorizationRef")
    expect(
      parseTuiLineCommand(
        "approval-approve approval_tui_opaque reviewed destination"
      )
    ).toEqual({
      kind: "command",
      name: "approval-approve",
      approvalId: "approval_tui_opaque",
      reason: "reviewed destination"
    })
    expect(
      parseTuiLineCommand("approval-deny approval_tui_opaque unsafe")
    ).toEqual({
      kind: "command",
      name: "approval-deny",
      approvalId: "approval_tui_opaque",
      reason: "unsafe"
    })
    expect(
      parseTuiLineCommand("approval-approve approval_tui_opaque")
    ).toEqual({
      kind: "error",
      message: "approval-approve requires a reason"
    })
  })

  it("renders bounded capacity evidence and validates explicit model selection", () => {
    const rendered = renderTuiConversationOperation({
      kind: "product.conversation-operation.found",
      operation: {
        kind: "product.conversation-operation",
        operationId: "operation_tui_capacity",
        sessionId: "session_tui_capacity",
        state: "failed",
        createdAt: 10,
        updatedAt: 11,
        finishedAt: 11,
        transcript: {
          rows: [
            {
              key: "row_tui_capacity",
              kind: "message",
              role: "user",
              status: "failed",
              parts: [
                {
                  key: "text_tui_capacity",
                  type: "text",
                  text: "keep this request visible"
                }
              ],
              capabilityRequests: [],
              createdAt: 10,
              updatedAt: 11
            }
          ],
          totalRows: 1,
          truncated: false
        },
        error: {
          code: "conversation_context_capacity_exceeded",
          category: "capacity",
          message: "request exceeds selected model capacity",
          modelEndpointId: "small-endpoint",
          capacity: {
            reasons: ["input_tokens_exceeded"],
            inputTokens: 901,
            inputTokenCeiling: 700,
            inputResources: 0,
            requestedOutputTokens: 100,
            compactionAttempted: true,
            compactionReason: "internal detail must stay hidden"
          }
        },
        capabilities: {
          steerable: false,
          cancellable: false,
          regeneratable: true,
          terminal: true
        }
      }
    })

    expect(rendered.text).toContain("capacity-model:small-endpoint")
    expect(rendered.text).toContain("capacity-tokens:901/700")
    expect(rendered.text).toContain(
      "capacity-actions:model <endpoint-id>, regenerate [session-id]"
    )
    expect(rendered.text).toContain("keep this request visible")
    expect(rendered.text).not.toContain("internal detail")
    expect(parseTuiLineCommand("model large-endpoint")).toEqual({
      kind: "command",
      name: "model",
      endpointId: "large-endpoint"
    })
    expect(parseTuiLineCommand("model   ")).toEqual({
      kind: "error",
      message: "model requires an endpoint id"
    })
  })

  it("guides schema-backed preview input inside the interactive line session", async () => {
    const previews: unknown[] = []
    const inputSchema = {
      type: "object",
      properties: {
        text: { type: "string", minLength: 2, title: "Text" },
        count: { type: "integer", minimum: 1, maximum: 3 }
      },
      required: ["text", "count"],
      additionalProperties: false
    } as const
    const contribution = {
      id: "plugin.tui-guided",
      domain: "command",
      value: {
        name: "plugin.tui-guided",
        title: "TUI Guided Preview",
        paletteVisibility: "visible",
        handlerRef: "wanex.plugin-action:plugin.tui-guided/preview?version=1.0.0",
        inputSchema
      },
      provenance: {
        source: {
          kind: "plugin",
          scope: "user",
          id: "plugin.tui-guided"
        },
        trust: "user_enabled"
      },
      privileged: true
    } satisfies AppCommandContribution

    await withSurface(
      async ({ surface }) => {
        expect(surface.snapshot().commandCatalog).toMatchObject({
          ok: true,
          value: {
            commands: expect.arrayContaining([
              expect.objectContaining({
                id: "plugin.tui-guided",
                inputSchema: expect.objectContaining({
                  type: "object",
                  additionalProperties: false,
                  properties: inputSchema.properties
                })
              })
            ])
          }
        })
        expect(
          renderTuiCommandCatalog(surface.snapshot().commandCatalog)
            .text
        ).toContain("input:schema required:count,text")
        const chunks: string[] = []
        const result = await runTuiLineSession({
          surface,
          input: lines(["preview plugin.tui-guided", "2", "hello", "quit"]),
          write(chunk) {
            chunks.push(chunk)
          }
        })

        expect(result).toMatchObject({
          previewCommandCount: 1,
          errorCount: 0,
          quit: true
        })
        expect(chunks.join("\n")).toContain("Text:")
        expect(chunks.join("\n")).toContain("Count:")
        expect(chunks.join("\n")).toContain("Command preview")
        expect(chunks.join("\n")).toContain("status:runnable")
        expect(previews).toEqual([
          expect.objectContaining({
            commandId: "plugin.tui-guided",
            input: { text: "hello", count: 2 }
          })
        ])
      },
      {
        extensions: {
          source: createStaticAppExtensionCatalogSource({
            revision: "tui-guided-command-v1",
            snapshot: resolveAppExtensionContributions([contribution])
          })
        },
        productCommands: {
          extensionExecutor: {
            supports(handlerRef) {
              return handlerRef.startsWith("wanex.plugin-action:")
            },
            preview(request) {
              previews.push(request)
              return { ok: true }
            },
            async execute() {
              return {
                kind: "plugin-action.submitted",
                jobId: "job_tui_guided"
              }
            }
          }
        }
      }
    )
  })

  it("renders bounded execution activity states", () => {
    expect(
      renderTuiExecutionActivity({
        kind: "found",
        reference: { kind: "job", id: "job_tui_waiting" },
        activity: {
          kind: "wanex-app.execution.job",
          jobKind: "session.turn",
          state: "waiting",
          attempt: 1,
          maxAttempts: 1,
          scheduledAt: 10,
          createdAt: 9,
          updatedAt: 11
        }
      })
    ).toMatchObject({
      state: "waiting",
      schedulerState: "waiting",
      text: expect.stringContaining("state:waiting")
    })
    expect(
      renderTuiExecutionActivity({
        kind: "found",
        reference: { kind: "job", id: "job_tui_activity" },
        activity: {
          kind: "wanex-app.execution.job",
          jobKind: "plugin.action",
          state: "retry_scheduled",
          attempt: 2,
          maxAttempts: 4,
          scheduledAt: 10,
          createdAt: 9,
          updatedAt: 11,
          failureCategory: "retry_pending"
        }
      })
    ).toMatchObject({
      state: "retrying",
      referenceId: "job_tui_activity",
      schedulerState: "retry_scheduled",
      text: expect.stringContaining("failureCategory:retry_pending")
    })
    expect(
      renderTuiExecutionActivity({
        kind: "missing",
        reference: { kind: "job", id: "job_missing" }
      }).state
    ).toBe("missing")
  })

  it("reads execution activity from the interactive line session", async () => {
    await withSurface(async ({ app, settlements, surface }) => {
      const jobSettled = settlements.waitForJob("job_tui_execution_activity")
      await app.dispatchProductCommand({
        command: "submitConversationOperation",
        input: {
          text: "seed TUI execution activity",
          sessionId: "ses_tui_execution_activity",
          jobId: "job_tui_execution_activity"
        }
      })
      await jobSettled
      const chunks: string[] = []
      const result = await runTuiLineSession({
        surface,
        input: lines(["execution job_tui_execution_activity", "quit"]),
        write(chunk) {
          chunks.push(chunk)
        }
      })

      expect(result).toMatchObject({
        commandCount: 2,
        executionCommandCount: 1,
        errorCount: 0,
        quit: true
      })
      expect(chunks.join("")).toContain("Execution activity")
      expect(chunks.join("")).toContain("state:succeeded")
    })
  })

  it("projects canonical product state into a rendered frame", async () => {
    await withSurface(async ({ surface }) => {
      const snapshot = surface.snapshot()
      const frame = renderTuiFrame(snapshot)

      expect(snapshot).toMatchObject({
        kind: "tui.snapshot",
        descriptor: {
          ok: true,
          value: {
            kind: "product.surface-descriptor",
            commandCount: 61
          }
        },
        status: {
          ok: true,
          value: {
            state: {
              layout: "single",
              mode: "chat"
            }
          }
        },
        home: {
          ok: true,
          value: {
            kind: "product.home"
          }
        },
        settings: {
          ok: true,
          value: {
            kind: "product.settings",
            profile: {
              activeModelEndpointId: "tui-test"
            },
            renderer: {
              preferences: {
                theme: "system",
                density: "comfortable"
              }
            }
          }
        },
        commandCatalog: {
          ok: true,
          command: "readProductCommands",
          value: {
            commands: expect.arrayContaining([
              expect.objectContaining({
                id: "product.agent.submit",
                title: "Submit Agent Turn"
              })
            ]),
            diagnostics: []
          }
        }
      })
      expect(frame).toMatchObject({
        kind: "tui.frame",
        ready: true,
        mode: "chat",
        layout: "single",
        commandCount: 61,
        productCommandCount: 14,
        statusCount: 8
      })
      expect(frame.text).toContain("Workbench")
      expect(frame.text).toContain("model:tui-test")
      expect(frame.text).toContain("provider:ready")
      expect(frame.text).toContain("theme:system")
      expect(frame.text).toContain("product-commands:14")
      expect(frame.text).not.toContain("Palette")
    })
  })

  it("executes canonical Product commands through the surface client", async () => {
    await withSurface(async ({ settlements, surface }) => {
      const conversationSettled = settlements.waitForSession(
        "ses_product_app_tui"
      )
      const submitted = await surface.client.submitConversationOperation({
        text: "application tui first turn",
        sessionId: "ses_product_app_tui"
      })
      expect(submitted).toMatchObject({
        ok: true,
        command: "submitConversationOperation",
        value: {
          kind: "product.conversation-operation.found",
          operation: { sessionId: "ses_product_app_tui" }
        }
      })
      await conversationSettled

      const selected = await surface.client.selectSession({
        sessionId: "ses_product_app_tui"
      })
      expect(selected).toMatchObject({
        ok: true,
        command: "selectSession"
      })

      const read = await surface.client.readTrackedConversationOperation({
        sessionId: "ses_product_app_tui"
      })
      expect(read).toMatchObject({
        ok: true,
        command: "readTrackedConversationOperation",
        value: {
          kind: "product.conversation-operation.found",
          operation: {
            sessionId: "ses_product_app_tui",
            state: "succeeded"
          }
        }
      })

      const opened = await surface.client.openWorkbench()
      expect(opened).toMatchObject({
        ok: true,
        command: "openWorkbench"
      })

      const regenerated =
        await surface.client.regenerateTrackedConversationOperation({
          sessionId: "ses_product_app_tui"
        })
      expect(regenerated).toMatchObject({
        ok: true,
        command: "regenerateTrackedConversationOperation"
      })

      const cancelled =
        await surface.client.cancelTrackedConversationOperation({
          reason: "TUI test cancellation"
        })
      expect(cancelled).toMatchObject({
        ok: true,
        command: "cancelTrackedConversationOperation"
      })

      const snapshot = await surface.refresh()
      expect(snapshot.status).toMatchObject({
        ok: true,
        value: {
          state: {
            selection: {
              kind: "session",
              sessionId: "ses_product_app_tui"
            }
          }
        }
      })
      expect(snapshot.events).toMatchObject({
        ok: true,
        events: expect.arrayContaining([
          expect.objectContaining({
            type: "product.surface.state_changed",
            command: "regenerateTrackedConversationOperation"
          })
        ])
      })
    })
  })

  it("projects provider run gate failures through TUI command execution", async () => {
    await withSurface(
      async ({ surface }) => {
        const submitted = await surface.client.submitConversationOperation({
          text: "tui should not bypass provider setup"
        })
        expect(submitted).toMatchObject({
          ok: true,
          command: "submitConversationOperation",
          value: {
            kind: "product.conversation-operation.rejected"
          }
        })

        const snapshot = await surface.refresh()
        expect(snapshot.home).toMatchObject({
          ok: true,
          value: {
            providerReadiness: {
              status: "missing_required_credential",
              canRun: false
            }
          }
        })
        expect(snapshot.status).toMatchObject({
          ok: true,
          value: {
            state: {}
          }
        })
        expect(renderTuiFrame(snapshot).text).toContain(
          "provider:missing_required_credential"
        )

        const chunks: string[] = []
        const lineResult = await runTuiLineSession({
          surface,
          input: lines([
            "ask tui ask should not bypass provider setup",
            'preview product.agent.submit {"text":"preview should not bypass provider setup"}',
            'execute product.agent.submit {"text":"execute should not bypass provider setup"}',
            "quit"
          ]),
          write(chunk) {
            chunks.push(chunk)
          }
        })
        expect(lineResult).toMatchObject({
          handledLineCount: 4,
          commandCount: 4,
          askCommandCount: 1,
          blockedCommandCount: 2,
          previewCommandCount: 1,
          executeCommandCount: 1,
          errorCount: 0,
          quit: true
        })
        const output = chunks.join("")
        expect(output).toContain("Conversation")
        expect(output).toContain("state:rejected")
        expect(output).toContain("provider is not ready")
        expect(output).toContain("Command preview")
        expect(output).toContain("status:rejected")
        expect(output).toContain("reason:provider_not_ready")
        expect(output).toContain("provider:missing_required_credential")
        expect(output).toContain("canRun:no")
        expect(output).toContain("Command execution")
      },
      {
        modelEndpoint: tuiModelEndpoint({
          endpointId: "tui-blocked-provider",
          protocolId: "openai-chat-completions",
          providerId: "openai-compatible",
          modelId: "tui-blocked-model"
        })
      }
    )
  })

  it("creates its host surface client through the product message transport", async () => {
    const storeDir = await createStoreDir()
    const app = await createShell({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      },
      modelEndpoint: tuiModelEndpoint({
        endpointId: "tui-host-test",
        modelId: "tui-host-test-model"
      })
    })
    const productSurface = createSurfaceAdapter(app)
    try {
      const operations: string[] = []
      const client = createTuiHostSurfaceClient({
        surface: productSurface,
        observeRequest(request) {
          operations.push(request.operation)
        }
      })

      const descriptor = await client.descriptor()
      const status = await client.status({ requestId: "req_tui_host_status" })
      const events = await client.readSurfaceEvents()

      expect(descriptor).toMatchObject({
        ok: true,
        value: {
          kind: "product.surface-descriptor",
          commandCount: 61
        }
      })
      expect(status).toMatchObject({
        ok: true,
        event: {
          requestId: "req_tui_host_status"
        },
        value: {
          kind: "product.status"
        }
      })
      expect(events).toMatchObject({
        ok: true,
        events: [
          expect.objectContaining({
            type: "product.surface.command_completed",
            command: "status"
          })
        ]
      })
      expect(operations).toEqual([
        "descriptor",
        "dispatchSurfaceCommand",
        "readSurfaceEvents"
      ])
    } finally {
      await productSurface.dispose()
      await app.dispose()
    }
  })

  it("surfaces client failures as TUI diagnostics without throwing raw transport errors", async () => {
    const client = createSurfaceClient({
      descriptor: () => ({ broken: true }) as never,
      dispatchSurfaceCommand: () => ({ ok: true, command: "status" }) as never,
      readSurfaceEvents: () => [{ missing: "event fields" }] as never,
      subscribeSurfaceEvents: () => () => {}
    })
    const surface = await createTuiSurface({
      client,
      now: () => 12_345
    })

    const snapshot = surface.snapshot()
    const frame = renderTuiFrame(snapshot)

    expect(snapshot.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "tui.descriptor_failed",
      "tui.status_failed",
      "tui.home_failed",
      "tui.settings_failed",
      "tui.command_catalog_failed",
      "tui.conversation_failed",
      "tui.goal_failed",
      "tui.events_failed"
    ])
    expect(snapshot).not.toHaveProperty("readModel")
    expect(frame).toMatchObject({
      ready: false,
      diagnosticCount: 8,
      eventCount: 0
    })
    expect(frame.text).not.toContain("Error:")
  })

  it("runs an injected line session through the product surface client", async () => {
    await withSurface(async ({ app, settlements, surface }) => {
      const conversationSettled = settlements.waitForSession(
        "ses_product_app_tui_line"
      )
      await app.submitConversationOperation({
        text: "seed application tui line session",
        sessionId: "ses_product_app_tui_line"
      })
      await conversationSettled
      await surface.refresh()
      const chunks: string[] = []
      const result = await runTuiLineSession({
        surface,
        input: lines([
          "help",
          "operation",
          "workbench",
          "model tui-test",
          "regenerate",
          "cancel stop regenerated turn",
          "events 5",
          "commands",
          "palette",
          'preview product.agent.submit {"text":"preview through application tui line"}',
          "execute product.status",
          "refresh",
          "quit"
        ]),
        write(chunk) {
          chunks.push(chunk)
        }
      })
      const output = chunks.join("")

      expect(result).toMatchObject({
        kind: "tui.line-session",
        handledLineCount: 13,
        commandCount: 12,
        askCommandCount: 0,
        workbenchCommandCount: 1,
        operationCommandCount: 1,
        cancelCommandCount: 1,
        regenerateCommandCount: 1,
        catalogCommandCount: 1,
        previewCommandCount: 1,
        executeCommandCount: 1,
        eventsCommandCount: 1,
        blockedCommandCount: 0,
        errorCount: 1,
        quit: true
      })
      expect(result.activeSessionId).toBe("ses_product_app_tui_line")
      expect(output).toContain("Workbench")
      expect(output).toContain("Type help for commands.")
      expect(output).not.toContain("palette <index|palette-id|command-id>")
      expect(output).toContain("Conversation")
      expect(output).toContain("state:succeeded")
      expect(output).toContain("Workbench")
      expect(output).toContain("model:tui-test | active:yes")
      expect(output).toContain("regenerate:enabled")
      expect(output).toContain("cancel:")
      expect(output).toContain("Events")
      expect(output).toContain("Commands")
      expect(output).toContain("product.agent.submit - Submit Agent Turn")
      expect(output).toContain("source:builtin/")
      expect(output).toContain("error: unknown command: palette")
      expect(output).toContain("Command preview")
      expect(output).toContain("status:runnable")
      expect(output).toContain("Command execution")
      expect(output).toContain("command:product.status")
      expect(output).toContain("valueKind:object")
      expect(output).toContain("command:product.agent.submit")
      expect(output).toContain("input:accepted")
      expect(output).toContain("refreshed")
      expect(output).toContain("bye")
    })
  })

  it("renders and dismisses a real side query from Surface invalidation", async () => {
    await withSurface(async ({ app, settlements, surface }) => {
      const sessionId = "ses_product_app_tui_side_query"
      const settled = settlements.waitForSession(sessionId)
      await app.submitConversationOperation({
        sessionId,
        text: "canonical TUI side-query context"
      })
      await settled
      await app.selectSession({ sessionId })
      await surface.refresh()
      const workbenchBefore = JSON.stringify(
        await app.openWorkbench({ sessionId })
      )

      const chunks: string[] = []
      let resolveTerminal!: () => void
      const terminal = new Promise<void>((resolve) => {
        resolveTerminal = resolve
      })
      const input = (async function* (): AsyncIterable<string> {
        yield "btw inspect the selected context"
        await terminal
        yield "btw-dismiss"
        yield "quit"
      })()
      const result = await runTuiLineSession({
        surface,
        input,
        write(chunk) {
          chunks.push(chunk)
          if (chunk.includes("state:succeeded")) resolveTerminal()
        }
      })
      const output = chunks.join("")

      expect(result).toMatchObject({
        commandCount: 3,
        sideQueryCommandCount: 2,
        errorCount: 0,
        quit: true
      })
      expect(output).toContain("Side query")
      expect(output).toContain(`session:${sessionId}`)
      expect(output).toContain("question:inspect the selected context")
      expect(output).toContain(
        "answer:Fake response from tui-test-model"
      )
      expect(output).toContain("side-query:dismissed:sideq_")

      const workbench = await app.openWorkbench({ sessionId })
      expect(JSON.stringify(workbench)).toBe(workbenchBefore)
    })
  })

  it("uses the retained exact side-query ID for TUI cancel and dismiss", async () => {
    await withSurface(async ({ surface }) => {
      const seedEnvelope = await surface.client.status()
      if (!seedEnvelope.ok) throw new Error("expected status envelope")
      const calls: Array<{
        readonly command: string
        readonly queryId?: string
      }> = []
      const running = {
        kind: "product.side-query" as const,
        queryId: "sideq_tui_exact",
        sessionId: "ses_tui_exact",
        modelEndpointId: "provider_tui_exact",
        state: "running" as const,
        question: "cancel exact side query",
        startedAt: 1,
        updatedAt: 1
      }
      const client = {
        ...surface.client,
        async startSideQuery() {
          calls.push({ command: "start" })
          return {
            ...seedEnvelope,
            command: "startSideQuery" as const,
            value: running
          }
        },
        async readSideQuery(input: { readonly queryId: string }) {
          calls.push({ command: "read", queryId: input.queryId })
          return {
            ...seedEnvelope,
            command: "readSideQuery" as const,
            value: {
              kind: "product.side-query.found" as const,
              query: running
            }
          }
        },
        async cancelSideQuery(input: { readonly queryId: string }) {
          calls.push({ command: "cancel", queryId: input.queryId })
          return {
            ...seedEnvelope,
            command: "cancelSideQuery" as const,
            value: {
              ...running,
              state: "cancelled" as const,
              updatedAt: 2,
              finishedAt: 2
            }
          }
        },
        async dismissSideQuery(input: { readonly queryId: string }) {
          calls.push({ command: "dismiss", queryId: input.queryId })
          return {
            ...seedEnvelope,
            command: "dismissSideQuery" as const,
            value: {
              kind: "product.side-query.dismissed" as const,
              queryId: input.queryId
            }
          }
        }
      }
      const chunks: string[] = []
      const result = await runTuiLineSession({
        surface: { ...surface, client },
        input: lines([
          "btw cancel exact side query",
          "btw-cancel",
          "btw-dismiss",
          "quit"
        ]),
        write(chunk) {
          chunks.push(chunk)
        }
      })

      expect(result).toMatchObject({
        commandCount: 4,
        sideQueryCommandCount: 3,
        errorCount: 0
      })
      expect(calls).toEqual([
        { command: "start" },
        { command: "read", queryId: "sideq_tui_exact" },
        { command: "cancel", queryId: "sideq_tui_exact" },
        { command: "dismiss", queryId: "sideq_tui_exact" }
      ])
      expect(chunks.join("")).toContain("state:cancelled")
    })
  })

  it("parses side-query line commands without exposing an ID argument", () => {
    expect(parseTuiLineCommand("btw what changed?")).toEqual({
      kind: "command",
      name: "btw",
      question: "what changed?"
    })
    expect(parseTuiLineCommand("btw-cancel")).toEqual({
      kind: "command",
      name: "btw-cancel"
    })
    expect(parseTuiLineCommand("btw-dismiss")).toEqual({
      kind: "command",
      name: "btw-dismiss"
    })
    expect(parseTuiLineCommand("btw   ")).toEqual({
      kind: "error",
      message: "btw requires a question"
    })
    expect(parseTuiLineCommand("btw-cancel sideq_other")).toEqual({
      kind: "error",
      message: "btw-cancel does not accept arguments"
    })
  })

  it("parses and executes current-response steering without lower identities", async () => {
    expect(parseTuiLineCommand("steer focus on recovery")).toEqual({
      kind: "command",
      name: "steer",
      text: "focus on recovery"
    })
    expect(parseTuiLineCommand("steer   ")).toEqual({
      kind: "error",
      message: "steer requires guidance text"
    })

    await withSurface(async ({ surface }) => {
      const seedEnvelope = surface.snapshot().conversation
      if (!seedEnvelope.ok) throw new Error("expected conversation envelope")
      const operation = {
        kind: "product.conversation-operation" as const,
        operationId: "operation_tui_steer",
        sessionId: "ses_tui_steer",
        state: "running" as const,
        createdAt: 1,
        updatedAt: 2,
        transcript: { rows: [], totalRows: 0, truncated: false },
        capabilities: {
          steerable: true,
          cancellable: true,
          regeneratable: false,
          terminal: false
        }
      }
      const calls: unknown[] = []
      const client = {
        ...surface.client,
        async readTrackedConversationOperation(input?: {
          readonly sessionId?: string
        }) {
          calls.push({ command: "read", input })
          return {
            ...seedEnvelope,
            command: "readTrackedConversationOperation" as const,
            value: {
              kind: "product.conversation-operation.found" as const,
              operation
            }
          }
        },
        async steerTrackedConversationOperation(
          input: {
            readonly operationId: string
            readonly sessionId?: string
            readonly text: string
          },
          options?: { readonly requestId?: string }
        ) {
          calls.push({ command: "steer", input, options })
          return {
            ...seedEnvelope,
            command: "steerTrackedConversationOperation" as const,
            value: {
              kind: "product.conversation-operation.found" as const,
              operation: {
                ...operation,
                capabilities: { ...operation.capabilities, steerable: false },
                steering: {
                  pending: [
                    {
                      steeringId: "product_conversation_steering_tui",
                      text: input.text,
                      textTruncated: false,
                      createdAt: 3,
                      updatedAt: 3
                    }
                  ],
                  truncated: false
                }
              }
            }
          }
        }
      }
      const chunks: string[] = []
      const result = await runTuiLineSession({
        surface: { ...surface, client },
        input: lines(["steer focus on recovery", "quit"]),
        write(chunk) {
          chunks.push(chunk)
        }
      })

      expect(result).toMatchObject({
        commandCount: 2,
        steerCommandCount: 1,
        blockedCommandCount: 0,
        errorCount: 0,
        activeSessionId: "ses_tui_steer"
      })
      expect(calls).toHaveLength(2)
      expect(calls[1]).toMatchObject({
        command: "steer",
        input: {
          operationId: "operation_tui_steer",
          sessionId: "ses_tui_steer",
          text: "focus on recovery"
        },
        options: {
          requestId: expect.stringMatching(/^tui-steer-/)
        }
      })
      expect(JSON.stringify(calls)).not.toContain("attemptId")
      expect(JSON.stringify(calls)).not.toContain("controlId")
      expect(JSON.stringify(calls)).not.toContain("jobId")
      expect(chunks.join("")).toContain("steer:disabled")
      expect(chunks.join("")).toContain("steering-pending:focus on recovery")
    })
  })

  it("generates, approves, executes, and rereads a Plan over the TUI Surface", async () => {
    const provider = await listenTuiPlanProvider()
    await withSurface(
      async ({ app, settlements, surface }) => {
        const sessionId = "ses_product_app_tui_plan"
        const seedSettled = settlements.waitForSession(sessionId)
        await app.submitConversationOperation({
          sessionId,
          text: "seed the canonical TUI Plan context"
        })
        await seedSettled
        await app.selectSession({ sessionId })
        await surface.refresh()

        const chunks: string[] = []
        let resolveGenerated!: () => void
        const generated = new Promise<void>((resolve) => {
          resolveGenerated = resolve
        })
        const input = (async function* (): AsyncIterable<string> {
          yield "plan prepare the canonical TUI execution"
          await generated
          yield "plan-show"
          yield "plan-approve"
          yield "plan-execute"
          await waitForTrackedConversationOperation(app, sessionId)
          yield "operation"
          yield "quit"
        })()
        const result = await runTuiLineSession({
          surface,
          input,
          write(chunk) {
            chunks.push(chunk)
            if (
              chunk.includes("PLAN GENERATION") &&
              chunk.includes("state:succeeded")
            ) {
              resolveGenerated()
            }
          }
        })
        const output = chunks.join("\n")

        expect(result).toMatchObject({
          commandCount: 6,
          operationCommandCount: 1,
          errorCount: 0,
          quit: true,
          activeSessionId: sessionId
        })
        expect(output).toContain("PLAN GENERATION")
        expect(output).toContain("title:Canonical TUI Plan")
        expect(output).toContain("state:approved")
        expect(output).toContain("execution:job_")
        expect(output).toContain("Conversation")
        expect(output).toContain("state:succeeded")
      },
      {
        modelEndpoint: tuiModelEndpoint({
          endpointId: "tui-plan-provider",
          protocolId: "openai-chat-completions",
          providerId: "tui-plan-provider",
          modelId: "tui-plan-model",
          baseUrl: provider.baseUrl,
          secretRef: "test://tui-plan"
        }),
        secretResolver: createTuiPlanSecretResolver()
      }
    )
  })

  it("parses Plan commands without exposing proposal or generation IDs", () => {
    expect(parseTuiLineCommand("plan review this change")).toEqual({
      kind: "command",
      name: "plan",
      text: "review this change"
    })
    expect(parseTuiLineCommand("plan-show")).toEqual({
      kind: "command",
      name: "plan-show"
    })
    expect(parseTuiLineCommand("plan-reject revise scope")).toEqual({
      kind: "command",
      name: "plan-reject",
      reason: "revise scope"
    })
    expect(parseTuiLineCommand("plan-withdraw")).toEqual({
      kind: "command",
      name: "plan-withdraw"
    })
    expect(parseTuiLineCommand("plan   ")).toEqual({
      kind: "error",
      message: "plan requires a planning request"
    })
    expect(parseTuiLineCommand("plan-approve plan_other")).toEqual({
      kind: "error",
      message: "plan-approve does not accept arguments"
    })
  })

  it("starts and canonically rereads Goal Mode from TUI invalidations", async () => {
    const request = JSON.stringify({
      objective: "Complete the canonical TUI Goal journey",
      successCriteria: ["The Goal reaches a verified terminal state"],
      boundaries: ["Use the Product Surface"],
      constraints: ["Do not retain private Goal evidence"],
      stopPolicy: {
        maxAttempts: 1,
        maxConsecutiveBlockedAttempts: 1
      }
    })
    expect(parseTuiLineCommand(`goal-start ${request}`)).toEqual({
      kind: "command",
      name: "goal-start",
      input: {
        objective: "Complete the canonical TUI Goal journey",
        successCriteria: ["The Goal reaches a verified terminal state"],
        boundaries: ["Use the Product Surface"],
        constraints: ["Do not retain private Goal evidence"],
        stopPolicy: {
          maxAttempts: 1,
          maxConsecutiveBlockedAttempts: 1
        }
      }
    })
    expect(parseTuiLineCommand("goal-cancel   ")).toEqual({
      kind: "error",
      message: "goal-cancel requires a reason"
    })
    expect(parseTuiLineCommand("goal other")).toEqual({
      kind: "error",
      message: "goal does not accept arguments"
    })

    await withSurface(async ({ app, settlements, surface }) => {
      const sessionId = "ses_product_app_tui_goal"
      const settled = settlements.waitForSession(sessionId)
      await app.submitConversationOperation({
        sessionId,
        text: "seed canonical TUI Goal context"
      })
      await settled
      await app.selectSession({ sessionId })
      await surface.refresh()

      const chunks: string[] = []
      let resolveTerminal!: () => void
      const terminal = new Promise<void>((resolve) => {
        resolveTerminal = resolve
      })
      const input = (async function* (): AsyncIterable<string> {
        yield `goal-start ${request}`
        await terminal
        yield "goal"
        yield "quit"
      })()
      const result = await runTuiLineSession({
        surface,
        input,
        write(chunk) {
          chunks.push(chunk)
          if (
            chunk.includes("GOAL") &&
            /state:(limit_reached|succeeded|failed|cancelled)/.test(chunk)
          ) {
            resolveTerminal()
          }
        }
      })
      const output = chunks.join("\n")

      expect(result).toMatchObject({
        commandCount: 3,
        goalCommandCount: 2,
        errorCount: 0,
        quit: true,
        activeSessionId: sessionId
      })
      expect(output).toContain("GOAL")
      expect(output).toContain(`session:${sessionId}`)
      expect(output).toContain(
        "objective:Complete the canonical TUI Goal journey"
      )
      expect(output).toContain("criterion:1")
      expect(output).toContain("attempt:1")
      expect(output).not.toContain("executionBindingDigest")
      expect(output).not.toContain("verifierRef")
    })
  })

  it("parses TUI CLI commands", () => {
    expect(parseTuiCliCommand([])).toEqual({
      name: "overview",
      output: "text"
    })
    expect(parseTuiCliCommand(["overview", "--json"])).toEqual({
      name: "overview",
      output: "json"
    })
    expect(parseTuiCliCommand(["commands", "--json"])).toEqual({
      name: "commands",
      output: "json"
    })
    expect(parseTuiCliCommand(["events", "--limit", "3"])).toEqual({
      name: "events",
      output: "text",
      limit: 3
    })
    expect(() =>
      parseTuiCliCommand(["palette", "product.workbench.open"])
    ).toThrow("unknown TUI command: palette")
    expect(
      parseTuiCliCommand([
        "preview",
        "product.agent.submit",
        '{"text":"preview cli parse"}'
      ])
    ).toEqual({
      name: "preview",
      commandId: "product.agent.submit",
      input: {
        text: "preview cli parse"
      }
    })
    expect(parseTuiCliCommand(["execute", "product.status"])).toEqual(
      {
        name: "execute",
        commandId: "product.status"
      }
    )
    expect(
      parseTuiCliCommand(["execution", "job_cli_execution"])
    ).toEqual({
      name: "execution",
      jobId: "job_cli_execution"
    })
    expect(parseTuiCliCommand(["interactive"])).toEqual({
      name: "interactive"
    })
    expect(parseTuiCliCommand(["fullscreen"])).toEqual({
      name: "fullscreen"
    })
    expect(() =>
      parseTuiCliCommand(["preview", "product.agent.submit", "{"])
    ).toThrow("command input must be valid JSON")
    expect(() =>
      parseTuiCliCommand(["events", "--limit", "0"])
    ).toThrow("--limit must be a positive integer")
    expect(() =>
      parseTuiCliCommand(["interactive", "extra"])
    ).toThrow("interactive does not accept arguments")
    expect(() =>
      parseTuiCliCommand(["fullscreen", "extra"])
    ).toThrow("fullscreen does not accept arguments")
  })

  it("CLI overview renders text by default and JSON when requested", async () => {
    const env = await cliEnv()

    const text = await runTuiCli(["overview"], env)
    const json = await runTuiCli(["overview", "--json"], env)

    expect(text).toMatchObject({
      exitCode: 0,
      stderr: ""
    })
    expect(text.stdout).toContain("Workbench")
    expect(text.stdout).toContain("mode:chat")

    const parsed = JSON.parse(json.stdout) as {
      readonly ok: boolean
      readonly value: {
        readonly kind: string
        readonly ready: boolean
        readonly mode: string
        readonly statusCount: number
      }
    }
    expect(parsed).toMatchObject({
      ok: true,
      value: {
        kind: "tui.frame",
        ready: true,
        mode: "chat",
        statusCount: 8
      }
    })
  })

  it("CLI commands renders the typed product command catalog", async () => {
    const env = await cliEnv()

    const text = await runTuiCli(["commands"], env)
    const json = await runTuiCli(["commands", "--json"], env)

    expect(text).toMatchObject({
      exitCode: 0,
      stderr: ""
    })
    expect(text.stdout).toContain("Commands")
    expect(text.stdout).toContain("product.agent.submit - Submit Agent Turn")
    expect(text.stdout).toContain(
      "handler:wanex.product.backend.submitConversationOperation"
    )

    const parsed = JSON.parse(json.stdout) as {
      readonly ok: boolean
      readonly value: {
        readonly kind: string
        readonly ok: boolean
        readonly commandCount: number
        readonly commands: readonly { readonly id: string }[]
      }
    }
    expect(parsed).toMatchObject({
      ok: true,
      value: {
        kind: "tui.command-catalog",
        ok: true,
        commandCount: 14,
        commands: expect.arrayContaining([
          expect.objectContaining({ id: "product.agent.submit" })
        ])
      }
    })
  })

  it("CLI rejects the deleted static palette route", async () => {
    const env = await cliEnv()

    const result = await runTuiCli(
      ["palette", "product.status"],
      env
    )

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toBe("")
    expect(result.stderr).toContain("unknown TUI command: palette")
  })

  it("CLI preview command reads product command invocation policy without executing it", async () => {
    const env = await cliEnv()

    const result = await runTuiCli(
      ["preview", "product.agent.submit", '{"text":"preview cli"}'],
      env
    )

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toBe("")
    const parsed = JSON.parse(result.stdout) as {
      readonly ok: boolean
      readonly value: {
        readonly ok: boolean
        readonly command: string
        readonly value: {
          readonly kind: string
          readonly commandId: string
          readonly handlerRef: string
        }
      }
    }
    expect(parsed).toMatchObject({
      ok: true,
      value: {
        ok: true,
        command: "previewProductCommandInvocation",
        value: {
          kind: "runnable",
          commandId: "product.agent.submit"
        }
      }
    })
  })

  it("CLI execute command returns only the bounded product summary", async () => {
    const env = await cliEnv()
    const result = await runTuiCli(["execute", "product.status"], env)

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toBe("")
    const parsed = JSON.parse(result.stdout) as {
      readonly value: Readonly<Record<string, unknown>>
    }
    expect(parsed).toMatchObject({
      ok: true,
      value: {
        kind: "completed",
        commandId: "product.status",
        handlerRef: "wanex.product.backend.status",
        summary: {
          valueKind: "object",
          message: "Command completed",
          references: []
        }
      }
    })
    expect(parsed.value).not.toHaveProperty("value")
  })

  it("CLI events and interactive commands run over TUI host lifecycle", async () => {
    const env = await cliEnv()
    const chunks: string[] = []

    const interactive = await runTuiCli(["interactive"], env, {
      input: lines(["ask hello from TUI CLI", "events 6", "quit"]),
      write(chunk) {
        chunks.push(chunk)
      }
    })
    const events = await runTuiCli(["events", "--json"], env)
    const output = chunks.join("")

    expect(interactive).toEqual({
      exitCode: 0,
      stdout: "",
      stderr: ""
    })
    expect(output).toContain("Workbench")
    expect(output).toContain("Conversation")
    expect(output).toContain("Events")
    expect(output).toContain("bye")

    const parsed = JSON.parse(events.stdout) as {
      readonly ok: boolean
      readonly value: {
        readonly kind: string
        readonly ok: boolean
        readonly eventCount: number
      }
    }
    expect(parsed).toMatchObject({
      ok: true,
      value: {
        kind: "tui.events",
        ok: true
      }
    })
  })

  it("runs a real Provider conversation through the trusted interactive CLI composition", async () => {
    const assistantText = "canonical real Provider reply in TUI"
    const userText = "hello through the trusted TUI composition"
    const secretRef = "env://WANEX_TUI_REAL_PROVIDER_KEY"
    const secretValue = "product-tui-real-provider-secret"
    const provider = await listenTuiConversationProvider(assistantText)
    const env = await realProviderCliEnv({
      baseUrl: provider.baseUrl,
      secretRef,
      secretValue
    })
    const chunks: string[] = []
    let resolveCanonicalOutput!: () => void
    const canonicalOutput = new Promise<void>((resolve) => {
      resolveCanonicalOutput = resolve
    })
    const input = (async function* (): AsyncIterable<string> {
      yield `ask ${userText}`
      await withTestTimeout(canonicalOutput, "interactive canonical Provider reply")
      yield "quit"
    })()

    const result = await runTuiCli(["interactive"], env, {
      input,
      write(chunk) {
        chunks.push(chunk)
        if (chunks.join("").includes(`assistant:${assistantText}`)) {
          resolveCanonicalOutput()
        }
      }
    })
    const output = chunks.join("")

    expect(result).toEqual({ exitCode: 0, stdout: "", stderr: "" })
    expect(provider.requests).toHaveLength(1)
    expect(provider.requests[0]).toMatchObject({
      authorization: `Bearer ${secretValue}`,
      body: {
        model: "product-tui-real-provider-model",
        messages: expect.arrayContaining([
          expect.objectContaining({ role: "user", content: userText })
        ])
      }
    })
    expect(output).toContain(`assistant:${assistantText}`)
    expect(output).toContain("state:succeeded")
    expect(output).toContain("bye")
    expectTrustedTuiOutput(output, {
      env,
      secretRef,
      secretValue
    })
  })

  it("runs and aborts a real Provider full-screen CLI with bounded terminal cleanup", async () => {
    const assistantText = "canonical full-screen real Provider reply"
    const userText = "hello from the installed full-screen TUI"
    const secretRef = "env://WANEX_TUI_FULLSCREEN_PROVIDER_KEY"
    const secretValue = "product-tui-fullscreen-provider-secret"
    const provider = await listenTuiConversationProvider(assistantText)
    const env = await realProviderCliEnv({
      baseUrl: provider.baseUrl,
      secretRef,
      secretValue
    })
    const terminal = new TuiVirtualTerminal(96, 26)
    const shutdown = new AbortController()
    const resultPromise = runTuiCli(["fullscreen"], env, {
      signal: shutdown.signal,
      fullScreenTerminal: terminal
    })

    await waitForTuiCondition(
      async () => (await terminal.text()).includes("Wanex"),
      "full-screen TUI startup"
    )
    terminal.sendInput(userText)
    terminal.sendInput("\r")
    await waitForTuiCondition(
      async () => (await terminal.text()).includes(assistantText),
      "full-screen canonical Provider reply"
    )
    expect(provider.requests).toHaveLength(1)
    expect(provider.requests[0]).toMatchObject({
      authorization: `Bearer ${secretValue}`,
      body: {
        model: "product-tui-real-provider-model",
        messages: expect.arrayContaining([
          expect.objectContaining({ role: "user", content: userText })
        ])
      }
    })

    shutdown.abort(new Error("TUI full-screen acceptance shutdown"))
    const result = await withTestTimeout(
      resultPromise,
      "full-screen trusted composition shutdown"
    )
    const output = await terminal.text()

    expect(result).toEqual({ exitCode: 0, stdout: "", stderr: "" })
    expect(output).toContain(assistantText)
    expect(terminal.lifecycle()).toEqual({
      active: false,
      drainCount: 1,
      stopCount: 1
    })
    expectTrustedTuiOutput(output, {
      env,
      secretRef,
      secretValue
    })
  })

  it("CLI reports safe JSON errors for invalid commands", async () => {
    const env = await cliEnv()

    const result = await runTuiCli(["missing"], env)

    expect(result).toMatchObject({
      exitCode: 1,
      stdout: ""
    })
    expect(JSON.parse(result.stderr)).toEqual({
      ok: false,
      error: {
        message: "unknown TUI command: missing"
      }
    })
  })

  it("reads execution activity through the one-shot CLI", async () => {
    const env = await cliEnv()
    const settlementFixture = createTuiConversationSettlementFixture({
      storeDir: env.WANEX_STORE_DIR as string,
      serviceBin: env.WANEX_SYSTEM_SERVICE_BIN as string
    })
    try {
      const seed = await createShell({
        storage: settlementFixture.storage,
        modelEndpoint: tuiModelEndpoint({
          endpointId: env.WANEX_MODEL_ENDPOINT_ID as string,
          modelId: env.WANEX_PROVIDER_MODEL_ID as string
        })
      })
      try {
        const jobSettled = settlementFixture.settlements.waitForJob(
          "job_tui_cli_execution"
        )
        await seed.dispatchProductCommand({
          command: "submitConversationOperation",
          input: {
            text: "seed one-shot execution activity",
            sessionId: "ses_tui_cli_execution",
            jobId: "job_tui_cli_execution"
          }
        })
        await jobSettled
      } finally {
        await seed.dispose()
      }
    } finally {
      await settlementFixture.dispose()
    }

    const result = await runTuiCli(
      ["execution", "job_tui_cli_execution"],
      env
    )

    expect(result).toMatchObject({ exitCode: 0, stderr: "" })
    expect(result.stdout).toContain("Execution activity")
    expect(result.stdout).toContain("state:succeeded")
    expect(result.stdout).toContain("jobKind:session.turn")
  })
})

async function withSurface(
  test: (request: {
    readonly app: Shell
    readonly settlements: TuiConversationSettlementObserver
    readonly surface: TuiSurface
  }) => Promise<void>,
  options: Omit<
    Partial<Parameters<typeof createShell>[0]>,
    "artifacts" | "storage"
  > = {}
): Promise<void> {
  const storeDir = await createStoreDir()
  const settlementFixture = createTuiConversationSettlementFixture({
    storeDir,
    serviceBin
  })
  try {
    const app = await createShell({
      modelEndpoint: tuiModelEndpoint({
        endpointId: "tui-test",
        modelId: "tui-test-model"
      }),
      ...options,
      storage: settlementFixture.storage
    })
    try {
      const productSurface = createSurfaceAdapter(app, {
        now: () => 11_111
      })
      try {
        const client = createSurfaceClient(
          createInProcessSurfaceClientTransport(productSurface)
        )
        const surface = await createTuiSurface({
          client,
          now: () => 10_101
        })
        await test({
          app,
          settlements: settlementFixture.settlements,
          surface
        })
      } finally {
        await productSurface.dispose()
      }
    } finally {
      await app.dispose()
    }
  } finally {
    await settlementFixture.dispose()
  }
}

async function createStoreDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "wanex-tui-test-"))
  tempDirs.push(dir)
  return dir
}

async function cliEnv(): Promise<TuiCliEnvironment> {
  return {
    WANEX_STORE_DIR: await createStoreDir(),
    WANEX_SYSTEM_SERVICE_BIN: serviceBin,
    WANEX_MODEL_ENDPOINT_ID: "tui-cli-test",
    WANEX_PROVIDER_PROTOCOL: "fake",
    WANEX_PROVIDER_ID: "fake",
    WANEX_PROVIDER_MODEL_ID: "tui-cli-model"
  }
}

async function realProviderCliEnv(options: {
  readonly baseUrl: string
  readonly secretRef: string
  readonly secretValue: string
}): Promise<TuiCliEnvironment> {
  const secretName = new URL(options.secretRef).hostname
  return {
    WANEX_STORE_DIR: await createStoreDir(),
    WANEX_SYSTEM_SERVICE_BIN: serviceBin,
    WANEX_MODEL_ENDPOINT_ID: "product-tui-real-provider",
    WANEX_PROVIDER_CONNECTION_ID: "product-tui-real-provider-connection",
    WANEX_PROVIDER_PROTOCOL: "openai-chat-completions",
    WANEX_PROVIDER_ID: "openai-compatible",
    WANEX_PROVIDER_BASE_URL: options.baseUrl,
    WANEX_PROVIDER_SECRET_REF: options.secretRef,
    WANEX_PROVIDER_MODEL_ID: "product-tui-real-provider-model",
    WANEX_MODEL_OPERATIONS: "conversation",
    WANEX_MODEL_INPUT_MODALITIES: "text",
    WANEX_MODEL_OUTPUT_MODALITIES: "text",
    [secretName]: options.secretValue
  }
}

async function listenTuiConversationProvider(
  assistantText: string
): Promise<{
  readonly baseUrl: string
  readonly requests: Array<{
    readonly authorization: string
    readonly body: unknown
  }>
}> {
  const requests: Array<{
    readonly authorization: string
    readonly body: unknown
  }> = []
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    requests.push({
      authorization: request.headers.authorization ?? "",
      body: JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown
    })
    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache"
    })
    response.end([
      `data: ${JSON.stringify({
        choices: [{ delta: { content: assistantText }, finish_reason: null }]
      })}\n\n`,
      `data: ${JSON.stringify({
        choices: [{ delta: {}, finish_reason: "stop" }]
      })}\n\n`,
      "data: [DONE]\n\n"
    ].join(""))
  })
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  servers.push(server)
  const address = server.address()
  if (address === null || typeof address === "string") {
    throw new Error("TUI Provider fixture did not expose a TCP address")
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    requests
  }
}

function expectTrustedTuiOutput(
  output: string,
  options: {
    readonly env: TuiCliEnvironment
    readonly secretRef: string
    readonly secretValue: string
  }
): void {
  for (const sensitiveValue of [
    options.secretRef,
    options.secretValue,
    options.env.WANEX_STORE_DIR,
    options.env.WANEX_SYSTEM_SERVICE_BIN,
    "authorization",
    "namespace",
    "jobId",
    "attemptId",
    "providerInvocationId",
    "toolExecutionId"
  ]) {
    if (sensitiveValue !== undefined) {
      expect(output).not.toContain(sensitiveValue)
    }
  }
}

async function waitForTuiCondition(
  condition: () => boolean | Promise<boolean>,
  description: string
): Promise<void> {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    if (await condition()) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`timed out waiting for ${description}`)
}

async function withTestTimeout<T>(
  value: Promise<T>,
  description: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      value,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`timed out waiting for ${description}`)),
          5_000
        )
      })
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

function tuiModelEndpoint(options: {
  readonly endpointId: string
  readonly modelId: string
  readonly protocolId?: string
  readonly providerId?: string
  readonly baseUrl?: string
  readonly secretRef?: string
}) {
  const protocolId = options.protocolId ?? "fake"
  const baseUrl = options.baseUrl ??
    (protocolId === "fake" ? undefined : "https://provider.example.test/v1")
  return {
    id: options.endpointId,
    connection: {
      id: `connection_${options.endpointId}`,
      providerId: options.providerId ?? "fake",
      ...(baseUrl === undefined ? {} : { baseUrl }),
      ...(options.secretRef === undefined ? {} : { secretRef: options.secretRef })
    },
    protocol: { id: protocolId },
    model: {
      id: options.modelId,
      operations: ["conversation" as const],
      inputModalities: ["text" as const],
      outputModalities: ["text" as const],
      features: [],
      catalog: {
        source: "custom" as const,
        catalogId: `test.${options.modelId}`,
        revision: "1"
      }
    }
  }
}

async function* lines(values: readonly string[]): AsyncIterable<string> {
  for (const value of values) {
    yield value
  }
}

async function waitForTrackedConversationOperation(
  app: Shell,
  sessionId: string
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await app.readTrackedConversationOperation({ sessionId })
    if (
      result.kind === "product.conversation-operation.found" &&
      result.operation.state !== "running" &&
      result.operation.state !== "queued"
    ) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error("TUI Plan execution did not settle")
}

async function listenTuiPlanProvider(): Promise<{ readonly baseUrl: string }> {
  let requestCount = 0
  const server = createServer(async (request, response) => {
    for await (const _chunk of request) {
      // Consume request bytes before replying.
    }
    requestCount += 1
    const content =
      requestCount === 2
        ? JSON.stringify({
            title: "Canonical TUI Plan",
            summary: "Review and execute through the Product Surface",
            steps: [{ id: "execute", title: "Execute canonically" }]
          })
        : requestCount === 1
          ? "Seeded canonical TUI Plan context"
          : "Canonical TUI Plan execution completed"
    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache"
    })
    response.end(
      [
        `data: ${JSON.stringify({
          choices: [{ delta: { content }, finish_reason: null }]
        })}\n\n`,
        `data: ${JSON.stringify({
          choices: [{ delta: {}, finish_reason: "stop" }]
        })}\n\n`,
        "data: [DONE]\n\n"
      ].join("")
    )
  })
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  servers.push(server)
  const address = server.address()
  if (address === null || typeof address === "string") {
    throw new Error("TUI Plan Provider fixture did not expose an address")
  }
  return { baseUrl: `http://127.0.0.1:${address.port}/v1` }
}

function createTuiPlanSecretResolver() {
  return {
    async resolve(ref: string) {
      let disposed = false
      return {
        ref,
        provider: "tui-test",
        get disposed() {
          return disposed
        },
        reveal() {
          if (disposed) throw new Error("test secret was disposed")
          return "tui-test-key"
        },
        dispose() {
          disposed = true
        },
        toJSON(): never {
          throw new Error("test secret cannot be serialized")
        }
      }
    }
  }
}

async function closeServer(server: Server): Promise<void> {
  server.closeAllConnections()
  if (!server.listening) return
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) resolve()
      else reject(error)
    })
  })
}
