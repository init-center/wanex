import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { afterEach, describe, expect, it } from "vitest"
import {
  resolveAppExtensionContributions,
  type AppCommandContribution
} from "@wanex/extension"
import {
  createStorageTestStore,
  createTestTurnExecutionBinding
} from "@wanex/storage/testing"
import {
  PRODUCT_APP_BACKEND_AGENT_CONTEXT_PROFILE_KEY,
  PRODUCT_APP_BACKEND_CAPABILITY_IDS,
  PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS,
  PRODUCT_APP_BACKEND_HANDLER_REFS,
  PRODUCT_APP_BACKEND_INTEGRATION_CONTRACT,
  createProductAppBackendCommandPort,
  createProductAppBackendCommandPortJsonMapper,
  createProductAppBackendShell,
  envelopeProductAppBackendRouteResult,
  createProductAppBackendApp,
  readProductAppBackendOverview,
  projectProductAppBackendSafeError
} from "../../src/backend/index.js"
import {
  createBackendConversationSettlementFixture
} from "./conversation-settlement-fixture.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
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

describe("@wanex/product-app backend", () => {
  it("freezes the Product App integration contract", () => {
    expect(PRODUCT_APP_BACKEND_INTEGRATION_CONTRACT).toMatchObject({
      kind: "product-app.integration-contract",
      recommendedPackage: "@wanex/product-app",
      recommendedEntryPoint: "@wanex/product-app",
      rendererEntryPoint: "@wanex/product-app/surface-client",
      rendererBoundary: {
        rendererMayOpenStorage: false,
        rendererMayReceiveStorePath: false,
        rendererMayReceiveServiceBinaryPath: false,
        rendererCalls: "app-owned-ipc-or-api"
      }
    })
    expect(PRODUCT_APP_BACKEND_INTEGRATION_CONTRACT.backendDependencies).toEqual([
      "@wanex/app"
    ])
    expect(
      PRODUCT_APP_BACKEND_INTEGRATION_CONTRACT.forbiddenDefaultDependencies
    ).toEqual([
      "@wanex/storage",
      "@wanex/plugin",
      "@wanex/connector",
      "@wanex/runtime/host"
    ])
    expect(PRODUCT_APP_BACKEND_INTEGRATION_CONTRACT.lifecycleSteps).toEqual([
      "create_app",
      "adapt_command_port",
      "dispose_app"
    ])
    expect(PRODUCT_APP_BACKEND_INTEGRATION_CONTRACT.productOwnedState).toEqual([
      "selected_session",
      "panel_layout",
      "mode_routing",
      "renderer_state",
      "ui_preferences"
    ])
  })

  it("dispatches product app backend command port requests through safe envelopes", async () => {
    const storeDir = await createStoreDir()
    const settlementFixture = createBackendConversationSettlementFixture({
      storeDir,
      serviceBin
    })
    const app = await createProductAppBackendApp({
      storage: settlementFixture.storage,
      providerProfile: {
        id: "product-app.backend-port",
        modelId: "product-app.backend-port-model"
      }
    })
    const port = createProductAppBackendCommandPort(app)

    try {
      await expect(
        port.dispatch({
          command: PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.readProductCapabilities
        })
      ).resolves.toMatchObject({
        ok: true,
        command: "readProductCapabilities",
        value: {
          selectedCount: 7,
          notSelectedCount: 2
        }
      })
      await expect(
        port.dispatch({
          command: PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.readProductCommands
        })
      ).resolves.toMatchObject({
        ok: true,
        command: "readProductCommands",
        value: {
          commands: expect.arrayContaining([
            expect.objectContaining({
              id: "product.agent.submit",
              handlerRef: PRODUCT_APP_BACKEND_HANDLER_REFS.submitConversationOperation
            })
          ])
        }
      })

      await expect(
        port.dispatch({
          command:
            PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.explainProductCommandContribution,
          input: {
            commandId: "product.agent.submit"
          }
        })
      ).resolves.toMatchObject({
        ok: true,
        command: "explainProductCommandContribution",
        value: {
          kind: "found",
          commandId: "product.agent.submit",
          handler: {
            supported: true,
            policy: "allow_listed"
          }
        }
      })

      await expect(
        port.dispatch({
          command:
            PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.previewProductCommandInvocation,
          input: {
            commandId: "product.agent.submit",
            input: {
              text: "preview through command port"
            }
          }
        })
      ).resolves.toMatchObject({
        ok: true,
        command: "previewProductCommandInvocation",
        value: {
          kind: "runnable",
          commandId: "product.agent.submit",
          handlerRef: PRODUCT_APP_BACKEND_HANDLER_REFS.submitConversationOperation,
          inputAccepted: true
        }
      })

      await expect(
        port.dispatch({
          command:
            PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.previewProductCommandInvocation,
          input: {
            commandId: "product.agent.submit",
            input: {
              text: ""
            }
          }
        })
      ).resolves.toMatchObject({
        ok: true,
        command: "previewProductCommandInvocation",
        value: {
          kind: "rejected",
          commandId: "product.agent.submit",
          reason: "invalid_input",
          message: "submitConversationOperation text must not be empty"
        }
      })

      await expect(
        port.dispatch({
          command: PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.routeInput,
          input: {
            text: "/status"
          }
        })
      ).resolves.toMatchObject({
        ok: true,
        command: "routeInput",
        value: {
          kind: "read_model",
          command: "status",
          result: {
            providerProfileId: "product-app.backend-port"
          }
        }
      })

      const conversationSettled =
        settlementFixture.settlements.waitForSession(
          "ses_product_app_backend_command_port"
        )
      const executedAgent = await port.dispatch({
          command: PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.executeProductCommand,
          input: {
            commandId: "product.agent.submit",
            input: {
              text: "through command port",
              sessionId: "ses_product_app_backend_command_port"
            }
          }
        })
      expect(executedAgent).toMatchObject({
        ok: true,
        command: "executeProductCommand",
        value: {
          kind: "completed",
          commandId: "product.agent.submit",
          value: {
            sessionId: "ses_product_app_backend_command_port",
            state: expect.stringMatching(/queued|running|succeeded/)
          }
        }
      })
      await conversationSettled

      await expect(
        port.dispatch({
          command: PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.readSessionTranscript,
          input: {
            sessionId: "ses_product_app_backend_command_port"
          }
        })
      ).resolves.toMatchObject({
        ok: true,
        command: "readSessionTranscript",
        value: {
          sessionId: "ses_product_app_backend_command_port",
          rows: [
            expect.objectContaining({
              kind: "message",
              role: "user",
              text: "through command port"
            }),
            expect.objectContaining({
              kind: "message",
              role: "assistant",
              text: "Fake response from product-app.backend-port-model"
            })
          ]
        }
      })

      await expect(
        port.dispatch({
          command: PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.readRecentSessions,
          input: {
            limit: 3
          }
        })
      ).resolves.toMatchObject({
        ok: true,
        command: "readRecentSessions",
        value: {
          kind: "wanex-app.recent_sessions",
          limit: 3,
          rows: [
            expect.objectContaining({
              sessionId: "ses_product_app_backend_command_port",
              kind: "agent",
              status: "active"
            })
          ]
        }
      })

      await expect(
        port.dispatch({
          command: PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.readProductWorkbench,
          input: {
            sessionId: "ses_product_app_backend_command_port"
          }
        })
      ).resolves.toMatchObject({
        ok: true,
        command: "readProductWorkbench",
        value: {
          kind: "product-app.backend.workbench",
          sessionId: "ses_product_app_backend_command_port",
          summary: {
            inputCount: 1,
            messageCount: 2,
            latestAssistantText: "Fake response from product-app.backend-port-model",
            latestUserText: "through command port",
            originKinds: ["interactive"]
          },
          actions: {
            submitCommandId: "product.agent.submit"
          }
        }
      })
    } finally {
      await app.dispose()
      await settlementFixture.dispose()
    }
  })

  it("fails closed for product app backend command port unknown commands and invalid input", async () => {
    const storeDir = await createStoreDir()
    const app = await createProductAppBackendApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      }
    })
    const port = createProductAppBackendCommandPort(app)

    try {
      await expect(port.dispatch(null)).resolves.toEqual({
        ok: false,
        command: "unknown",
        error: {
          code: "validation_error",
          category: "validation",
          message: "command port request must be an object"
        }
      })

      await expect(port.dispatch({})).resolves.toEqual({
        ok: false,
        command: "unknown",
        error: {
          code: "validation_error",
          category: "validation",
          message:
            "command port request.command must be a non-empty string"
        }
      })

      await expect(
        port.dispatch({
          command: 123
        })
      ).resolves.toEqual({
        ok: false,
        command: "unknown",
        error: {
          code: "validation_error",
          category: "validation",
          message:
            "command port request.command must be a non-empty string"
        }
      })

      await expect(
        port.dispatch({
          command: "plugin.run",
          input: {
            commandId: "plugin.echo"
          }
        })
      ).resolves.toEqual({
        ok: false,
        command: "plugin.run",
        error: {
          code: "unknown_command",
          category: "validation",
          message: "unknown product app backend port command: plugin.run"
        }
      })

      await expect(
        port.dispatch({
          command: PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.routeInput,
          input: {
            text: "/missing"
          }
        })
      ).resolves.toMatchObject({
        ok: false,
        command: "routeInput",
        error: {
          code: "unknown_command",
          category: "validation",
          message: "unknown product command: /missing"
        }
      })

      await expect(
        port.dispatch({
          command: PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.submitConversationOperation,
          input: {
            sessionId: "ses_missing_text"
          }
        })
      ).resolves.toMatchObject({
        ok: false,
        command: "submitConversationOperation",
        error: {
          code: "validation_error",
          category: "validation",
          message: "submitConversationOperation input.text must be a non-empty string"
        }
      })
      await expect(
        port.dispatch({
          command: PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.readRecentSessions,
          input: {
            limit: 0
          }
        })
      ).resolves.toMatchObject({
        ok: false,
        command: "readRecentSessions",
        error: {
          code: "validation_error",
          category: "validation",
          message: "recent session limit must be a positive integer"
        }
      })
      await expect(
        port.dispatch({
          command: PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.readProductWorkbench,
          input: {}
        })
      ).resolves.toMatchObject({
        ok: false,
        command: "readProductWorkbench",
        error: {
          code: "validation_error",
          category: "validation",
          message:
            "readProductWorkbench input.sessionId must be a non-empty string"
        }
      })
    } finally {
      await app.dispose()
    }
  })

  it("maps product app backend command port requests to JSON responses without a transport dependency", async () => {
    const storeDir = await createStoreDir()
    const settlementFixture = createBackendConversationSettlementFixture({
      storeDir,
      serviceBin
    })
    const app = await createProductAppBackendApp({
      storage: settlementFixture.storage
    })
    const mapper = createProductAppBackendCommandPortJsonMapper(
      createProductAppBackendCommandPort(app)
    )

    try {
      await expect(
        mapper.dispatchJson(
          JSON.stringify({
            command:
              PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.readProductCapabilities
          })
        )
      ).resolves.toMatchObject({
        status: "success",
        envelope: {
          ok: true,
          command: "readProductCapabilities",
          value: {
            selectedCount: 7
          }
        }
      })

      const routed = await mapper.dispatchJson(
        JSON.stringify({
          command: PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.routeInput,
          input: {
            text: "/status"
          }
        })
      )
      expect(routed).toMatchObject({
        status: "success",
        envelope: {
          ok: true,
          command: "routeInput",
          value: {
            kind: "read_model",
            command: "status"
          }
        }
      })
      expect(JSON.parse(routed.body)).toEqual(routed.envelope)

      const explained = await mapper.dispatchJson(
        JSON.stringify({
          command:
            PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.explainProductCommandContribution,
          input: {
            commandId: "product.agent.submit"
          }
        })
      )
      expect(explained).toMatchObject({
        status: "success",
        envelope: {
          ok: true,
          command: "explainProductCommandContribution",
          value: {
            kind: "found",
            commandId: "product.agent.submit",
            source: {
              kind: "builtin"
            },
            handler: {
              supported: true
            }
          }
        }
      })
      expect(JSON.parse(explained.body)).toEqual(explained.envelope)

      const recentSessions = await mapper.dispatchJson(
        JSON.stringify({
          command: PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.readRecentSessions,
          input: {
            limit: 2
          }
        })
      )
      expect(recentSessions).toMatchObject({
        status: "success",
        envelope: {
          ok: true,
          command: "readRecentSessions",
          value: {
            kind: "wanex-app.recent_sessions",
            limit: 2,
            rows: []
          }
        }
      })

      const conversationSettled =
        settlementFixture.settlements.waitForSession(
          "ses_product_app_backend_json_workbench"
        )
      await mapper.dispatchJson(
        JSON.stringify({
          command: PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.submitConversationOperation,
          input: {
            sessionId: "ses_product_app_backend_json_workbench",
            text: "seed JSON workbench"
          }
        })
      )
      await conversationSettled
      const workbench = await mapper.dispatchJson(
        JSON.stringify({
          command: PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.readProductWorkbench,
          input: {
            sessionId: "ses_product_app_backend_json_workbench"
          }
        })
      )
      expect(workbench).toMatchObject({
        status: "success",
        envelope: {
          ok: true,
          command: "readProductWorkbench",
          value: {
            kind: "product-app.backend.workbench",
            summary: {
              inputCount: 1,
              messageCount: 2,
              latestUserText: "seed JSON workbench"
            }
          }
        }
      })

      const previewed = await mapper.dispatchJson(
        JSON.stringify({
          command:
            PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.previewProductCommandInvocation,
          input: {
            commandId: "product.overview.read",
            input: {
              now: 5_505
            }
          }
        })
      )
      expect(previewed).toMatchObject({
        status: "success",
        envelope: {
          ok: true,
          command: "previewProductCommandInvocation",
          value: {
            kind: "runnable",
            commandId: "product.overview.read",
            handlerRef: PRODUCT_APP_BACKEND_HANDLER_REFS.readProductOverview,
            inputAccepted: true
          }
        }
      })
      expect(JSON.parse(previewed.body)).toEqual(previewed.envelope)

      await expect(mapper.dispatchJson("{bad json")).resolves.toEqual({
        status: "validation_error",
        body: JSON.stringify({
          ok: false,
          command: "unknown",
          error: {
            code: "validation_error",
            category: "validation",
            message: "JSON request body must be valid JSON"
          }
        }),
        envelope: {
          ok: false,
          command: "unknown",
          error: {
            code: "validation_error",
            category: "validation",
            message: "JSON request body must be valid JSON"
          }
        }
      })

      await expect(mapper.dispatchJson(123)).resolves.toMatchObject({
        status: "validation_error",
        envelope: {
          ok: false,
          command: "unknown",
          error: {
            code: "validation_error",
            message: "JSON request body must be a string"
          }
        }
      })

      await expect(
        mapper.dispatchJson(
          JSON.stringify({
            input: {
              text: "missing command"
            }
          })
        )
      ).resolves.toMatchObject({
        status: "validation_error",
        envelope: {
          ok: false,
          command: "unknown",
          error: {
            code: "validation_error",
            message:
              "command port request.command must be a non-empty string"
          }
        }
      })

      await expect(
        mapper.dispatchJson(
          JSON.stringify({
            command: "plugin.run"
          })
        )
      ).resolves.toMatchObject({
        status: "unknown_command",
        envelope: {
          ok: false,
          command: "plugin.run",
          error: {
            code: "unknown_command"
          }
        }
      })

      await expect(
        mapper.dispatchJson(
          JSON.stringify({
            command: PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.submitConversationOperation,
            input: {
              sessionId: "ses_json_missing_text"
            }
          })
        )
      ).resolves.toMatchObject({
        status: "validation_error",
        envelope: {
          ok: false,
          command: "submitConversationOperation",
          error: {
            code: "validation_error",
            message: "submitConversationOperation input.text must be a non-empty string"
          }
        }
      })
    } finally {
      await app.dispose()
      await settlementFixture.dispose()
    }
  })

  it("owns the product app backend, command port, and JSON mapper in one local backend shell", async () => {
    const storeDir = await createStoreDir()
    const shell = await createProductAppBackendShell({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      },
      providerProfile: {
        id: "product-app.backend-backend-shell",
        modelId: "product-app.backend-backend-shell-model"
      }
    })

    expect(shell.status()).toMatchObject({
      disposed: false,
      providerProfileId: "product-app.backend-backend-shell"
    })
    expect(shell.commands.readProductCapabilities()).toMatchObject({
      selectedCount: 7,
      notSelectedCount: 2
    })
    expect(shell.port).toBeDefined()
    expect(shell.json).toBeDefined()

    await expect(
      shell.dispatch({
        command: PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.routeInput,
        input: {
          text: "/status"
        }
      })
    ).resolves.toMatchObject({
      ok: true,
      command: "routeInput",
      value: {
        kind: "read_model",
        command: "status",
        result: {
          disposed: false,
          providerProfileId: "product-app.backend-backend-shell"
        }
      }
    })

    await expect(
      shell.dispatchJson(
        JSON.stringify({
          command:
            PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.readProductCapabilities
        })
      )
    ).resolves.toMatchObject({
      status: "success",
      envelope: {
        ok: true,
        command: "readProductCapabilities",
        value: {
          selectedCount: 7
        }
      }
    })

    await shell.dispose()
    expect(shell.status().disposed).toBe(true)
    await expect(shell.dispose()).resolves.toBeUndefined()
    await expect(
      shell.dispatch({
        command: PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.readDiagnostics
      })
    ).resolves.toEqual({
      ok: false,
      command: "readDiagnostics",
      error: {
        code: "lifecycle_error",
        category: "lifecycle",
        message: "product app backend is disposed"
      }
    })
  })

  it("projects a product overview read model through typed, port, and JSON backend shell paths", async () => {
    const storeDir = await createStoreDir()
    const shell = await createProductAppBackendShell({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      },
      providerProfile: {
        id: "product-app.backend-overview",
        modelId: "product-app.backend-overview-model"
      }
    })

    try {
      await shell.commands.submitConversationOperation({
        content: [{ type: "text", text: "seed product home" }],
        sessionId: "ses_product_app_backend_overview_home"
      })
      await expect(
        shell.commands.readProductOverview({
          now: 7_001,
          recentSessionLimit: 2
        })
      ).resolves.toMatchObject({
        kind: "product-app.backend.overview",
        generatedAt: 7_001,
        ready: true,
        lifecycle: {
          disposed: false,
          ready: true,
          shutdownCommandId: "product.shutdown"
        },
        runtimeHost: {
          observed: false,
          attentionRequired: false
        },
        provider: {
          configuredProfileId: "product-app.backend-overview",
          activeProfileId: "product-app.backend-overview"
        },
        capabilities: {
          selectedCount: 7,
          notSelectedCount: 2,
          selectedIds: expect.arrayContaining([
            PRODUCT_APP_BACKEND_CAPABILITY_IDS.appHost,
            PRODUCT_APP_BACKEND_CAPABILITY_IDS.productCommandRegistry
          ]),
          notSelectedIds: expect.arrayContaining([
            PRODUCT_APP_BACKEND_CAPABILITY_IDS.pluginActionExecution
          ])
        },
        commands: {
          totalCount: 14,
          builtinCount: 14,
          extensionCount: 0,
          primary: expect.arrayContaining([
            expect.objectContaining({
              id: "product.agent.submit",
              sourceKind: "builtin"
            }),
            expect.objectContaining({
              id: "product.overview.read",
              sourceKind: "builtin"
            })
          ])
        },
        sessions: {
          recentCount: 1,
          recentLimit: 2,
          recent: [
            expect.objectContaining({
              sessionId: "ses_product_app_backend_overview_home",
              kind: "agent",
              status: "active"
            })
          ]
        },
        recommendedActions: expect.arrayContaining([
          expect.objectContaining({
            id: "context.refresh",
            commandId: "product.context.refresh",
            reason: "context_not_configured"
          }),
          expect.objectContaining({
            id: "agent.submit",
            commandId: "product.agent.submit",
            reason: "ready"
          })
        ]),
        context: {
          configured: false,
          monitorRunning: false,
          instructionSources: 0,
          skillCount: 0,
          activationToolRegistered: false
        },
        extensions: {
          configured: false,
          contributionCount: 0,
          diagnosticCount: 0
        },
        diagnostics: {
          generatedAt: 7_001,
          activityCount: expect.any(Number),
          totalCount: expect.any(Number)
        }
      })

      await expect(
        shell.dispatch({
          command: PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.readProductOverview,
          input: {
            now: 7_002
          }
        })
      ).resolves.toMatchObject({
        ok: true,
        command: "readProductOverview",
        value: {
          kind: "product-app.backend.overview",
          generatedAt: 7_002,
          provider: {
            activeProfileId: "product-app.backend-overview"
          },
          commands: {
            totalCount: 14
          },
          sessions: {
            recentCount: 1,
            recentLimit: 5
          }
        }
      })

      const json = await shell.dispatchJson(
        JSON.stringify({
          command: PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.readProductOverview,
          input: {
            now: 7_003,
            recentSessionLimit: 1
          }
        })
      )
      expect(json).toMatchObject({
        status: "success",
        envelope: {
          ok: true,
          command: "readProductOverview",
          value: {
            generatedAt: 7_003,
            ready: true,
            sessions: {
              recentLimit: 1,
              recentCount: 1
            }
          }
        }
      })
      expect(JSON.parse(json.body)).toEqual(json.envelope)
    } finally {
      await shell.dispose()
    }
  })

  it("summarizes runtime-host diagnostics in the product overview read model", async () => {
    const overview = await readProductAppBackendOverview(
      {
        status() {
          return {
            disposed: false,
            started: true,
            workerCount: 1,
            providerProfileId: "overview-host",
            activeProviderProfileId: "overview-host",
            agentContext: {
              configured: false,
              revision: 0
            },
            agentContextMonitor: {
              running: false,
              intervalMs: 1_000,
              refreshCount: 0
            },
            extensions: {
              configured: false,
              contributionCount: 0,
              diagnosticCount: 0,
              byDomain: {
                instruction: 0,
                skill: 0,
                command: 0,
                agent: 0,
                tool: 0,
                providerCatalog: 0,
                lifecycleHook: 0
              }
            }
          }
        },
        readProductCapabilities() {
          return {
            selectedCount: 0,
            notSelectedCount: 0,
            extensionConfigured: false,
            capabilities: []
          }
        },
        readProductCommands() {
          return {
            commands: [],
            diagnostics: []
          }
        },
        async readRecentSessions() {
          return {
            kind: "wanex-app.recent_sessions",
            limit: 5,
            rows: []
          }
        },
        async readDiagnostics() {
          return {
            generatedAt: 8_001,
            diagnostics: [
              {
                id: "runtime-host:backlog-jobs",
                source: "app",
                severity: "warning",
                code: "app.runtime_host.backlog",
                message: "Runtime host has queued job backlog",
                at: 8_000
              }
            ],
            activity: [
              {
                id: "runtime-host-activity:summary",
                source: "app",
                severity: "warning",
                message: "Runtime host job summary refreshed",
                at: 8_000,
                detail: {
                  started: true,
                  workerCount: 2,
                  memoryWorkerCount: 1,
                  totalJobs: 5,
                  backlogCount: 3,
                  runningLeaseCount: 1,
                  staleRunningLeaseCount: 0
                }
              },
              {
                id: "runtime-host-activity:health",
                source: "app",
                severity: "warning",
                message: "Runtime host live health refreshed",
                at: 8_000,
                detail: {
                  started: true,
                  loopCount: 3,
                  activeLoopCount: 2,
                  stoppedLoopCount: 1,
                  runCount: 21,
                  failureCount: 1,
                  errorCount: 0
                }
              }
            ]
          }
        }
      },
      { now: 8_001 }
    )

    expect(overview.runtimeHost).toEqual({
      observed: true,
      started: true,
      workerCount: 2,
      memoryWorkerCount: 1,
      totalJobs: 5,
      backlogCount: 3,
      runningLeaseCount: 1,
      staleRunningLeaseCount: 0,
      loopCount: 3,
      activeLoopCount: 2,
      stoppedLoopCount: 1,
      runCount: 21,
      failureCount: 1,
      errorCount: 0,
      attentionRequired: true
    })
    expect(overview.sessions).toEqual({
      recentCount: 0,
      recentLimit: 5,
      recent: []
    })
    expect(overview.recommendedActions).toEqual([
      {
        id: "diagnostics.review",
        commandId: "product.diagnostics.detail.read",
        label: "Review Diagnostics",
        priority: 10,
        reason: "diagnostic_attention"
      },
      {
        id: "runtime.review",
        commandId: "product.diagnostics.detail.read",
        label: "Review Runtime",
        priority: 20,
        reason: "runtime_attention"
      },
      {
        id: "context.refresh",
        commandId: "product.context.refresh",
        label: "Refresh Context",
        priority: 30,
        reason: "context_not_configured"
      },
      {
        id: "session.start",
        commandId: "product.agent.submit",
        label: "Start Session",
        priority: 40,
        reason: "no_recent_sessions"
      },
      {
        id: "agent.submit",
        commandId: "product.agent.submit",
        label: "Submit Agent Turn",
        priority: 50,
        reason: "ready"
      }
    ])
  })

  it("projects product diagnostics detail through typed, port, JSON, and command paths", async () => {
    const storeDir = await createStoreDir()
    const settlementFixture = createBackendConversationSettlementFixture({
      storeDir,
      serviceBin
    })
    const shell = await createProductAppBackendShell({
      storage: settlementFixture.storage,
      providerProfile: {
        id: "product-app.backend-diagnostics-detail",
        modelId: "product-app.backend-diagnostics-detail-model"
      }
    })

    try {
      const receipt = await shell.commands.submitConversationOperation({
        content: [{ type: "text", text: "seed diagnostics detail" }],
        sessionId: "ses_product_app_backend_diagnostics_detail"
      })
      await settlementFixture.settlements.waitForJob(receipt.jobId)

      await expect(
        shell.commands.readProductDiagnosticsDetail({
          now: 8_101,
          diagnosticLimit: 1,
          activityLimit: 1
        })
      ).resolves.toMatchObject({
        kind: "product-app.backend.diagnostics-detail",
        generatedAt: 8_101,
        summary: {
          totalCount: expect.any(Number),
          errorCount: 0,
          warningCount: 0,
          infoCount: expect.any(Number),
          activityCount: expect.any(Number)
        },
        sources: expect.arrayContaining([
          expect.objectContaining({
            source: "scheduler",
            totalCount: expect.any(Number),
            activityCount: expect.any(Number)
          })
        ]),
        diagnostics: [
          expect.objectContaining({
            source: "scheduler",
            severity: "info",
            code: "scheduler.job.succeeded",
            hasDetail: true
          })
        ],
        activity: [
          expect.objectContaining({
            source: "scheduler",
            severity: "info",
            hasDetail: true
          })
        ],
        limits: {
          diagnosticLimit: 1,
          activityLimit: 1
        }
      })

      await expect(
        shell.dispatch({
          command:
            PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.readProductDiagnosticsDetail,
          input: {
            now: 8_102,
            diagnosticLimit: 2,
            activityLimit: 2
          }
        })
      ).resolves.toMatchObject({
        ok: true,
        command: "readProductDiagnosticsDetail",
        value: {
          kind: "product-app.backend.diagnostics-detail",
          generatedAt: 8_102,
          limits: {
            diagnosticLimit: 2,
            activityLimit: 2
          }
        }
      })

      const json = await shell.dispatchJson(
        JSON.stringify({
          command:
            PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.readProductDiagnosticsDetail,
          input: {
            now: 8_103,
            diagnosticLimit: 2,
            activityLimit: 2
          }
        })
      )
      expect(json).toMatchObject({
        status: "success",
        envelope: {
          ok: true,
          command: "readProductDiagnosticsDetail",
          value: {
            kind: "product-app.backend.diagnostics-detail",
            generatedAt: 8_103
          }
        }
      })
      expect(JSON.parse(json.body)).toEqual(json.envelope)

      await expect(
        shell.dispatch({
          command:
            PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS.readProductDiagnosticsDetail,
          input: "bad"
        })
      ).resolves.toMatchObject({
        ok: false,
        command: "readProductDiagnosticsDetail",
        error: {
          code: "validation_error",
          message: "readProductDiagnosticsDetail input must be an object"
        }
      })

      await expect(
        shell.commands.executeProductCommand({
          commandId: "product.diagnostics.detail.read",
          input: {
            now: 8_104,
            diagnosticLimit: 1,
            activityLimit: 1
          }
        })
      ).resolves.toMatchObject({
        kind: "completed",
        commandId: "product.diagnostics.detail.read",
        value: {
          kind: "product-app.backend.diagnostics-detail",
          generatedAt: 8_104
        }
      })
    } finally {
      await shell.dispose()
      await settlementFixture.dispose()
    }
  })

  it("keeps storage behind product commands and rejects calls after shutdown", async () => {
    const storeDir = await createStoreDir()
    const app = await createProductAppBackendApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      }
    })

    expect(app.status()).toEqual({
      disposed: false,
      started: true,
      workerCount: 1,
      providerProfileId: "product-app.backend-fake",
      activeProviderProfileId: "product-app.backend-fake",
      agentContext: {
        configured: false,
        revision: 0
      },
      agentContextMonitor: {
        running: false,
        intervalMs: 1_000,
        refreshCount: 0
      },
      extensions: {
        configured: false,
        contributionCount: 0,
        diagnosticCount: 0,
        byDomain: {
          instruction: 0,
          skill: 0,
          command: 0,
          agent: 0,
          tool: 0,
          providerCatalog: 0,
          lifecycleHook: 0
        }
      }
    })

    await expect(
      app.commands.submitConversationOperation({
        content: [{ type: "text", text: "through product facade" }],
        sessionId: "ses_product_app_backend_commands"
      })
    ).resolves.toMatchObject({
      sessionId: "ses_product_app_backend_commands",
      state: expect.stringMatching(/queued|running|succeeded/)
    })

    await expect(app.commands.shutdown()).resolves.toEqual({
      disposed: true,
      repeated: false
    })
    await expect(app.commands.shutdown()).resolves.toEqual({
      disposed: true,
      repeated: true
    })
    await expect(
      app.commands.readDiagnostics()
    ).rejects.toThrow("app is disposed")
  })

  it("reports selected and not-selected product capabilities without loading optional runtimes", async () => {
    const storeDir = await createStoreDir()
    const app = await createProductAppBackendApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      }
    })

    try {
      expect(app.commands.readProductCapabilities()).toMatchObject({
        selectedCount: 7,
        notSelectedCount: 2,
        extensionConfigured: false,
        capabilities: expect.arrayContaining([
          expect.objectContaining({
            id: PRODUCT_APP_BACKEND_CAPABILITY_IDS.appHost,
            state: "enabled",
            ownerPackage: "@wanex/app",
            defaultSelected: true
          }),
          expect.objectContaining({
            id: PRODUCT_APP_BACKEND_CAPABILITY_IDS.productCommandRegistry,
            state: "enabled",
            ownerPackage: "@wanex/app",
            commandIds: expect.arrayContaining([
              "readProductOverview",
              "readRecentSessions",
              "readProductWorkbench",
              "readProductDiagnosticsDetail",
              "readProductCommands",
              "explainProductCommandContribution",
              "previewProductCommandInvocation",
              "executeProductCommand"
            ])
          }),
          expect.objectContaining({
            id: PRODUCT_APP_BACKEND_CAPABILITY_IDS.pluginActionExecution,
            state: "not_selected",
            ownerPackage: "@wanex/product-app-command-host",
            defaultSelected: false
          }),
          expect.objectContaining({
            id: PRODUCT_APP_BACKEND_CAPABILITY_IDS.connectorRuntime,
            state: "not_selected",
            ownerPackage: "@wanex/connector"
          })
        ])
      })
    } finally {
      await app.dispose()
    }
  })

  it("reflects configured extension sources in the product capability read model", async () => {
    const storeDir = await createStoreDir()
    const app = await createProductAppBackendApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      },
      extensions: {
        snapshot: resolveAppExtensionContributions([
          {
            id: "plugin.echo",
            domain: "command",
            value: {
              name: "plugin.echo",
              title: "Plugin Echo",
              handlerRef: "wanex.plugin-action:plugin.echo/echo"
            },
            provenance: {
              source: {
                kind: "plugin",
                scope: "user",
                id: "plugin.echo"
              },
              trust: "user_enabled"
            }
          } satisfies AppCommandContribution
        ])
      }
    })

    try {
      expect(app.commands.readProductCapabilities()).toMatchObject({
        extensionConfigured: true,
        capabilities: expect.arrayContaining([
          expect.objectContaining({
            id: PRODUCT_APP_BACKEND_CAPABILITY_IDS.extensionCommandDiscovery,
            state: "enabled",
            notes: ["extension snapshot configured"]
          })
        ])
      })
    } finally {
      await app.dispose()
    }
  })

  it("routes ordinary text through the product agent command", async () => {
    const storeDir = await createStoreDir()
    const app = await createProductAppBackendApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      }
    })

    try {
      const routed = await app.commands.routeInput({
        text: "route this to the agent",
        sessionId: "ses_product_app_backend_route_agent"
      })

      expect(routed).toMatchObject({
        kind: "agent",
        command: "submitConversationOperation",
        result: {
          sessionId: "ses_product_app_backend_route_agent",
          state: expect.stringMatching(/queued|running|succeeded/)
        }
      })
    } finally {
      await app.dispose()
    }
  })

  it("routes explicit product commands without admitting an agent turn", async () => {
    const storeDir = await createStoreDir()
    const app = await createProductAppBackendApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      }
    })
    const storage = createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin
    })

    try {
      await expect(app.commands.routeInput({ text: "/status" })).resolves.toMatchObject({
        kind: "read_model",
        command: "status",
        result: {
          disposed: false,
          providerProfileId: "product-app.backend-fake"
        }
      })
      await expect(
        app.commands.routeInput({ text: "/diagnostics" })
      ).resolves.toMatchObject({
        kind: "read_model",
        command: "readDiagnostics",
        result: {
          diagnostics: expect.any(Array)
        }
      })
      await expect(
        app.commands.routeInput({ text: "/context monitor start" })
      ).resolves.toMatchObject({
        kind: "context",
        command: "startAgentContextMonitor",
        result: {
          running: true
        }
      })
      await expect(
        app.commands.routeInput({ text: "/context monitor stop" })
      ).resolves.toMatchObject({
        kind: "context",
        command: "stopAgentContextMonitor",
        result: {
          running: false
        }
      })

      await expect(storage.listSessions({ limit: 10 })).resolves.toEqual([])
    } finally {
      await storage.dispose()
      await app.dispose()
    }
  })

  it("exposes built-in product commands as contributions and executes allow-listed handlers", async () => {
    const storeDir = await createStoreDir()
    const settlementFixture = createBackendConversationSettlementFixture({
      storeDir,
      serviceBin
    })
    const app = await createProductAppBackendApp({
      storage: settlementFixture.storage,
      providerProfile: {
        id: "product-app.backend-command-registry",
        modelId: "product-app.backend-command-model"
      }
    })

    try {
      expect(app.commands.readProductCommands()).toMatchObject({
        diagnostics: [],
        commands: expect.arrayContaining([
          expect.objectContaining({
            id: "product.agent.submit",
            handlerRef: PRODUCT_APP_BACKEND_HANDLER_REFS.submitConversationOperation,
            sourceKind: "builtin",
            sourceScope: "builtin",
            trust: "trusted"
          }),
          expect.objectContaining({
            id: "product.diagnostics.read",
            handlerRef: PRODUCT_APP_BACKEND_HANDLER_REFS.readDiagnostics
          }),
          expect.objectContaining({
            id: "product.diagnostics.detail.read",
            handlerRef:
              PRODUCT_APP_BACKEND_HANDLER_REFS.readProductDiagnosticsDetail
          }),
          expect.objectContaining({
            id: "product.provenance.read",
            handlerRef: PRODUCT_APP_BACKEND_HANDLER_REFS.readSessionInputProvenance
          }),
          expect.objectContaining({
            id: "product.transcript.read",
            handlerRef: PRODUCT_APP_BACKEND_HANDLER_REFS.readSessionTranscript
          })
        ])
      })

      const conversationSettled =
        settlementFixture.settlements.waitForSession(
          "ses_product_app_backend_command_registry"
        )
      await expect(
        app.commands.executeProductCommand({
          commandId: "product.agent.submit",
          input: {
            text: "run through product registry",
            sessionId: "ses_product_app_backend_command_registry",
            inputId: "inp_product_app_backend_command_registry"
          }
        })
      ).resolves.toMatchObject({
        kind: "completed",
        commandId: "product.agent.submit",
        handlerRef: PRODUCT_APP_BACKEND_HANDLER_REFS.submitConversationOperation,
        value: {
          sessionId: "ses_product_app_backend_command_registry",
          state: expect.stringMatching(/queued|running|succeeded/)
        }
      })
      await conversationSettled

      await expect(
        app.commands.executeProductCommand({
          commandId: "product.diagnostics.read",
          input: {
            now: 448
          }
        })
      ).resolves.toMatchObject({
        kind: "completed",
        commandId: "product.diagnostics.read",
        value: {
          generatedAt: 448
        }
      })

      await expect(
        app.commands.previewProductCommandInvocation({
          commandId: "product.diagnostics.detail.read",
          input: {
            now: 449,
            diagnosticLimit: 3,
            activityLimit: 2
          }
        })
      ).toMatchObject({
        kind: "runnable",
        commandId: "product.diagnostics.detail.read",
        handlerRef:
          PRODUCT_APP_BACKEND_HANDLER_REFS.readProductDiagnosticsDetail,
        inputAccepted: true
      })

      await expect(
        app.commands.executeProductCommand({
          commandId: "product.diagnostics.detail.read",
          input: {
            now: 449,
            diagnosticLimit: 3,
            activityLimit: 2
          }
        })
      ).resolves.toMatchObject({
        kind: "completed",
        commandId: "product.diagnostics.detail.read",
        handlerRef:
          PRODUCT_APP_BACKEND_HANDLER_REFS.readProductDiagnosticsDetail,
        value: {
          kind: "product-app.backend.diagnostics-detail",
          generatedAt: 449,
          limits: {
            diagnosticLimit: 3,
            activityLimit: 2
          }
        }
      })

      await expect(
        app.commands.previewProductCommandInvocation({
          commandId: "product.diagnostics.detail.read",
          input: "bad"
        })
      ).toMatchObject({
        kind: "rejected",
        commandId: "product.diagnostics.detail.read",
        reason: "invalid_input",
        message: "readProductDiagnosticsDetail input must be an object"
      })

      await expect(
        app.commands.executeProductCommand({
          commandId: "product.provenance.read",
          input: {
            sessionId: "ses_product_app_backend_command_registry"
          }
        })
      ).resolves.toMatchObject({
        kind: "completed",
        commandId: "product.provenance.read",
        value: {
          sessionId: "ses_product_app_backend_command_registry",
          rows: [
            expect.objectContaining({
              inputId: "inp_product_app_backend_command_registry",
              kind: "interactive"
            })
          ]
        }
      })

      await expect(
        app.commands.executeProductCommand({
          commandId: "product.transcript.read",
          input: {
            sessionId: "ses_product_app_backend_command_registry"
          }
        })
      ).resolves.toMatchObject({
        kind: "completed",
        commandId: "product.transcript.read",
        handlerRef: PRODUCT_APP_BACKEND_HANDLER_REFS.readSessionTranscript,
        value: {
          sessionId: "ses_product_app_backend_command_registry",
          rows: [
            expect.objectContaining({
              kind: "message",
              role: "user",
              text: "run through product registry"
            }),
            expect.objectContaining({
              kind: "message",
              role: "assistant",
              text: "Fake response from product-app.backend-command-model"
            })
          ]
        }
      })
    } finally {
      await app.dispose()
      await settlementFixture.dispose()
    }
  })

  it("lists extension commands but fails closed for unsupported handler refs", async () => {
    const storeDir = await createStoreDir()
    const app = await createProductAppBackendApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      },
      extensions: {
        snapshot: resolveAppExtensionContributions([
          {
            id: "plugin.echo",
            domain: "command",
            value: {
              name: "plugin.echo",
              title: "Plugin Echo",
              category: "plugin",
              handlerRef: "wanex.plugin-action:plugin.echo/echo"
            },
            provenance: {
              source: {
                kind: "plugin",
                scope: "user",
                id: "plugin.echo"
              },
              trust: "user_enabled"
            },
            privileged: true
          } satisfies AppCommandContribution
        ])
      }
    })
    const storage = createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin
    })

    try {
      expect(app.commands.readProductCommands().commands).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "plugin.echo",
            handlerRef: "wanex.plugin-action:plugin.echo/echo",
            sourceKind: "plugin",
            sourceScope: "user",
            trust: "user_enabled"
          })
        ])
      )
      expect(
        app.commands.explainProductCommandContribution({
          commandId: "product.agent.submit"
        })
      ).toMatchObject({
        kind: "found",
        commandId: "product.agent.submit",
        source: {
          kind: "builtin",
          scope: "builtin",
          id: "product-app.backend",
          trust: "trusted"
        },
        contribution: {
          privileged: false
        },
        handler: {
          handlerRef: PRODUCT_APP_BACKEND_HANDLER_REFS.submitConversationOperation,
          supported: true,
          policy: "allow_listed"
        },
        diagnostics: []
      })
      expect(
        app.commands.explainProductCommandContribution({
          commandId: "plugin.echo"
        })
      ).toMatchObject({
        kind: "found",
        commandId: "plugin.echo",
        command: {
          id: "plugin.echo",
          title: "Plugin Echo",
          sourceKind: "plugin",
          trust: "user_enabled"
        },
        source: {
          kind: "plugin",
          scope: "user",
          id: "plugin.echo",
          trust: "user_enabled"
        },
        contribution: {
          privileged: true
        },
        handler: {
          handlerRef: "wanex.plugin-action:plugin.echo/echo",
          supported: false,
          policy: "unsupported_handler_ref"
        },
        diagnostics: []
      })
      expect(
        app.commands.explainProductCommandContribution({
          commandId: "missing.command"
        })
      ).toEqual({
        kind: "missing",
        commandId: "missing.command",
        message: "product command contribution not found: missing.command",
        diagnostics: []
      })
      expect(
        app.commands.previewProductCommandInvocation({
          commandId: "product.agent.submit",
          input: {
            text: "preview does not execute"
          }
        })
      ).toMatchObject({
        kind: "runnable",
        commandId: "product.agent.submit",
        handlerRef: PRODUCT_APP_BACKEND_HANDLER_REFS.submitConversationOperation,
        inputAccepted: true
      })
      expect(
        app.commands.previewProductCommandInvocation({
          commandId: "plugin.echo",
          input: {
            text: "must not execute"
          }
        })
      ).toMatchObject({
        kind: "rejected",
        commandId: "plugin.echo",
        handlerRef: "wanex.plugin-action:plugin.echo/echo",
        reason: "unsupported_handler_ref"
      })
      expect(
        app.commands.previewProductCommandInvocation({
          commandId: "missing.command"
        })
      ).toEqual({
        kind: "rejected",
        commandId: "missing.command",
        reason: "command_not_found",
        message: "product command not found: missing.command"
      })

      await expect(
        app.commands.executeProductCommand({
          commandId: "plugin.echo",
          input: {
            text: "must not execute"
          }
        })
      ).resolves.toEqual({
        kind: "rejected",
        commandId: "plugin.echo",
        handlerRef: "wanex.plugin-action:plugin.echo/echo",
        reason: "unsupported_handler_ref",
        message:
          "product command handler is not allowed: wanex.plugin-action:plugin.echo/echo"
      })
      await expect(
        app.commands.executeProductCommand({
          commandId: "missing.command"
        })
      ).resolves.toEqual({
        kind: "rejected",
        commandId: "missing.command",
        reason: "command_not_found",
        message: "product command not found: missing.command"
      })
      await expect(storage.listSessions({ limit: 10 })).resolves.toEqual([])
    } finally {
      await storage.dispose()
      await app.dispose()
    }
  })

  it("executes extension commands only through an explicitly injected executor", async () => {
    const storeDir = await createStoreDir()
    const calls: unknown[] = []
    const previews: unknown[] = []
    const inputSchema = {
      type: "object",
      properties: {
        text: { type: "string", minLength: 2, title: "Text" },
        count: { type: "integer", minimum: 1, maximum: 3 },
        tags: {
          type: "array",
          items: { type: "string" },
          maxItems: 3,
          uniqueItems: true
        }
      },
      required: ["text", "count"],
      additionalProperties: false
    } as const
    const app = await createProductAppBackendApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      },
      extensions: {
        snapshot: resolveAppExtensionContributions([
          {
            id: "plugin.echo",
            domain: "command",
            value: {
              name: "plugin.echo",
              title: "Plugin Echo",
              handlerRef: "wanex.plugin-action:plugin.echo/echo",
              inputSchema
            },
            provenance: {
              source: {
                kind: "plugin",
                scope: "user",
                id: "plugin.echo"
              },
              trust: "user_enabled"
            },
            privileged: true
          } satisfies AppCommandContribution
        ])
      },
      productCommands: {
        extensionExecutor: {
          supports(handlerRef) {
            return handlerRef.startsWith("wanex.plugin-action:")
          },
          preview(request) {
            previews.push(request)
            return typeof request.input === "object" &&
              request.input !== null &&
              "text" in request.input &&
              request.input.text === "handler-denied"
              ? { ok: false, message: "handler rejected input" }
              : { ok: true }
          },
          async execute(request) {
            calls.push(request)
            return {
              kind: "plugin-action.submitted",
              jobId: "job_plugin_echo"
            }
          }
        }
      }
    })

    try {
      expect(app.commands.readProductCapabilities()).toMatchObject({
        selectedCount: 8,
        notSelectedCount: 1,
        capabilities: expect.arrayContaining([
          expect.objectContaining({
            id: PRODUCT_APP_BACKEND_CAPABILITY_IDS.pluginActionExecution,
            state: "enabled",
            defaultSelected: false,
            commandIds: ["executeProductCommand"]
          })
        ])
      })
      expect(
        app.commands.explainProductCommandContribution({
          commandId: "plugin.echo"
        })
      ).toMatchObject({
        kind: "found",
        handler: {
          supported: true,
          policy: "extension_executor"
        }
      })
      expect(
        app.commands.readProductCommands().commands.find(
          (command) => command.id === "plugin.echo"
        )
      ).toMatchObject({
        inputSchema: {
          type: "object",
          required: ["count", "text"],
          additionalProperties: false,
          properties: {
            count: { type: "integer", minimum: 1, maximum: 3 },
            tags: { type: "array", uniqueItems: true },
            text: { type: "string", title: "Text" }
          }
        }
      })
      const firstCatalog = app.commands.readProductCommands()
      const firstSchema = firstCatalog.commands.find(
        (command) => command.id === "plugin.echo"
      )?.inputSchema
      if (firstSchema?.properties?.text !== undefined) {
        ;(firstSchema.properties.text as { title?: string }).title = "mutated"
      }
      expect(
        app.commands.readProductCommands().commands.find(
          (command) => command.id === "plugin.echo"
        )?.inputSchema?.properties?.text
      ).toMatchObject({ title: "Text" })
      expect(
        app.commands.previewProductCommandInvocation({
          commandId: "plugin.echo",
          input: { text: "hello", count: 2, tags: ["a", "b"] }
        })
      ).toMatchObject({
        kind: "runnable",
        commandId: "plugin.echo",
        inputAccepted: true
      })
      expect(
        app.commands.previewProductCommandInvocation({
          commandId: "plugin.echo"
        })
      ).toMatchObject({
        kind: "rejected",
        reason: "invalid_input",
        message: "command input is required",
        inputValidation: {
          source: "schema",
          issues: [{ path: "/", keyword: "instance" }]
        }
      })
      expect(
        app.commands.previewProductCommandInvocation({
          commandId: "plugin.echo",
          input: { text: "hello", count: 10, extra: true }
        })
      ).toMatchObject({
        kind: "rejected",
        reason: "invalid_input",
        inputValidation: {
          source: "schema",
          issues: expect.arrayContaining([
            expect.objectContaining({ path: "/count", keyword: "maximum" }),
            expect.objectContaining({
              path: "/extra",
              keyword: "additionalProperties"
            })
          ])
        }
      })
      expect(
        app.commands.previewProductCommandInvocation({
          commandId: "plugin.echo",
          input: { text: "handler-denied", count: 1 }
        })
      ).toMatchObject({
        kind: "rejected",
        reason: "invalid_input",
        message: "handler rejected input",
        inputValidation: {
          source: "handler",
          issues: [{ path: "/", keyword: "handler" }]
        }
      })
      await expect(
        app.commands.executeProductCommand({
          commandId: "plugin.echo",
          input: { text: "hello", count: 2 }
        })
      ).resolves.toMatchObject({
        kind: "completed",
        commandId: "plugin.echo",
        value: {
          kind: "plugin-action.submitted",
          jobId: "job_plugin_echo"
        }
      })
      expect(calls).toEqual([
        {
          commandId: "plugin.echo",
          handlerRef: "wanex.plugin-action:plugin.echo/echo",
          input: { text: "hello", count: 2 }
        }
      ])
      expect(previews).toHaveLength(3)
    } finally {
      await app.dispose()
    }
  })

  it("fails closed for empty input and unknown slash commands", async () => {
    const storeDir = await createStoreDir()
    const app = await createProductAppBackendApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      }
    })
    const storage = createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin
    })

    try {
      await expect(app.commands.routeInput({ text: "   " })).resolves.toEqual({
        kind: "error",
        command: "routeInput",
        code: "empty_input",
        message: "input must not be empty"
      })
      await expect(app.commands.routeInput({ text: "/wat" })).resolves.toEqual({
        kind: "error",
        command: "routeInput",
        code: "unknown_command",
        message: "unknown product command: /wat"
      })
      await expect(
        app.commands.routeInput({ text: "/context wat" })
      ).resolves.toEqual({
        kind: "error",
        command: "routeInput",
        code: "invalid_arguments",
        message:
          "expected /context refresh, /context monitor start, or /context monitor stop"
      })
      await expect(storage.listSessions({ limit: 10 })).resolves.toEqual([])
    } finally {
      await storage.dispose()
      await app.dispose()
    }
  })

  it("projects product command results into safe envelopes", async () => {
    const storeDir = await createStoreDir()
    const app = await createProductAppBackendApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      }
    })

    try {
      await expect(
        app.commands.safeCommand({
          command: "status",
          run: () => app.commands.routeInput({ text: "/status" })
        })
      ).resolves.toMatchObject({
        ok: true,
        command: "status",
        value: {
          kind: "read_model",
          command: "status"
        }
      })

      const routed = await app.commands.routeInput({ text: "/wat" })
      expect(envelopeProductAppBackendRouteResult("routeInput", routed)).toEqual({
        ok: false,
        command: "routeInput",
        error: {
          code: "unknown_command",
          category: "validation",
          message: "unknown product command: /wat"
        }
      })

      await app.commands.shutdown()
      await expect(
        app.commands.safeCommand({
          command: "readDiagnostics",
          run: () => app.commands.readDiagnostics()
        })
      ).resolves.toEqual({
        ok: false,
        command: "readDiagnostics",
        error: {
          code: "lifecycle_error",
          category: "lifecycle",
          message: "product app backend is disposed"
        }
      })
    } finally {
      await app.dispose()
    }
  })

  it("redacts path-like raw errors in product safe envelopes", () => {
    expect(
      projectProductAppBackendSafeError(
        new Error("failed opening /Users/asuna/private-store/apiKey.txt")
      )
    ).toEqual({
      code: "runtime_error",
      category: "runtime",
      message: "command failed; see product diagnostics for details"
    })
    expect(projectProductAppBackendSafeError("boom")).toEqual({
      code: "unknown_error",
      category: "unknown",
      message: "boom"
    })
  })

  it("normalizes workflow envelopes and projects neutral provenance", async () => {
    const storeDir = await createStoreDir()
    const app = await createProductAppBackendApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      }
    })
    const storage = createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin
    })

    try {
      await expect(
        app.commands.routeWorkflowEnvelope({
          kind: "scheduled",
          text: "/shutdown should be treated as scheduled text",
          sessionId: "ses_product_app_backend_scheduled_envelope",
          scheduleId: "schedule_product_app_backend_minutely",
          tickId: "tick_0001",
          nonOverlap: true
        })
      ).resolves.toMatchObject({
        kind: "agent",
        command: "submitConversationOperation",
        result: {
          sessionId: "ses_product_app_backend_scheduled_envelope",
          state: expect.stringMatching(/queued|running|succeeded/)
        }
      })
      expect(app.status().disposed).toBe(false)

      const scheduledInputs = await storage.listSessionInputs({
        sessionId: "ses_product_app_backend_scheduled_envelope"
      })
      const scheduledReadModel =
        await app.commands.readSessionInputProvenance({
          sessionId: "ses_product_app_backend_scheduled_envelope"
        })
      expect(scheduledInputs).toHaveLength(1)
      expect(scheduledInputs[0]).toMatchObject({
        origin: {
          kind: "scheduler",
          sourceRef: "schedule_product_app_backend_minutely",
          metadata: {
            scheduleId: "schedule_product_app_backend_minutely",
            tickId: "tick_0001",
            nonOverlap: true
          }
        },
        intent: "normal"
      })
      expect(scheduledReadModel).toEqual({
        sessionId: "ses_product_app_backend_scheduled_envelope",
        hasProductClientField: false,
        rows: [
          expect.objectContaining({
            kind: "scheduler",
            label: "Scheduled",
            sourceRef: "schedule_product_app_backend_minutely",
            intent: "normal",
            metadataKeys: ["nonOverlap", "scheduleId", "tickId"]
          })
        ]
      })
      expect(JSON.stringify(scheduledInputs[0])).not.toContain("desktop")
      expect(JSON.stringify(scheduledInputs[0])).not.toContain("Cron")

      await expect(
        app.commands.routeWorkflowEnvelope({
          kind: "channel",
          text: "channel message",
          sessionId: "ses_product_app_backend_channel_envelope",
          connectorId: "connector.reference.product",
          eventId: "evt_channel_1",
          threadRef: "thread_alpha",
          classifier: {
            classifierId: "product-router",
            label: "normal_agent_turn",
            confidence: 0.91
          }
        })
      ).resolves.toMatchObject({
        kind: "agent",
        command: "submitConversationOperation"
      })
      const channelInputs = await storage.listSessionInputs({
        sessionId: "ses_product_app_backend_channel_envelope"
      })
      const channelReadModel = await app.commands.readSessionInputProvenance({
        sessionId: "ses_product_app_backend_channel_envelope"
      })
      expect(channelInputs[0]).toMatchObject({
        origin: {
          kind: "connector",
          sourceRef: "evt_channel_1",
          parentRef: "thread_alpha",
          metadata: {
            connectorId: "connector.reference.product",
            eventId: "evt_channel_1",
            classifierId: "product-router",
            classifierLabel: "normal_agent_turn",
            classifierConfidence: 0.91
          }
        }
      })
      expect(channelReadModel.rows[0]).toMatchObject({
        kind: "connector",
        label: "Channel",
        sourceRef: "evt_channel_1",
        parentRef: "thread_alpha",
        metadataKeys: [
          "classifierConfidence",
          "classifierId",
          "classifierLabel",
          "connectorId",
          "eventId"
        ]
      })
    } finally {
      await storage.dispose()
      await app.dispose()
    }
  })

  it("routes interactive commands but fails closed for malformed workflow envelopes", async () => {
    const storeDir = await createStoreDir()
    const app = await createProductAppBackendApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      }
    })
    const storage = createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin
    })

    try {
      await expect(
        app.commands.routeWorkflowEnvelope({
          kind: "interactive",
          text: "/status",
          sourceRef: "composer"
        })
      ).resolves.toMatchObject({
        kind: "read_model",
        command: "status"
      })
      await expect(
        app.commands.routeWorkflowEnvelope({
          kind: "command",
          text: "status"
        })
      ).resolves.toEqual({
        kind: "error",
        command: "routeWorkflowEnvelope",
        code: "invalid_arguments",
        message: "command workflow envelope text must start with /"
      })
      await expect(
        app.commands.routeWorkflowEnvelope({
          kind: "interactive",
          text: "hello",
          classifier: {
            classifierId: "router",
            label: "agent",
            confidence: 2
          }
        })
      ).resolves.toEqual({
        kind: "error",
        command: "routeWorkflowEnvelope",
        code: "invalid_arguments",
        message:
          "classifier hint requires classifierId, label, and confidence between 0 and 1"
      })
      await expect(storage.listSessions({ limit: 10 })).resolves.toEqual([])
    } finally {
      await storage.dispose()
      await app.dispose()
    }
  })

  it("projects guided follow-up envelopes as queue-after-current input", async () => {
    const storeDir = await createStoreDir()
    const storage = createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin
    })
    let app: Awaited<ReturnType<typeof createProductAppBackendApp>> | undefined

    try {
      await storage.createSession({
        id: "ses_product_app_backend_guided_envelope",
        title: "guided envelope",
        kind: "agent"
      })
      const submitted = await storage.submitSessionTurn({
        id: "inp_product_app_backend_guided_base",
        turnId: "turn_product_app_backend_guided_base",
        sessionId: "ses_product_app_backend_guided_envelope",
        jobId: "job_product_app_backend_guided_base",
        principalId: "principal_guided",
        idempotencyKey: "product-app.backend-guided-base-input",
        jobIdempotencyKey: "product-app.backend-guided-base-job",
        content: [
          {
            type: "text",
            id: "guided_base_text",
            text: "base work"
          }
        ],
        executionBinding: createTestTurnExecutionBinding({
          id: "product-app.backend-fake",
          kind: "fake",
          capabilities: { input: ["text"], output: ["text"] },
          providerId: "fake",
          modelId: "product-app.backend-model"
        }),
        maxSteps: 1
      })
      const workerId = "worker_product_app_backend_guided"
      const job = await storage.claimJob({
        workerId,
        leaseMs: 60_000,
        kinds: ["session.turn"]
      })
      if (job === null || job.leaseToken === undefined) {
        throw new Error("expected guided base turn job claim")
      }
      await storage.startSessionTurnAttempt({
        sessionId: submitted.turn.sessionId,
        turnId: submitted.turn.id,
        inputId: submitted.admission.inputId,
        jobId: submitted.job.id,
        workerId,
        leaseToken: job.leaseToken
      })
      app = await createProductAppBackendApp({
        storage: {
          kind: "local-system-service",
          storeDir
        },
        artifacts: {
          explicitPath: serviceBin
        }
      })

      await expect(
        app.commands.routeWorkflowEnvelope({
          kind: "guided_follow_up",
          text: "after this, summarize risks",
          sessionId: "ses_product_app_backend_guided_envelope",
          activeTurnId: submitted.turn.id,
          sourceRef: "composer-guided"
        })
      ).resolves.toMatchObject({
        kind: "guided_follow_up",
        command: "queueGuidedFollowUp",
        result: {
          sessionId: "ses_product_app_backend_guided_envelope",
          activeTurnId: submitted.turn.id,
          input: {
            intent: "follow_up",
            sourceRef: "composer-guided",
            runControlPolicy: "queue_after_current"
          },
          job: {
            kind: "session.turn",
            state: "ready",
            providerProfileId: "product-app.backend-fake"
          }
        }
      })

      const guidedInputs = await storage.listSessionInputs({
        sessionId: "ses_product_app_backend_guided_envelope"
      })
      const guidedReadModel = await app.commands.readSessionInputProvenance({
        sessionId: "ses_product_app_backend_guided_envelope"
      })
      const followUpInput = guidedInputs.find(
        (input) => input.intent === "follow_up"
      )
      const followUpRow = guidedReadModel.rows.find(
        (row) => row.intent === "follow_up"
      )
      expect(guidedInputs).toHaveLength(2)
      expect(followUpInput).toMatchObject({
        origin: {
          kind: "interactive",
          sourceRef: "composer-guided",
          parentRef: submitted.turn.id,
          metadata: {
            productPolicy: "queue_after_current"
          }
        },
        intent: "follow_up",
        runControlPolicy: "queue_after_current",
        expectedTurnId: submitted.turn.id
      })
      expect(followUpRow).toMatchObject({
        kind: "interactive",
        label: "Interactive",
        sourceRef: "composer-guided",
        parentRef: submitted.turn.id,
        intent: "follow_up",
        runControlPolicy: "queue_after_current",
        expectedTurnId: submitted.turn.id,
        metadataKeys: ["productPolicy"]
      })

    } finally {
      await storage.dispose()
      await app?.dispose()
    }
  })

  it("runs agent turns with a product-owned context profile", async () => {
    const storeDir = await createStoreDir()
    const workspaceRoot = await createStoreDir()
    const cwd = join(workspaceRoot, "apps/demo")
    await writeFileRecursive(join(workspaceRoot, "AGENTS.md"), "Use product profile.")
    await writeFileRecursive(
      join(workspaceRoot, ".agents/skills/write-tests/SKILL.md"),
      skillMd({
        name: "write-tests",
        description: "Write focused tests.",
        body: "FULL APP COMMAND RUNTIME SKILL BODY"
      })
    )
    const app = await createProductAppBackendApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      },
      agentContextProfile: {
        instructions: {
          cwd,
          projectRoot: workspaceRoot,
          trustProject: true
        },
        skills: {
          cwd,
          projectRoot: workspaceRoot,
          trustProject: true,
          registerActivationTool: true
        }
      }
    })

    try {
      const result = await app.commands.submitConversationOperation({
        content: [{ type: "text", text: "use configured context" }],
        sessionId: "ses_product_app_backend_context"
      })

      expect(result).toMatchObject({
        sessionId: "ses_product_app_backend_context",
        state: expect.stringMatching(/queued|running|succeeded/)
      })
      expect(JSON.stringify(result)).not.toContain(
        "FULL APP COMMAND RUNTIME SKILL BODY"
      )
      expect(app.status().agentContext).toMatchObject({
        configured: true,
        revision: 1,
        context: {
          instructionSources: 1,
          skillNames: ["write-tests"],
          activationToolRegistered: true
        }
      })
    } finally {
      await app.dispose()
    }
  })

  it("hot reloads context profile config for later product commands", async () => {
    const storeDir = await createStoreDir()
    const workspaceRoot = await createStoreDir()
    const firstCwd = join(workspaceRoot, "first")
    const secondCwd = join(workspaceRoot, "second")
    await writeFileRecursive(join(workspaceRoot, "AGENTS.md"), "Use hot profile.")
    await writeFileRecursive(
      join(workspaceRoot, ".agents/skills/first-skill/SKILL.md"),
      skillMd({
        name: "first-skill",
        description: "First skill.",
        body: "FIRST SKILL BODY"
      })
    )
    await writeFileRecursive(
      join(workspaceRoot, "custom-skills/second-skill/SKILL.md"),
      skillMd({
        name: "second-skill",
        description: "Second skill.",
        body: "SECOND SKILL BODY"
      })
    )
    const app = await createProductAppBackendApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      },
      agentContextProfile: {
        instructions: {
          cwd: firstCwd,
          projectRoot: workspaceRoot,
          trustProject: true
        },
        skills: {
          cwd: firstCwd,
          projectRoot: workspaceRoot,
          trustProject: true,
          registerActivationTool: true
        }
      }
    })

    try {
      await expect(
        app.commands.submitConversationOperation({
          content: [{ type: "text", text: "first profile" }],
          sessionId: "ses_product_app_backend_hot_first"
        })
      ).resolves.toMatchObject({
        sessionId: "ses_product_app_backend_hot_first"
      })

      await expect(
        app.commands.setAgentContextProfile({
          instructions: {
            cwd: secondCwd,
            projectRoot: workspaceRoot,
            trustProject: true
          },
          skills: {
            cwd: secondCwd,
            projectRoot: workspaceRoot,
            projectSkillDirs: ["custom-skills"],
            trustProject: true,
            registerActivationTool: true
          }
        })
      ).resolves.toMatchObject({
        key: PRODUCT_APP_BACKEND_AGENT_CONTEXT_PROFILE_KEY,
        reloaded: true,
        detail: {
          revision: 2,
          instructionSources: 1,
          skillNames: ["second-skill"],
          activationToolRegistered: true
        }
      })

      await app.commands.submitConversationOperation({
        content: [{ type: "text", text: "second profile" }],
        sessionId: "ses_product_app_backend_hot_second"
      })
      expect(app.status().agentContext).toMatchObject({
        configured: true,
        revision: 2,
        context: {
          skillNames: ["second-skill"]
        }
      })
    } finally {
      await app.dispose()
    }
  })

  it("fails closed on malformed hot reload config and keeps the previous profile", async () => {
    const storeDir = await createStoreDir()
    const workspaceRoot = await createStoreDir()
    await writeFileRecursive(join(workspaceRoot, "AGENTS.md"), "Use safe profile.")
    await writeFileRecursive(
      join(workspaceRoot, ".agents/skills/safe-skill/SKILL.md"),
      skillMd({
        name: "safe-skill",
        description: "Safe skill.",
        body: "SAFE SKILL BODY"
      })
    )
    const app = await createProductAppBackendApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      },
      agentContextProfile: {
        skills: {
          cwd: workspaceRoot,
          projectRoot: workspaceRoot,
          trustProject: true,
          registerActivationTool: true
        }
      }
    })
    const storage = createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin
    })

    try {
      await storage.putConfig(PRODUCT_APP_BACKEND_AGENT_CONTEXT_PROFILE_KEY, {
        skills: {
          cwd: "",
          registerActivationTool: true
        }
      })
      const reload = await app.commands.refreshAgentContextProfile()

      expect(reload).toMatchObject({
        key: PRODUCT_APP_BACKEND_AGENT_CONTEXT_PROFILE_KEY,
        reloaded: false,
        error: {
          name: "Error",
          message:
            "agent context profile.skills.cwd must be a non-empty string"
        }
      })
      expect(app.status().agentContext).toMatchObject({
        configured: true,
        revision: 1,
        context: {
          skillNames: ["safe-skill"]
        }
      })
      await expect(
        app.commands.submitConversationOperation({
          content: [{ type: "text", text: "after bad config" }],
          sessionId: "ses_product_app_backend_bad_profile"
        })
      ).resolves.toMatchObject({
        sessionId: "ses_product_app_backend_bad_profile"
      })
    } finally {
      await storage.dispose()
      await app.dispose()
    }
  })

  it("treats same-profile instruction file changes as context reloads", async () => {
    const storeDir = await createStoreDir()
    const workspaceRoot = await createStoreDir()
    const instructionPath = join(workspaceRoot, "AGENTS.md")
    await writeFileRecursive(instructionPath, "Use first instruction.")
    const app = await createProductAppBackendApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      },
      agentContextProfile: {
        instructions: {
          cwd: workspaceRoot,
          projectRoot: workspaceRoot,
          trustProject: true
        }
      }
    })

    try {
      await expect(app.commands.refreshAgentContextProfile()).resolves.toMatchObject({
        key: PRODUCT_APP_BACKEND_AGENT_CONTEXT_PROFILE_KEY,
        reloaded: false,
        reason: "unchanged",
        detail: {
          revision: 1,
          instructionSources: 1
        }
      })

      await writeFile(instructionPath, "Use second instruction.", {
        encoding: "utf8",
        flush: true
      })
      await expect(app.commands.refreshAgentContextProfile()).resolves.toMatchObject({
        key: PRODUCT_APP_BACKEND_AGENT_CONTEXT_PROFILE_KEY,
        reloaded: true,
        detail: {
          revision: 2,
          instructionSources: 1
        }
      })
      expect(app.status().agentContext).toMatchObject({
        configured: true,
        revision: 2,
        context: {
          instructionSources: 1
        }
      })
    } finally {
      await app.dispose()
    }
  })

  it("runs an optional product-owned context refresh monitor", async () => {
    const storeDir = await createStoreDir()
    const workspaceRoot = await createStoreDir()
    const instructionPath = join(workspaceRoot, "AGENTS.md")
    await writeFileRecursive(instructionPath, "Monitor first instruction.")
    const app = await createProductAppBackendApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      },
      agentContextProfile: {
        instructions: {
          cwd: workspaceRoot,
          projectRoot: workspaceRoot,
          trustProject: true
        }
      }
    })

    try {
      await expect(
        app.commands.startAgentContextMonitor({ intervalMs: 100 })
      ).resolves.toMatchObject({
        running: true,
        intervalMs: 100,
        refreshCount: 0
      })
      await writeFile(instructionPath, "Monitor second instruction.", {
        encoding: "utf8",
        flush: true
      })
      await eventually(() => {
        expect(app.status().agentContextMonitor).toMatchObject({
          running: true,
          intervalMs: 100,
          lastResult: {
            key: PRODUCT_APP_BACKEND_AGENT_CONTEXT_PROFILE_KEY,
            reloaded: true,
            detail: {
              revision: 2,
              instructionSources: 1
            }
          }
        })
        expect(app.status().agentContextMonitor.refreshCount).toBeGreaterThan(0)
      })
      await expect(app.commands.stopAgentContextMonitor()).resolves.toMatchObject({
        running: false,
        intervalMs: 100
      })
    } finally {
      await app.dispose()
    }
  })

  it("stops the optional context monitor during shutdown", async () => {
    const storeDir = await createStoreDir()
    const workspaceRoot = await createStoreDir()
    await writeFileRecursive(join(workspaceRoot, "AGENTS.md"), "Shutdown monitor.")
    const app = await createProductAppBackendApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      },
      agentContextProfile: {
        instructions: {
          cwd: workspaceRoot,
          projectRoot: workspaceRoot,
          trustProject: true
        }
      }
    })

    await app.commands.startAgentContextMonitor({ intervalMs: 100 })
    await expect(app.commands.shutdown()).resolves.toEqual({
      disposed: true,
      repeated: false
    })
    expect(app.status().agentContextMonitor.running).toBe(false)
  })
})

async function createStoreDir(): Promise<string> {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-product-app.backend-"))
  tempDirs.push(storeDir)
  return storeDir
}

async function writeFileRecursive(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, text, { encoding: "utf8", flush: true })
}

function skillMd(options: {
  readonly name: string
  readonly description: string
  readonly body: string
}): string {
  return [
    "---",
    `name: ${JSON.stringify(options.name)}`,
    `description: ${JSON.stringify(options.description)}`,
    "---",
    "",
    options.body
  ].join("\n")
}

async function eventually(assertion: () => void): Promise<void> {
  const started = Date.now()
  let lastError: unknown
  while (Date.now() - started < 1_000) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
      await delay(25)
    }
  }
  throw lastError
}
