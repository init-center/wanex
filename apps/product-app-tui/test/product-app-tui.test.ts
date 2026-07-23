import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  resolveAppExtensionContributions,
  type AppCommandContribution
} from "@wanex/extension"
import {
  createProductAppShell,
  createProductAppSurfaceAdapter,
  type ProductAppShell
} from "@wanex/product-app"
import {
  createInProcessProductAppSurfaceClientTransport,
  createProductAppSurfaceClient
} from "@wanex/product-app/surface-client"
import {
  PRODUCT_APP_TUI_COMMANDS,
  createProductAppTuiHostSurfaceClient,
  createProductAppTuiSurface,
  main as runProductAppTuiCli,
  parseProductAppTuiCliCommand,
  renderProductAppTuiCommandCatalog,
  renderProductAppTuiExecutionActivity,
  renderProductAppTuiFrame,
  runProductAppTuiLineSession,
  type ProductAppTuiCliEnvironment,
  type ProductAppTuiSurface
} from "../src/index.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)

const tempDirs: string[] = []

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

describe("@wanex/product-app-tui", () => {
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
        handlerRef: "wanex.plugin-action:plugin.tui-guided/preview",
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
          renderProductAppTuiCommandCatalog(
            surface.snapshot().commandCatalog
          ).text
        ).toContain("input:schema required:count,text")
        const chunks: string[] = []
        const result = await runProductAppTuiLineSession({
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
        expect(chunks.join("\n")).toContain("Wanex Product App Command Preview")
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
          snapshot: resolveAppExtensionContributions([contribution])
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
              return { kind: "plugin-action.submitted", jobId: "job_tui_guided" }
            }
          }
        }
      }
    )
  })

  it("renders bounded execution activity states", () => {
    expect(
      renderProductAppTuiExecutionActivity({
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
      renderProductAppTuiExecutionActivity({
        kind: "missing",
        reference: { kind: "job", id: "job_missing" }
      }).state
    ).toBe("missing")
  })

  it("reads execution activity from the interactive line session", async () => {
    await withSurface(async ({ app, surface }) => {
      await app.dispatchProductCommand({
        command: "submitConversationOperation",
        input: {
          text: "seed TUI execution activity",
          sessionId: "ses_tui_execution_activity",
          jobId: "job_tui_execution_activity"
        }
      })
      await waitForJob(app, "job_tui_execution_activity")
      const chunks: string[] = []
      const result = await runProductAppTuiLineSession({
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
      expect(chunks.join("")).toContain(
        "Wanex Product App Execution Activity"
      )
      expect(chunks.join("")).toContain("state:succeeded")
    })
  })

  it("projects Product App state into a TUI read model and rendered frame", async () => {
    await withSurface(async ({ surface }) => {
      const snapshot = surface.snapshot()
      const frame = renderProductAppTuiFrame(snapshot)

      expect(snapshot).toMatchObject({
        kind: "product-app-tui.snapshot",
        descriptor: {
          ok: true,
          value: {
            kind: "product-app.surface-descriptor",
            commandCount: 23
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
            kind: "product-app.home"
          }
        },
        settings: {
          ok: true,
          value: {
            kind: "product-app.settings",
            profile: {
              activeProviderProfileId: "product-app-tui-test"
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
      expect(snapshot.readModel.palette.map((entry) => entry.id)).toEqual([
        "product-app-tui.palette.refresh",
        "product-app-tui.palette.status",
        "product-app-tui.palette.home-read",
        "product-app-tui.palette.session-select",
        "product-app-tui.palette.workbench-open",
        "product-app-tui.palette.conversation-submit",
        "product-app-tui.palette.conversation-read",
        "product-app-tui.palette.conversation-cancel",
        "product-app-tui.palette.conversation-regenerate"
      ])
      expect(snapshot.readModel.statusItems.map((item) => item.label)).toEqual([
        "ready",
        "mode:chat",
        "layout:single",
        "profile:product-app-tui-test",
        "provider:ready",
        "theme:system",
        "density:comfortable",
        "session:none"
      ])
      expect(frame).toMatchObject({
        kind: "product-app-tui.frame",
        ready: true,
        mode: "chat",
        layout: "single",
        commandCount: 23,
        productCommandCount: 14,
        paletteCount: 9,
        statusItemCount: 8
      })
      expect(frame.text).toContain("Wanex Product App TUI")
      expect(frame.text).toContain("profile:product-app-tui-test")
      expect(frame.text).toContain("provider:ready")
      expect(frame.text).toContain("theme:system")
      expect(frame.text).toContain("product-commands:14")
      expect(frame.text).toContain("product-app.conversation.submit")
      expect(frame.text).toContain("... 1 more")
    })
  })

  it("executes TUI commands through the Product App surface client", async () => {
    await withSurface(async ({ app, surface }) => {
      const submitted = await surface.controller.executePaletteEntry({
        id: "product-app-tui.palette.conversation-submit",
        input: {
          text: "product app tui first turn",
          sessionId: "ses_product_app_tui"
        }
      })
      expect(submitted).toMatchObject({
        status: "completed",
        value: {
          kind: "product-app-tui.command.completed",
          commandId: PRODUCT_APP_TUI_COMMANDS.submitConversation,
          value: {
            ok: true,
            command: "submitConversationOperation",
            value: {
              kind: "product-app.conversation-operation.found",
              operation: { sessionId: "ses_product_app_tui" }
            }
          }
        }
      })
      await waitForConversation(app, "ses_product_app_tui")

      const selected = await surface.controller.executePaletteEntry({
        id: "product-app-tui.palette.session-select",
        input: {
          sessionId: "ses_product_app_tui"
        }
      })
      expect(selected).toMatchObject({
        status: "completed",
        invocation: {
          commandId: PRODUCT_APP_TUI_COMMANDS.selectSession
        },
        value: {
          kind: "product-app-tui.command.completed",
          commandId: PRODUCT_APP_TUI_COMMANDS.selectSession,
          mutatesState: true
        }
      })

      const read = await surface.controller.executePaletteEntry({
        id: "product-app-tui.palette.conversation-read",
        input: { sessionId: "ses_product_app_tui" }
      })
      expect(read).toMatchObject({
        status: "completed",
        value: {
          kind: "product-app-tui.command.completed",
          commandId: PRODUCT_APP_TUI_COMMANDS.readConversationOperation,
          value: {
            ok: true,
            command: "readTrackedConversationOperation",
            value: {
              kind: "product-app.conversation-operation.found",
              operation: {
                sessionId: "ses_product_app_tui",
                state: "succeeded"
              }
            }
          }
        }
      })

      const opened = await surface.controller.executePaletteEntry({
        id: "product-app-tui.palette.workbench-open"
      })
      expect(opened).toMatchObject({
        status: "completed",
        value: {
          kind: "product-app-tui.command.completed",
          commandId: PRODUCT_APP_TUI_COMMANDS.openWorkbench
        }
      })

      const regenerated = await surface.controller.executePaletteEntry({
        id: "product-app-tui.palette.conversation-regenerate",
        input: { sessionId: "ses_product_app_tui" }
      })
      expect(regenerated).toMatchObject({
        status: "completed",
        value: {
          kind: "product-app-tui.command.completed",
          commandId: PRODUCT_APP_TUI_COMMANDS.regenerateConversation,
          value: {
            ok: true,
            command: "regenerateTrackedConversationOperation"
          }
        }
      })

      const cancelled = await surface.controller.executePaletteEntry({
        id: "product-app-tui.palette.conversation-cancel",
        input: { reason: "TUI test cancellation" }
      })
      expect(cancelled).toMatchObject({
        status: "completed",
        value: {
          kind: "product-app-tui.command.completed",
          commandId: PRODUCT_APP_TUI_COMMANDS.cancelConversation,
          value: {
            ok: true,
            command: "cancelTrackedConversationOperation"
          }
        }
      })

      const snapshot = await surface.refresh()
      expect(snapshot.status).toMatchObject({
        ok: true,
        value: {
          state: {
            selectedSessionId: "ses_product_app_tui"
          }
        }
      })
      expect(snapshot.events).toMatchObject({
        ok: true,
        events: expect.arrayContaining([
          expect.objectContaining({
            type: "product-app.surface.state_changed",
            command: "regenerateTrackedConversationOperation"
          })
        ])
      })
    })
  })

  it("projects provider run gate failures through TUI command execution", async () => {
    await withSurface(
      async ({ surface }) => {
        const submitted = await surface.controller.executePaletteEntry({
          id: "product-app-tui.palette.conversation-submit",
          input: {
            text: "tui should not bypass provider setup"
          }
        })
        expect(submitted).toMatchObject({
          status: "completed",
          value: {
            kind: "product-app-tui.command.completed",
            commandId: PRODUCT_APP_TUI_COMMANDS.submitConversation,
            value: {
              ok: true,
              command: "submitConversationOperation",
              value: {
                kind: "product-app.conversation-operation.rejected"
              }
            }
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
        expect(renderProductAppTuiFrame(snapshot).text).toContain(
          "provider:missing_required_credential"
        )

        const chunks: string[] = []
        const lineResult = await runProductAppTuiLineSession({
          surface,
          input: lines([
            "ask tui ask should not bypass provider setup",
            "preview product.agent.submit {\"text\":\"preview should not bypass provider setup\"}",
            "execute product.agent.submit {\"text\":\"execute should not bypass provider setup\"}",
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
        expect(output).toContain("Wanex Product App Conversation")
        expect(output).toContain("state:rejected")
        expect(output).toContain("provider is not ready")
        expect(output).toContain("Wanex Product App Command Preview")
        expect(output).toContain("status:rejected")
        expect(output).toContain("reason:provider_not_ready")
        expect(output).toContain("provider:missing_required_credential")
        expect(output).toContain("canRun:no")
        expect(output).toContain("Wanex Product App Command Execution")
      },
      {
        providerProfile: {
          id: "product-app-tui-blocked-provider",
          kind: "openai-compatible",
          capabilities: { input: ["text"], output: ["text"] },
          providerId: "openai-compatible",
          modelId: "product-app-tui-blocked-model"
        }
      }
    )
  })

  it("creates its host surface client through the Product App message transport", async () => {
    const storeDir = await createStoreDir()
    const app = await createProductAppShell({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      },
      providerProfile: {
        id: "product-app-tui-host-test",
        modelId: "product-app-tui-host-test-model"
      }
    })
    const productSurface = createProductAppSurfaceAdapter(app)
    try {
      const operations: string[] = []
      const client = createProductAppTuiHostSurfaceClient({
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
          kind: "product-app.surface-descriptor",
          commandCount: 23
        }
      })
      expect(status).toMatchObject({
        ok: true,
        event: {
          requestId: "req_tui_host_status"
        },
        value: {
          kind: "product-app.status"
        }
      })
      expect(events).toMatchObject({
        ok: true,
        events: [
          expect.objectContaining({
            type: "product-app.surface.command_completed",
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
    const client = createProductAppSurfaceClient({
      descriptor: () => ({ broken: true }) as never,
      dispatchSurfaceCommand: () => ({ ok: true, command: "status" }) as never,
      readSurfaceEvents: () => [{ missing: "event fields" }] as never
    })
    const surface = await createProductAppTuiSurface({
      client,
      now: () => 12_345
    })

    const snapshot = surface.snapshot()
    const frame = renderProductAppTuiFrame(snapshot)

    expect(snapshot.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "product-app-tui.descriptor_failed",
      "product-app-tui.status_failed",
      "product-app-tui.home_failed",
      "product-app-tui.settings_failed",
      "product-app-tui.command_catalog_failed",
      "product-app-tui.conversation_failed",
      "product-app-tui.events_failed"
    ])
    expect(snapshot.readModel.notifications).toHaveLength(1)
    expect(frame).toMatchObject({
      ready: false,
      diagnosticCount: 7,
      eventCount: 0
    })
    expect(frame.text).not.toContain("Error:")
  })

  it("runs an injected line session through the Product App surface client", async () => {
    await withSurface(async ({ app, surface }) => {
      await app.submitConversationOperation({
        text: "seed product app tui line session",
        sessionId: "ses_product_app_tui_line"
      })
      await waitForConversation(app, "ses_product_app_tui_line")
      await surface.refresh()
      const chunks: string[] = []
      const result = await runProductAppTuiLineSession({
        surface,
        input: lines([
          "help",
          "operation",
          "workbench",
          "regenerate",
          "cancel stop regenerated turn",
          "events 5",
          "commands",
          "palette",
          "palette product-app.workbench.open",
          "preview product.agent.submit {\"text\":\"preview through product app tui line\"}",
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
        kind: "product-app-tui.line-session",
        handledLineCount: 13,
        commandCount: 13,
        askCommandCount: 0,
        workbenchCommandCount: 1,
        operationCommandCount: 1,
        cancelCommandCount: 1,
        regenerateCommandCount: 1,
        paletteCommandCount: 1,
        catalogCommandCount: 1,
        previewCommandCount: 1,
        executeCommandCount: 1,
        eventsCommandCount: 1,
        blockedCommandCount: 0,
        errorCount: 0,
        quit: true
      })
      expect(result.activeSessionId).toBe("ses_product_app_tui_line")
      expect(output).toContain("Wanex Product App TUI")
      expect(output).toContain("Type help for commands.")
      expect(output).toContain("palette <index|palette-id|command-id> [json-input]")
      expect(output).toContain("Wanex Product App Conversation")
      expect(output).toContain("state:succeeded")
      expect(output).toContain("Wanex Product App Workbench")
      expect(output).toContain("regenerate:enabled")
      expect(output).toContain("cancel:")
      expect(output).toContain("Wanex Product App Surface Events")
      expect(output).toContain("Wanex Product App Commands")
      expect(output).toContain("product.agent.submit - Submit Agent Turn")
      expect(output).toContain("source:builtin/")
      expect(output).toContain("Palette:")
      expect(output).toContain("product-app.workbench.open")
      expect(output).toContain("\"status\": \"completed\"")
      expect(output).toContain("Wanex Product App Command Preview")
      expect(output).toContain("status:runnable")
      expect(output).toContain("Wanex Product App Command Execution")
      expect(output).toContain("command:product.status")
      expect(output).toContain("valueKind:object")
      expect(output).toContain("command:product.agent.submit")
      expect(output).toContain("input:accepted")
      expect(output).toContain("refreshed")
      expect(output).toContain("bye")
    })
  })

  it("parses Product App TUI CLI commands", () => {
    expect(parseProductAppTuiCliCommand([])).toEqual({
      name: "overview",
      output: "text"
    })
    expect(parseProductAppTuiCliCommand(["overview", "--json"])).toEqual({
      name: "overview",
      output: "json"
    })
    expect(parseProductAppTuiCliCommand(["commands", "--json"])).toEqual({
      name: "commands",
      output: "json"
    })
    expect(parseProductAppTuiCliCommand(["events", "--limit", "3"])).toEqual({
      name: "events",
      output: "text",
      limit: 3
    })
    expect(
      parseProductAppTuiCliCommand([
        "palette",
        "product-app.workbench.open",
        "{\"sessionId\":\"ses_cli_parse\"}"
      ])
    ).toEqual({
      name: "palette",
      paletteSelector: "product-app.workbench.open",
      input: {
        sessionId: "ses_cli_parse"
      }
    })
    expect(
      parseProductAppTuiCliCommand([
        "preview",
        "product.agent.submit",
        "{\"text\":\"preview cli parse\"}"
      ])
    ).toEqual({
      name: "preview",
      commandId: "product.agent.submit",
      input: {
        text: "preview cli parse"
      }
    })
    expect(
      parseProductAppTuiCliCommand(["execute", "product.status"])
    ).toEqual({
      name: "execute",
      commandId: "product.status"
    })
    expect(
      parseProductAppTuiCliCommand(["execution", "job_cli_execution"])
    ).toEqual({
      name: "execution",
      jobId: "job_cli_execution"
    })
    expect(parseProductAppTuiCliCommand(["interactive"])).toEqual({
      name: "interactive"
    })
    expect(() =>
      parseProductAppTuiCliCommand(["preview", "product.agent.submit", "{"])
    ).toThrow("command input must be valid JSON")
    expect(() =>
      parseProductAppTuiCliCommand(["events", "--limit", "0"])
    ).toThrow("--limit must be a positive integer")
    expect(() =>
      parseProductAppTuiCliCommand(["interactive", "extra"])
    ).toThrow("interactive does not accept arguments")
  })

  it("CLI overview renders text by default and JSON when requested", async () => {
    const env = await cliEnv()

    const text = await runProductAppTuiCli(["overview"], env)
    const json = await runProductAppTuiCli(["overview", "--json"], env)

    expect(text).toMatchObject({
      exitCode: 0,
      stderr: ""
    })
    expect(text.stdout).toContain("Wanex Product App TUI")
    expect(text.stdout).toContain("mode:chat")

    const parsed = JSON.parse(json.stdout) as {
      readonly ok: boolean
      readonly value: {
        readonly kind: string
        readonly ready: boolean
        readonly mode: string
        readonly paletteCount: number
      }
    }
    expect(parsed).toMatchObject({
      ok: true,
      value: {
        kind: "product-app-tui.frame",
        ready: true,
        mode: "chat",
        paletteCount: 9
      }
    })
  })

  it("CLI commands renders the typed Product App command catalog", async () => {
    const env = await cliEnv()

    const text = await runProductAppTuiCli(["commands"], env)
    const json = await runProductAppTuiCli(["commands", "--json"], env)

    expect(text).toMatchObject({
      exitCode: 0,
      stderr: ""
    })
    expect(text.stdout).toContain("Wanex Product App Commands")
    expect(text.stdout).toContain("product.agent.submit - Submit Agent Turn")
    expect(text.stdout).toContain("handler:wanex.product-app.backend.submitConversationOperation")

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
        kind: "product-app-tui.command-catalog",
        ok: true,
        commandCount: 14,
        commands: expect.arrayContaining([
          expect.objectContaining({ id: "product.agent.submit" })
        ])
      }
    })
  })

  it("CLI palette command dispatches through the Product App TUI controller", async () => {
    const env = await cliEnv()

    const result = await runProductAppTuiCli(
      ["palette", "product-app.status"],
      env
    )

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toBe("")
    const parsed = JSON.parse(result.stdout) as {
      readonly ok: boolean
      readonly value: {
        readonly status: string
        readonly value: {
          readonly kind: string
          readonly commandId: string
          readonly value: {
            readonly ok: boolean
            readonly value: {
              readonly kind: string
            }
          }
        }
      }
    }
    expect(parsed).toMatchObject({
      ok: true,
      value: {
        status: "completed",
        value: {
          kind: "product-app-tui.command.completed",
          commandId: PRODUCT_APP_TUI_COMMANDS.status,
          value: {
            ok: true,
            value: {
              kind: "product-app.status"
            }
          }
        }
      }
    })
  })

  it("CLI preview command reads Product App command invocation policy without executing it", async () => {
    const env = await cliEnv()

    const result = await runProductAppTuiCli(
      ["preview", "product.agent.submit", "{\"text\":\"preview cli\"}"],
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

  it("CLI execute command returns only the bounded Product App summary", async () => {
    const env = await cliEnv()
    const result = await runProductAppTuiCli(["execute", "product.status"], env)

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
        handlerRef: "wanex.product-app.backend.status",
        summary: {
          valueKind: "object",
          message: "Command completed",
          references: []
        }
      }
    })
    expect(parsed.value).not.toHaveProperty("value")
  })

  it("CLI events and interactive commands run over Product App TUI host lifecycle", async () => {
    const env = await cliEnv()
    const chunks: string[] = []

    const interactive = await runProductAppTuiCli(
      ["interactive"],
      env,
      {
        input: lines([
          "ask hello from Product App TUI CLI",
          "events 6",
          "quit"
        ]),
        write(chunk) {
          chunks.push(chunk)
        }
      }
    )
    const events = await runProductAppTuiCli(["events", "--json"], env)
    const output = chunks.join("")

    expect(interactive).toEqual({
      exitCode: 0,
      stdout: "",
      stderr: ""
    })
    expect(output).toContain("Wanex Product App TUI")
    expect(output).toContain("Wanex Product App Conversation")
    expect(output).toContain("Wanex Product App Surface Events")
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
        kind: "product-app-tui.events",
        ok: true
      }
    })
  })

  it("CLI reports safe JSON errors for invalid commands", async () => {
    const env = await cliEnv()

    const result = await runProductAppTuiCli(["missing"], env)

    expect(result).toMatchObject({
      exitCode: 1,
      stdout: ""
    })
    expect(JSON.parse(result.stderr)).toEqual({
      ok: false,
      error: {
        message: "unknown Product App TUI command: missing"
      }
    })
  })

  it("reads execution activity through the one-shot CLI", async () => {
    const env = await cliEnv()
    const seed = await createProductAppShell({
      storage: {
        kind: "local-system-service",
        storeDir: env.WANEX_STORE_DIR as string
      },
      artifacts: {
        explicitPath: env.WANEX_SYSTEM_SERVICE_BIN as string
      },
      providerProfile: {
        id: env.WANEX_PROVIDER_PROFILE_ID as string,
        modelId: env.WANEX_PROVIDER_MODEL_ID as string
      }
    })
    try {
      await seed.dispatchProductCommand({
        command: "submitConversationOperation",
        input: {
          text: "seed one-shot execution activity",
          sessionId: "ses_tui_cli_execution",
          jobId: "job_tui_cli_execution"
        }
      })
      await waitForJob(seed, "job_tui_cli_execution")
    } finally {
      await seed.dispose()
    }

    const result = await runProductAppTuiCli(
      ["execution", "job_tui_cli_execution"],
      env
    )

    expect(result).toMatchObject({ exitCode: 0, stderr: "" })
    expect(result.stdout).toContain("Wanex Product App Execution Activity")
    expect(result.stdout).toContain("state:succeeded")
    expect(result.stdout).toContain("jobKind:session.turn")
  })
})

async function withSurface(
  test: (request: {
    readonly app: ProductAppShell
    readonly surface: ProductAppTuiSurface
  }) => Promise<void>,
  options: Partial<Parameters<typeof createProductAppShell>[0]> = {}
): Promise<void> {
  const storeDir = await createStoreDir()
  const app = await createProductAppShell({
    storage: {
      kind: "local-system-service",
      storeDir
    },
    artifacts: {
      explicitPath: serviceBin
    },
    providerProfile: {
      id: "product-app-tui-test",
      modelId: "product-app-tui-test-model"
    },
    ...options
  })
  const productSurface = createProductAppSurfaceAdapter(app, {
      now: () => 11_111
  })
  try {
    const client = createProductAppSurfaceClient(
      createInProcessProductAppSurfaceClientTransport(productSurface)
    )
    const surface = await createProductAppTuiSurface({
      client,
      now: () => 10_101
    })
    await test({ app, surface })
  } finally {
    await productSurface.dispose()
    await app.dispose()
  }
}

async function waitForConversation(
  app: ProductAppShell,
  sessionId: string
): Promise<void> {
  const deadline = Date.now() + 2_000
  while (Date.now() < deadline) {
    const result = await app.readTrackedConversationOperation({ sessionId })
    if (
      result.kind === "product-app.conversation-operation.found" &&
      result.operation.capabilities.terminal
    ) {
      return
    }
    await delay(10)
  }
  throw new Error(`conversation operation did not settle: ${sessionId}`)
}

async function waitForJob(app: ProductAppShell, jobId: string): Promise<void> {
  const deadline = Date.now() + 2_000
  while (Date.now() < deadline) {
    const result = await app.readExecutionReference({ kind: "job", id: jobId })
    if (
      result.kind === "found" &&
      (result.activity.state === "succeeded" ||
        result.activity.state === "failed" ||
        result.activity.state === "cancelled")
    ) {
      return
    }
    await delay(10)
  }
  throw new Error(`job did not settle: ${jobId}`)
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function createStoreDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "wanex-product-app-tui-test-"))
  tempDirs.push(dir)
  return dir
}

async function cliEnv(): Promise<ProductAppTuiCliEnvironment> {
  return {
    WANEX_STORE_DIR: await createStoreDir(),
    WANEX_SYSTEM_SERVICE_BIN: serviceBin,
    WANEX_PROVIDER_PROFILE_ID: "product-app-tui-cli-test",
    WANEX_PROVIDER_MODEL_ID: "product-app-tui-cli-model"
  }
}

async function* lines(values: readonly string[]): AsyncIterable<string> {
  for (const value of values) {
    yield value
  }
}
