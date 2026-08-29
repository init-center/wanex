import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { afterEach, describe, expect, it } from "vitest"
import {
  createAppExtensionCatalog,
  createStaticAppExtensionCatalogSource,
  resolveAppExtensionContributions,
  type AppCommandContribution
} from "@wanex/extension"
import {
  createStorageTestStore,
  createTestTurnExecutionBinding
} from "@wanex/storage/testing"
import {
  BACKEND_AGENT_CONTEXT_PROFILE_KEY,
  BACKEND_CAPABILITY_IDS,
  BACKEND_COMMAND_PORT_COMMANDS,
  BACKEND_HANDLER_REFS,
  BACKEND_INTEGRATION_CONTRACT,
  createBackendCommandPort,
  createBackendCommandPortJsonMapper,
  createBackendShell,
  envelopeBackendRouteResult,
  createBackendApp,
  readBackendOverview,
  projectBackendSafeError
} from "../../src/backend/index.js"
import {
  createBackendConversationSettlementFixture
} from "./conversation-settlement-fixture.js"
import { assistantTestModelEndpoint } from "../model-endpoint-fixture.js"

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

describe("@wanex/assistant backend", () => {
  it("freezes the assistant integration contract", () => {
    expect(BACKEND_INTEGRATION_CONTRACT).toMatchObject({
      kind: "assistant.integration-contract",
      recommendedPackage: "@wanex/assistant",
      recommendedEntryPoint: "@wanex/assistant",
      rendererEntryPoint: "@wanex/assistant/surface",
      rendererBoundary: {
        rendererMayOpenStorage: false,
        rendererMayReceiveStorePath: false,
        rendererMayReceiveServiceBinaryPath: false,
        rendererCalls: "app-owned-ipc-or-api"
      }
    })
    expect(BACKEND_INTEGRATION_CONTRACT.backendDependencies).toEqual([
      "@wanex/app"
    ])
    expect(
      BACKEND_INTEGRATION_CONTRACT.forbiddenDefaultDependencies
    ).toEqual([
      "@wanex/storage",
      "@wanex/plugin",
      "@wanex/connector",
      "@wanex/runtime/host"
    ])
    expect(BACKEND_INTEGRATION_CONTRACT.lifecycleSteps).toEqual([
      "create_app",
      "adapt_command_port",
      "dispose_app"
    ])
    expect(BACKEND_INTEGRATION_CONTRACT.assistantOwnedState).toEqual([
      "selected_session",
      "panel_layout",
      "mode_routing",
      "renderer_state",
      "ui_preferences"
    ])
  })

  it("dispatches application backend command port requests through safe envelopes", async () => {
    const storeDir = await createStoreDir()
    const settlementFixture = createBackendConversationSettlementFixture({
      storeDir,
      serviceBin
    })
    const app = await createBackendApp({
      storage: settlementFixture.storage,
      modelEndpoint: testModelEndpoint("assistant.backend-port")
    })
    const port = createBackendCommandPort(app)

    try {
      await expect(
        port.dispatch({
          command: BACKEND_COMMAND_PORT_COMMANDS.readAssistantCapabilities
        })
      ).resolves.toMatchObject({
        ok: true,
        command: "readAssistantCapabilities",
        value: {
          selectedCount: 7,
          notSelectedCount: 2
        }
      })
      await expect(
        port.dispatch({
          command: BACKEND_COMMAND_PORT_COMMANDS.readAssistantCommands
        })
      ).resolves.toMatchObject({
        ok: true,
        command: "readAssistantCommands",
        value: {
          commands: expect.arrayContaining([
            expect.objectContaining({
              id: "assistant.agent.submit",
              handlerRef: BACKEND_HANDLER_REFS.submitConversationOperation
            })
          ])
        }
      })

      await expect(
        port.dispatch({
          command:
            BACKEND_COMMAND_PORT_COMMANDS.explainAssistantCommandContribution,
          input: {
            commandId: "assistant.agent.submit"
          }
        })
      ).resolves.toMatchObject({
        ok: true,
        command: "explainAssistantCommandContribution",
        value: {
          kind: "found",
          commandId: "assistant.agent.submit",
          handler: {
            supported: true,
            policy: "allow_listed"
          }
        }
      })

      await expect(
        port.dispatch({
          command:
            BACKEND_COMMAND_PORT_COMMANDS.previewAssistantCommandInvocation,
          input: {
            commandId: "assistant.agent.submit",
            input: {
              text: "preview through command port"
            }
          }
        })
      ).resolves.toMatchObject({
        ok: true,
        command: "previewAssistantCommandInvocation",
        value: {
          kind: "runnable",
          commandId: "assistant.agent.submit",
          handlerRef: BACKEND_HANDLER_REFS.submitConversationOperation,
          inputAccepted: true
        }
      })

      await expect(
        port.dispatch({
          command:
            BACKEND_COMMAND_PORT_COMMANDS.previewAssistantCommandInvocation,
          input: {
            commandId: "assistant.agent.submit",
            input: {
              text: ""
            }
          }
        })
      ).resolves.toMatchObject({
        ok: true,
        command: "previewAssistantCommandInvocation",
        value: {
          kind: "rejected",
          commandId: "assistant.agent.submit",
          reason: "invalid_input",
          message: "input string is too short",
          inputValidation: {
            source: "schema",
            issues: [expect.objectContaining({
              path: "/text",
              keyword: "minLength"
            })]
          }
        }
      })

      await expect(
        port.dispatch({
          command: BACKEND_COMMAND_PORT_COMMANDS.routeInput,
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
            activeModelEndpointId: "assistant.backend-port"
          }
        }
      })

      const conversationSettled =
        settlementFixture.settlements.waitForSession(
          "ses_assistant_app_backend_command_port"
        )
      const executedAgent = await port.dispatch({
          command: BACKEND_COMMAND_PORT_COMMANDS.executeAssistantCommand,
          input: {
            commandId: "assistant.agent.submit",
            input: {
              text: "through command port",
              sessionId: "ses_assistant_app_backend_command_port"
            }
          }
        })
      expect(executedAgent).toMatchObject({
        ok: true,
        command: "executeAssistantCommand",
        value: {
          kind: "submitted",
          commandId: "assistant.agent.submit",
          value: {
            sessionId: "ses_assistant_app_backend_command_port",
            state: expect.stringMatching(/queued|running|succeeded/)
          }
        }
      })
      await conversationSettled

      await expect(
        port.dispatch({
          command: BACKEND_COMMAND_PORT_COMMANDS.readSessionTranscript,
          input: {
            sessionId: "ses_assistant_app_backend_command_port"
          }
        })
      ).resolves.toMatchObject({
        ok: true,
        command: "readSessionTranscript",
        value: {
          sessionId: "ses_assistant_app_backend_command_port",
          rows: [
            expect.objectContaining({
              kind: "message",
              role: "user",
              text: "through command port"
            }),
            expect.objectContaining({
              kind: "message",
              role: "assistant",
              text: "Fake response from assistant.backend-port-model"
            })
          ]
        }
      })

      await expect(
        port.dispatch({
          command: BACKEND_COMMAND_PORT_COMMANDS.readRecentSessions,
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
              sessionId: "ses_assistant_app_backend_command_port",
              kind: "agent",
              status: "active"
            })
          ]
        }
      })

      await expect(
        port.dispatch({
          command: BACKEND_COMMAND_PORT_COMMANDS.readAssistantWorkbench,
          input: {
            sessionId: "ses_assistant_app_backend_command_port"
          }
        })
      ).resolves.toMatchObject({
        ok: true,
        command: "readAssistantWorkbench",
        value: {
          kind: "assistant.backend.workbench",
          sessionId: "ses_assistant_app_backend_command_port",
          summary: {
            inputCount: 1,
            messageCount: 2,
            latestAssistantText: "Fake response from assistant.backend-port-model",
            latestUserText: "through command port",
            originKinds: ["interactive"]
          },
          actions: {
            submitCommandId: "assistant.agent.submit"
          }
        }
      })
    } finally {
      await app.dispose()
      await settlementFixture.dispose()
    }
  })

  it("fails closed for application backend command port unknown commands and invalid input", async () => {
    const storeDir = await createStoreDir()
    const app = await createBackendApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      }
    })
    const port = createBackendCommandPort(app)

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
          message: "unknown backend port command: plugin.run"
        }
      })

      await expect(
        port.dispatch({
          command: BACKEND_COMMAND_PORT_COMMANDS.routeInput,
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
          message: "unknown assistant command: /missing"
        }
      })

      await expect(
        port.dispatch({
          command: BACKEND_COMMAND_PORT_COMMANDS.submitConversationOperation,
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
          command: BACKEND_COMMAND_PORT_COMMANDS.readRecentSessions,
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
          command: BACKEND_COMMAND_PORT_COMMANDS.readAssistantWorkbench,
          input: {}
        })
      ).resolves.toMatchObject({
        ok: false,
        command: "readAssistantWorkbench",
        error: {
          code: "validation_error",
          category: "validation",
          message:
            "readAssistantWorkbench input.sessionId must be a non-empty string"
        }
      })
    } finally {
      await app.dispose()
    }
  })

  it("maps application backend command port requests to JSON responses without a transport dependency", async () => {
    const storeDir = await createStoreDir()
    const settlementFixture = createBackendConversationSettlementFixture({
      storeDir,
      serviceBin
    })
    const app = await createBackendApp({
      storage: settlementFixture.storage,
      modelEndpoint: testModelEndpoint("assistant.backend-json-mapper")
    })
    const mapper = createBackendCommandPortJsonMapper(
      createBackendCommandPort(app)
    )

    try {
      await expect(
        mapper.dispatchJson(
          JSON.stringify({
            command:
              BACKEND_COMMAND_PORT_COMMANDS.readAssistantCapabilities
          })
        )
      ).resolves.toMatchObject({
        status: "success",
        envelope: {
          ok: true,
          command: "readAssistantCapabilities",
          value: {
            selectedCount: 7
          }
        }
      })

      const routed = await mapper.dispatchJson(
        JSON.stringify({
          command: BACKEND_COMMAND_PORT_COMMANDS.routeInput,
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
            BACKEND_COMMAND_PORT_COMMANDS.explainAssistantCommandContribution,
          input: {
            commandId: "assistant.agent.submit"
          }
        })
      )
      expect(explained).toMatchObject({
        status: "success",
        envelope: {
          ok: true,
          command: "explainAssistantCommandContribution",
          value: {
            kind: "found",
            commandId: "assistant.agent.submit",
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
          command: BACKEND_COMMAND_PORT_COMMANDS.readRecentSessions,
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
          "ses_assistant_app_backend_json_workbench"
        )
      await mapper.dispatchJson(
        JSON.stringify({
          command: BACKEND_COMMAND_PORT_COMMANDS.submitConversationOperation,
          input: {
            sessionId: "ses_assistant_app_backend_json_workbench",
            text: "seed JSON workbench"
          }
        })
      )
      await conversationSettled
      const workbench = await mapper.dispatchJson(
        JSON.stringify({
          command: BACKEND_COMMAND_PORT_COMMANDS.readAssistantWorkbench,
          input: {
            sessionId: "ses_assistant_app_backend_json_workbench"
          }
        })
      )
      expect(workbench).toMatchObject({
        status: "success",
        envelope: {
          ok: true,
          command: "readAssistantWorkbench",
          value: {
            kind: "assistant.backend.workbench",
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
            BACKEND_COMMAND_PORT_COMMANDS.previewAssistantCommandInvocation,
          input: {
            commandId: "assistant.overview.read",
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
          command: "previewAssistantCommandInvocation",
          value: {
            kind: "runnable",
            commandId: "assistant.overview.read",
            handlerRef: BACKEND_HANDLER_REFS.readAssistantOverview,
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
            command: BACKEND_COMMAND_PORT_COMMANDS.submitConversationOperation,
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

  it("owns the application backend, command port, and JSON mapper in one local backend shell", async () => {
    const storeDir = await createStoreDir()
    const shell = await createBackendShell({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      },
      modelEndpoint: testModelEndpoint("assistant.backend-backend-shell")
    })

    expect(shell.status()).toMatchObject({
      disposed: false,
      activeModelEndpointId: "assistant.backend-backend-shell"
    })
    expect(shell.commands.readAssistantCapabilities()).toMatchObject({
      selectedCount: 7,
      notSelectedCount: 2
    })
    expect(shell.port).toBeDefined()
    expect(shell.json).toBeDefined()

    await expect(
      shell.dispatch({
        command: BACKEND_COMMAND_PORT_COMMANDS.routeInput,
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
          activeModelEndpointId: "assistant.backend-backend-shell"
        }
      }
    })

    await expect(
      shell.dispatchJson(
        JSON.stringify({
          command:
            BACKEND_COMMAND_PORT_COMMANDS.readAssistantCapabilities
        })
      )
    ).resolves.toMatchObject({
      status: "success",
      envelope: {
        ok: true,
        command: "readAssistantCapabilities",
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
        command: BACKEND_COMMAND_PORT_COMMANDS.readDiagnostics
      })
    ).resolves.toEqual({
      ok: false,
      command: "readDiagnostics",
      error: {
        code: "lifecycle_error",
        category: "lifecycle",
        message: "application backend is disposed"
      }
    })
  })

  it("projects a assistant overview read model through typed, port, and JSON backend shell paths", async () => {
    const storeDir = await createStoreDir()
    const shell = await createBackendShell({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      },
      modelEndpoint: testModelEndpoint("assistant.backend-overview")
    })

    try {
      await shell.commands.submitConversationOperation({
        content: [{ type: "text", text: "seed assistant home" }],
        sessionId: "ses_assistant_app_backend_overview_home"
      })
      await expect(
        shell.commands.readAssistantOverview({
          now: 7_001,
          recentSessionLimit: 2
        })
      ).resolves.toMatchObject({
        kind: "assistant.backend.overview",
        generatedAt: 7_001,
        ready: true,
        lifecycle: {
          disposed: false,
          ready: true,
          shutdownCommandId: "assistant.shutdown"
        },
        runtimeHost: {
          observed: false,
          attentionRequired: false
        },
        provider: {
          activeEndpointId: "assistant.backend-overview"
        },
        capabilities: {
          selectedCount: 7,
          notSelectedCount: 2,
          selectedIds: expect.arrayContaining([
            BACKEND_CAPABILITY_IDS.appHost,
            BACKEND_CAPABILITY_IDS.assistantCommandRegistry
          ]),
          notSelectedIds: expect.arrayContaining([
            BACKEND_CAPABILITY_IDS.pluginActionExecution
          ])
        },
        commands: {
          totalCount: 14,
          builtinCount: 14,
          extensionCount: 0,
          primary: expect.arrayContaining([
            expect.objectContaining({
              id: "assistant.agent.submit",
              sourceKind: "builtin"
            }),
            expect.objectContaining({
              id: "assistant.overview.read",
              sourceKind: "builtin"
            })
          ])
        },
        sessions: {
          recentCount: 1,
          recentLimit: 2,
          recent: [
            expect.objectContaining({
              sessionId: "ses_assistant_app_backend_overview_home",
              kind: "agent",
              status: "active"
            })
          ]
        },
        recommendedActions: expect.arrayContaining([
          expect.objectContaining({
            id: "context.refresh",
            commandId: "assistant.context.refresh",
            reason: "context_not_configured"
          }),
          expect.objectContaining({
            id: "agent.submit",
            commandId: "assistant.agent.submit",
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
          command: BACKEND_COMMAND_PORT_COMMANDS.readAssistantOverview,
          input: {
            now: 7_002
          }
        })
      ).resolves.toMatchObject({
        ok: true,
        command: "readAssistantOverview",
        value: {
          kind: "assistant.backend.overview",
          generatedAt: 7_002,
          provider: {
            activeEndpointId: "assistant.backend-overview"
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
          command: BACKEND_COMMAND_PORT_COMMANDS.readAssistantOverview,
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
          command: "readAssistantOverview",
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

  it("summarizes runtime-host diagnostics in the assistant overview read model", async () => {
    const overview = await readBackendOverview(
      {
        status() {
          return {
            disposed: false,
            started: true,
            workerCount: 1,
            activeModelEndpointId: "overview-host",
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
        readAssistantCapabilities() {
          return {
            selectedCount: 0,
            notSelectedCount: 0,
            extensionConfigured: false,
            capabilities: []
          }
        },
        readAssistantCommands() {
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
      recent: [],
      archivedCount: 0,
      archived: []
    })
    expect(overview.recommendedActions).toEqual([
      {
        id: "diagnostics.review",
        commandId: "assistant.diagnostics.detail.read",
        label: "Review Diagnostics",
        priority: 10,
        reason: "diagnostic_attention"
      },
      {
        id: "runtime.review",
        commandId: "assistant.diagnostics.detail.read",
        label: "Review Runtime",
        priority: 20,
        reason: "runtime_attention"
      },
      {
        id: "context.refresh",
        commandId: "assistant.context.refresh",
        label: "Refresh Context",
        priority: 30,
        reason: "context_not_configured"
      },
      {
        id: "session.start",
        commandId: "assistant.agent.submit",
        label: "Start Session",
        priority: 40,
        reason: "no_recent_sessions"
      },
      {
        id: "agent.submit",
        commandId: "assistant.agent.submit",
        label: "Submit Agent Turn",
        priority: 50,
        reason: "ready"
      }
    ])
  })

  it("projects assistant diagnostics detail through typed, port, JSON, and command paths", async () => {
    const storeDir = await createStoreDir()
    const settlementFixture = createBackendConversationSettlementFixture({
      storeDir,
      serviceBin
    })
    const shell = await createBackendShell({
      storage: settlementFixture.storage,
      modelEndpoint: testModelEndpoint("assistant.backend-diagnostics-detail")
    })

    try {
      const receipt = await shell.commands.submitConversationOperation({
        content: [{ type: "text", text: "seed diagnostics detail" }],
        sessionId: "ses_assistant_app_backend_diagnostics_detail"
      })
      await settlementFixture.settlements.waitForJob(receipt.jobId)

      await expect(
        shell.commands.readAssistantDiagnosticsDetail({
          now: 8_101,
          diagnosticLimit: 1,
          activityLimit: 1
        })
      ).resolves.toMatchObject({
        kind: "assistant.backend.diagnostics-detail",
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
            BACKEND_COMMAND_PORT_COMMANDS.readAssistantDiagnosticsDetail,
          input: {
            now: 8_102,
            diagnosticLimit: 2,
            activityLimit: 2
          }
        })
      ).resolves.toMatchObject({
        ok: true,
        command: "readAssistantDiagnosticsDetail",
        value: {
          kind: "assistant.backend.diagnostics-detail",
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
            BACKEND_COMMAND_PORT_COMMANDS.readAssistantDiagnosticsDetail,
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
          command: "readAssistantDiagnosticsDetail",
          value: {
            kind: "assistant.backend.diagnostics-detail",
            generatedAt: 8_103
          }
        }
      })
      expect(JSON.parse(json.body)).toEqual(json.envelope)

      await expect(
        shell.dispatch({
          command:
            BACKEND_COMMAND_PORT_COMMANDS.readAssistantDiagnosticsDetail,
          input: "bad"
        })
      ).resolves.toMatchObject({
        ok: false,
        command: "readAssistantDiagnosticsDetail",
        error: {
          code: "validation_error",
          message: "readAssistantDiagnosticsDetail input must be an object"
        }
      })

      await expect(
        shell.commands.executeAssistantCommand({
          commandId: "assistant.diagnostics.detail.read",
          input: {
            now: 8_104,
            diagnosticLimit: 1,
            activityLimit: 1
          }
        })
      ).resolves.toMatchObject({
        kind: "completed",
        commandId: "assistant.diagnostics.detail.read",
        value: {
          kind: "assistant.backend.diagnostics-detail",
          generatedAt: 8_104
        }
      })
    } finally {
      await shell.dispose()
      await settlementFixture.dispose()
    }
  })

  it("keeps storage behind assistant commands and rejects calls after shutdown", async () => {
    const storeDir = await createStoreDir()
    const app = await createBackendApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      },
      modelEndpoint: testModelEndpoint("assistant.backend-commands")
    })

    expect(app.status()).toEqual({
      disposed: false,
      started: true,
      workerCount: 1,
      activeModelEndpointId: "assistant.backend-commands",
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
        content: [{ type: "text", text: "through assistant facade" }],
        sessionId: "ses_assistant_app_backend_commands"
      })
    ).resolves.toMatchObject({
      sessionId: "ses_assistant_app_backend_commands",
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

  it("reports selected and not-selected assistant capabilities without loading optional runtimes", async () => {
    const storeDir = await createStoreDir()
    const app = await createBackendApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      }
    })

    try {
      expect(app.commands.readAssistantCapabilities()).toMatchObject({
        selectedCount: 7,
        notSelectedCount: 2,
        extensionConfigured: false,
        capabilities: expect.arrayContaining([
          expect.objectContaining({
            id: BACKEND_CAPABILITY_IDS.appHost,
            state: "enabled",
            ownerPackage: "@wanex/app",
            defaultSelected: true
          }),
          expect.objectContaining({
            id: BACKEND_CAPABILITY_IDS.assistantCommandRegistry,
            state: "enabled",
            ownerPackage: "@wanex/app",
            commandIds: expect.arrayContaining([
              "readAssistantOverview",
              "readRecentSessions",
              "readAssistantWorkbench",
              "readAssistantDiagnosticsDetail",
              "readAssistantCommands",
              "explainAssistantCommandContribution",
              "previewAssistantCommandInvocation",
              "executeAssistantCommand"
            ])
          }),
          expect.objectContaining({
            id: BACKEND_CAPABILITY_IDS.pluginActionExecution,
            state: "not_selected",
            ownerPackage: "@wanex/assistant-plugin-host",
            defaultSelected: false
          }),
          expect.objectContaining({
            id: BACKEND_CAPABILITY_IDS.connectorRuntime,
            state: "not_selected",
            ownerPackage: "@wanex/connector"
          })
        ])
      })
    } finally {
      await app.dispose()
    }
  })

  it("reflects configured extension sources in the assistant capability read model", async () => {
    const storeDir = await createStoreDir()
    const app = await createBackendApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      },
      extensions: {
        source: createStaticAppExtensionCatalogSource({
          revision: "assistant-capability-extension-v1",
          snapshot: resolveAppExtensionContributions([
            {
              id: "plugin.echo",
              domain: "command",
              value: {
                name: "plugin.echo",
                title: "Plugin Echo",
                paletteVisibility: "visible",
                handlerRef: "wanex.plugin-action:plugin.echo/echo?version=1.0.0"
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
        })
      }
    })

    try {
      expect(app.commands.readAssistantCapabilities()).toMatchObject({
        extensionConfigured: true,
        capabilities: expect.arrayContaining([
          expect.objectContaining({
            id: BACKEND_CAPABILITY_IDS.extensionCommandDiscovery,
            state: "enabled",
            notes: ["extension catalog configured"]
          })
        ])
      })
    } finally {
      await app.dispose()
    }
  })

  it("captures one catalog generation per command operation", async () => {
    const storeDir = await createStoreDir()
    const catalog = createAppExtensionCatalog(
      assistantCommandGeneration("assistant-command-generation-a", "1.0.0")
    )
    let currentCalls = 0
    const source = {
      current() {
        currentCalls += 1
        return catalog.source.current()
      },
      subscribe: catalog.source.subscribe
    }
    let releaseFirstExecution!: () => void
    const firstExecution = new Promise<void>((resolve) => {
      releaseFirstExecution = resolve
    })
    const handlerRefs: string[] = []
    const app = await createBackendApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      },
      extensions: { source },
      assistantCommands: {
        extensionExecutor: {
          supports(handlerRef) {
            return handlerRef.startsWith("wanex.plugin-action:")
          },
          preview() {
            return { ok: true }
          },
          async execute(request) {
            handlerRefs.push(request.handlerRef)
            if (handlerRefs.length === 1) {
              await firstExecution
            }
            return {
              kind: "submitted",
              value: {
                kind: "plugin-action.submitted",
                jobId: "job_dynamic"
              }
            }
          }
        }
      }
    })

    try {
      currentCalls = 0
      expect(app.commands.readAssistantCommands()).toMatchObject({
        extensionRevision: "assistant-command-generation-a",
        commands: expect.arrayContaining([
          expect.objectContaining({
            id: "plugin.dynamic",
            handlerRef: expect.stringContaining("version=1.0.0")
          })
        ])
      })
      expect(currentCalls).toBe(1)

      catalog.publish(
        assistantCommandGeneration("assistant-command-generation-b", "2.0.0")
      )
      currentCalls = 0
      expect(app.commands.readAssistantCommands()).toMatchObject({
        extensionRevision: "assistant-command-generation-b",
        commands: expect.arrayContaining([
          expect.objectContaining({
            id: "plugin.dynamic",
            handlerRef: expect.stringContaining("version=2.0.0")
          })
        ])
      })
      expect(currentCalls).toBe(1)

      const running = app.commands.executeAssistantCommand({
        commandId: "plugin.dynamic"
      })
      await eventually(() => expect(handlerRefs).toHaveLength(1))
      catalog.publish(
        assistantCommandGeneration("assistant-command-generation-c", "3.0.0")
      )
      releaseFirstExecution()
      await expect(running).resolves.toMatchObject({ kind: "submitted" })
      expect(handlerRefs[0]).toContain("version=2.0.0")

      await expect(
        app.commands.executeAssistantCommand({ commandId: "plugin.dynamic" })
      ).resolves.toMatchObject({ kind: "submitted" })
      expect(handlerRefs[1]).toContain("version=3.0.0")
    } finally {
      releaseFirstExecution()
      await app.dispose()
    }
  })

  it("routes ordinary text through the assistant agent command", async () => {
    const storeDir = await createStoreDir()
    const app = await createBackendApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      },
      modelEndpoint: testModelEndpoint("assistant.backend-route-agent")
    })

    try {
      const routed = await app.commands.routeInput({
        text: "route this to the agent",
        sessionId: "ses_assistant_app_backend_route_agent"
      })

      expect(routed).toMatchObject({
        kind: "agent",
        command: "submitConversationOperation",
        result: {
          sessionId: "ses_assistant_app_backend_route_agent",
          state: expect.stringMatching(/queued|running|succeeded/)
        }
      })
    } finally {
      await app.dispose()
    }
  })

  it("routes explicit assistant commands without admitting an agent turn", async () => {
    const storeDir = await createStoreDir()
    const app = await createBackendApp({
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
          disposed: false
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

  it("exposes built-in assistant commands as contributions and executes allow-listed handlers", async () => {
    const storeDir = await createStoreDir()
    const settlementFixture = createBackendConversationSettlementFixture({
      storeDir,
      serviceBin
    })
    const app = await createBackendApp({
      storage: settlementFixture.storage,
      modelEndpoint: assistantTestModelEndpoint({
        endpointId: "assistant.backend-command-registry",
        modelId: "assistant.backend-command-model"
      })
    })

    try {
      expect(app.commands.readAssistantCommands()).toMatchObject({
        diagnostics: [],
        commands: expect.arrayContaining([
          expect.objectContaining({
            id: "assistant.agent.submit",
            handlerRef: BACKEND_HANDLER_REFS.submitConversationOperation,
            sourceKind: "builtin",
            sourceScope: "builtin",
            trust: "trusted",
            paletteVisibility: "hidden",
            inputSchema: expect.objectContaining({
              type: "object",
              required: ["text"],
              additionalProperties: false
            })
          }),
          expect.objectContaining({
            id: "assistant.status",
            paletteVisibility: "visible"
          }),
          expect.objectContaining({
            id: "assistant.diagnostics.read",
            handlerRef: BACKEND_HANDLER_REFS.readDiagnostics
          }),
          expect.objectContaining({
            id: "assistant.diagnostics.detail.read",
            handlerRef:
              BACKEND_HANDLER_REFS.readAssistantDiagnosticsDetail
          }),
          expect.objectContaining({
            id: "assistant.provenance.read",
            handlerRef: BACKEND_HANDLER_REFS.readSessionInputProvenance
          }),
          expect.objectContaining({
            id: "assistant.transcript.read",
            handlerRef: BACKEND_HANDLER_REFS.readSessionTranscript
          })
        ])
      })
      const builtins = app.commands.readAssistantCommands().commands.filter(
        (command) => command.sourceKind === "builtin"
      )
      expect(builtins).toHaveLength(14)
      expect(
        builtins.find((command) => command.id === "assistant.status")
      ).not.toHaveProperty("inputSchema")
      expect(
        builtins.filter((command) => command.paletteVisibility === "visible")
      ).toEqual([
        expect.objectContaining({ id: "assistant.status" })
      ])
      expect(
        app.commands.previewAssistantCommandInvocation({
          commandId: "assistant.overview.read",
          input: {}
        })
      ).toMatchObject({ kind: "runnable", inputAccepted: true })
      expect(
        app.commands.previewAssistantCommandInvocation({
          commandId: "assistant.context.monitor.start",
          input: { intervalMs: 99 }
        })
      ).toMatchObject({
        kind: "rejected",
        reason: "invalid_input",
        inputValidation: {
          source: "schema",
          issues: [expect.objectContaining({
            path: "/intervalMs",
            keyword: "minimum"
          })]
        }
      })
      expect(
        app.commands.previewAssistantCommandInvocation({
          commandId: "assistant.status",
          input: {}
        })
      ).toMatchObject({
        kind: "rejected",
        reason: "invalid_input",
        inputValidation: { source: "handler" }
      })

      const conversationSettled =
        settlementFixture.settlements.waitForSession(
          "ses_assistant_app_backend_command_registry"
        )
      await expect(
        app.commands.executeAssistantCommand({
          commandId: "assistant.agent.submit",
          input: {
            text: "run through assistant registry",
            sessionId: "ses_assistant_app_backend_command_registry",
            inputId: "inp_assistant_app_backend_command_registry"
          }
        })
      ).resolves.toMatchObject({
        kind: "submitted",
        commandId: "assistant.agent.submit",
        handlerRef: BACKEND_HANDLER_REFS.submitConversationOperation,
        value: {
          sessionId: "ses_assistant_app_backend_command_registry",
          state: expect.stringMatching(/queued|running|succeeded/)
        }
      })
      await conversationSettled

      await expect(
        app.commands.executeAssistantCommand({
          commandId: "assistant.diagnostics.read",
          input: {
            now: 448
          }
        })
      ).resolves.toMatchObject({
        kind: "completed",
        commandId: "assistant.diagnostics.read",
        value: {
          generatedAt: 448
        }
      })

      await expect(
        app.commands.previewAssistantCommandInvocation({
          commandId: "assistant.diagnostics.detail.read",
          input: {
            now: 449,
            diagnosticLimit: 3,
            activityLimit: 2
          }
        })
      ).toMatchObject({
        kind: "runnable",
        commandId: "assistant.diagnostics.detail.read",
        handlerRef:
          BACKEND_HANDLER_REFS.readAssistantDiagnosticsDetail,
        inputAccepted: true
      })

      await expect(
        app.commands.executeAssistantCommand({
          commandId: "assistant.diagnostics.detail.read",
          input: {
            now: 449,
            diagnosticLimit: 3,
            activityLimit: 2
          }
        })
      ).resolves.toMatchObject({
        kind: "completed",
        commandId: "assistant.diagnostics.detail.read",
        handlerRef:
          BACKEND_HANDLER_REFS.readAssistantDiagnosticsDetail,
        value: {
          kind: "assistant.backend.diagnostics-detail",
          generatedAt: 449,
          limits: {
            diagnosticLimit: 3,
            activityLimit: 2
          }
        }
      })

      await expect(
        app.commands.previewAssistantCommandInvocation({
          commandId: "assistant.diagnostics.detail.read",
          input: "bad"
        })
      ).toMatchObject({
        kind: "rejected",
        commandId: "assistant.diagnostics.detail.read",
        reason: "invalid_input",
        message: "input must be an object",
        inputValidation: {
          source: "schema",
          issues: [expect.objectContaining({
            path: "/",
            keyword: "type"
          })]
        }
      })

      await expect(
        app.commands.executeAssistantCommand({
          commandId: "assistant.provenance.read",
          input: {
            sessionId: "ses_assistant_app_backend_command_registry"
          }
        })
      ).resolves.toMatchObject({
        kind: "completed",
        commandId: "assistant.provenance.read",
        value: {
          sessionId: "ses_assistant_app_backend_command_registry",
          rows: [
            expect.objectContaining({
              inputId: "inp_assistant_app_backend_command_registry",
              kind: "interactive"
            })
          ]
        }
      })

      await expect(
        app.commands.executeAssistantCommand({
          commandId: "assistant.transcript.read",
          input: {
            sessionId: "ses_assistant_app_backend_command_registry"
          }
        })
      ).resolves.toMatchObject({
        kind: "completed",
        commandId: "assistant.transcript.read",
        handlerRef: BACKEND_HANDLER_REFS.readSessionTranscript,
        value: {
          sessionId: "ses_assistant_app_backend_command_registry",
          rows: [
            expect.objectContaining({
              kind: "message",
              role: "user",
              text: "run through assistant registry"
            }),
            expect.objectContaining({
              kind: "message",
              role: "assistant",
              text: "Fake response from assistant.backend-command-model"
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
    const app = await createBackendApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      },
      extensions: {
        source: createStaticAppExtensionCatalogSource({
          revision: "assistant-unsupported-handler-v1",
          snapshot: resolveAppExtensionContributions([
            {
              id: "plugin.echo",
              domain: "command",
              value: {
                name: "plugin.echo",
                title: "Plugin Echo",
                category: "plugin",
                paletteVisibility: "visible",
                handlerRef: "wanex.plugin-action:plugin.echo/echo?version=1.0.0"
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
        })
      }
    })
    const storage = createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin
    })

    try {
      expect(app.commands.readAssistantCommands().commands).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "plugin.echo",
            handlerRef: "wanex.plugin-action:plugin.echo/echo?version=1.0.0",
            sourceKind: "plugin",
            sourceScope: "user",
            trust: "user_enabled"
          })
        ])
      )
      expect(
        app.commands.explainAssistantCommandContribution({
          commandId: "assistant.agent.submit"
        })
      ).toMatchObject({
        kind: "found",
        commandId: "assistant.agent.submit",
        source: {
          kind: "builtin",
          scope: "builtin",
          id: "assistant.backend",
          trust: "trusted"
        },
        contribution: {
          privileged: false
        },
        handler: {
          handlerRef: BACKEND_HANDLER_REFS.submitConversationOperation,
          supported: true,
          policy: "allow_listed"
        },
        diagnostics: []
      })
      expect(
        app.commands.explainAssistantCommandContribution({
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
          handlerRef: "wanex.plugin-action:plugin.echo/echo?version=1.0.0",
          supported: false,
          policy: "unsupported_handler_ref"
        },
        diagnostics: []
      })
      expect(
        app.commands.explainAssistantCommandContribution({
          commandId: "missing.command"
        })
      ).toEqual({
        kind: "missing",
        commandId: "missing.command",
        message: "assistant command contribution not found: missing.command",
        diagnostics: []
      })
      expect(
        app.commands.previewAssistantCommandInvocation({
          commandId: "assistant.agent.submit",
          input: {
            text: "preview does not execute"
          }
        })
      ).toMatchObject({
        kind: "runnable",
        commandId: "assistant.agent.submit",
        handlerRef: BACKEND_HANDLER_REFS.submitConversationOperation,
        inputAccepted: true
      })
      expect(
        app.commands.previewAssistantCommandInvocation({
          commandId: "plugin.echo",
          input: {
            text: "must not execute"
          }
        })
      ).toMatchObject({
        kind: "rejected",
        commandId: "plugin.echo",
        handlerRef: "wanex.plugin-action:plugin.echo/echo?version=1.0.0",
        reason: "unsupported_handler_ref"
      })
      expect(
        app.commands.previewAssistantCommandInvocation({
          commandId: "missing.command"
        })
      ).toEqual({
        kind: "rejected",
        commandId: "missing.command",
        reason: "command_not_found",
        message: "assistant command not found: missing.command"
      })

      await expect(
        app.commands.executeAssistantCommand({
          commandId: "plugin.echo",
          input: {
            text: "must not execute"
          }
        })
      ).resolves.toEqual({
        kind: "rejected",
        commandId: "plugin.echo",
        handlerRef: "wanex.plugin-action:plugin.echo/echo?version=1.0.0",
        reason: "unsupported_handler_ref",
        message:
          "assistant command handler is not allowed: wanex.plugin-action:plugin.echo/echo?version=1.0.0"
      })
      await expect(
        app.commands.executeAssistantCommand({
          commandId: "missing.command"
        })
      ).resolves.toEqual({
        kind: "rejected",
        commandId: "missing.command",
        reason: "command_not_found",
        message: "assistant command not found: missing.command"
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
    const app = await createBackendApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      },
      extensions: {
        source: createStaticAppExtensionCatalogSource({
          revision: "assistant-command-schema-v1",
          snapshot: resolveAppExtensionContributions([
            {
              id: "plugin.echo",
              domain: "command",
              value: {
                name: "plugin.echo",
                title: "Plugin Echo",
                paletteVisibility: "visible",
                handlerRef: "wanex.plugin-action:plugin.echo/echo?version=1.0.0",
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
        })
      },
      assistantCommands: {
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
              kind: "submitted",
              value: {
                kind: "plugin-action.submitted",
                jobId: "job_plugin_echo"
              }
            }
          }
        }
      }
    })

    try {
      expect(app.commands.readAssistantCapabilities()).toMatchObject({
        selectedCount: 8,
        notSelectedCount: 1,
        capabilities: expect.arrayContaining([
          expect.objectContaining({
            id: BACKEND_CAPABILITY_IDS.pluginActionExecution,
            state: "enabled",
            defaultSelected: false,
            commandIds: ["executeAssistantCommand"]
          })
        ])
      })
      expect(
        app.commands.explainAssistantCommandContribution({
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
        app.commands.readAssistantCommands().commands.find(
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
      const firstCatalog = app.commands.readAssistantCommands()
      const firstSchema = firstCatalog.commands.find(
        (command) => command.id === "plugin.echo"
      )?.inputSchema
      if (firstSchema?.properties?.text !== undefined) {
        ;(firstSchema.properties.text as { title?: string }).title = "mutated"
      }
      expect(
        app.commands.readAssistantCommands().commands.find(
          (command) => command.id === "plugin.echo"
        )?.inputSchema?.properties?.text
      ).toMatchObject({ title: "Text" })
      expect(
        app.commands.previewAssistantCommandInvocation({
          commandId: "plugin.echo",
          input: { text: "hello", count: 2, tags: ["a", "b"] }
        })
      ).toMatchObject({
        kind: "runnable",
        commandId: "plugin.echo",
        inputAccepted: true
      })
      expect(
        app.commands.previewAssistantCommandInvocation({
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
        app.commands.previewAssistantCommandInvocation({
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
        app.commands.previewAssistantCommandInvocation({
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
        app.commands.executeAssistantCommand({
          commandId: "plugin.echo",
          input: { text: "hello", count: 2 }
        })
      ).resolves.toMatchObject({
        kind: "submitted",
        commandId: "plugin.echo",
        value: {
          kind: "plugin-action.submitted",
          jobId: "job_plugin_echo"
        }
      })
      expect(calls).toEqual([
        {
          commandId: "plugin.echo",
          handlerRef: "wanex.plugin-action:plugin.echo/echo?version=1.0.0",
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
    const app = await createBackendApp({
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
        message: "unknown assistant command: /wat"
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

  it("projects assistant command results into safe envelopes", async () => {
    const storeDir = await createStoreDir()
    const app = await createBackendApp({
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
      expect(envelopeBackendRouteResult("routeInput", routed)).toEqual({
        ok: false,
        command: "routeInput",
        error: {
          code: "unknown_command",
          category: "validation",
          message: "unknown assistant command: /wat"
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
          message: "application backend is disposed"
        }
      })
    } finally {
      await app.dispose()
    }
  })

  it("redacts path-like raw errors in assistant safe envelopes", () => {
    expect(
      projectBackendSafeError(
        new Error("failed opening /Users/asuna/private-store/apiKey.txt")
      )
    ).toEqual({
      code: "runtime_error",
      category: "runtime",
      message: "command failed; see assistant diagnostics for details"
    })
    expect(projectBackendSafeError("boom")).toEqual({
      code: "unknown_error",
      category: "unknown",
      message: "boom"
    })
  })

  it("normalizes workflow envelopes and projects neutral provenance", async () => {
    const storeDir = await createStoreDir()
    const app = await createBackendApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      },
      modelEndpoint: testModelEndpoint("assistant.backend-workflow-envelope")
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
          sessionId: "ses_assistant_app_backend_scheduled_envelope",
          scheduleId: "schedule_assistant_app_backend_minutely",
          tickId: "tick_0001",
          nonOverlap: true
        })
      ).resolves.toMatchObject({
        kind: "scheduled",
        command: "submitScheduledTick",
        result: {
          status: "submitted",
          receipt: {
            sessionId: "ses_assistant_app_backend_scheduled_envelope",
            state: expect.stringMatching(/queued|running|succeeded/)
          }
        }
      })
      expect(app.status().disposed).toBe(false)

      const scheduledInputs = await storage.listSessionInputs({
        sessionId: "ses_assistant_app_backend_scheduled_envelope"
      })
      const scheduledReadModel =
        await app.commands.readSessionInputProvenance({
          sessionId: "ses_assistant_app_backend_scheduled_envelope"
        })
      expect(scheduledInputs).toHaveLength(1)
      expect(scheduledInputs[0]).toMatchObject({
        origin: {
          kind: "scheduler",
          sourceRef: "schedule_assistant_app_backend_minutely",
          metadata: {
            scheduleId: "schedule_assistant_app_backend_minutely",
            tickId: "tick_0001",
            nonOverlap: true
          }
        },
        intent: "normal"
      })
      expect(scheduledReadModel).toEqual({
        sessionId: "ses_assistant_app_backend_scheduled_envelope",
        hasClientField: false,
        rows: [
          expect.objectContaining({
            kind: "scheduler",
            label: "Scheduled",
            sourceRef: "schedule_assistant_app_backend_minutely",
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
          sessionId: "ses_assistant_app_backend_channel_envelope",
          connectorId: "connector.reference.assistant",
          eventId: "evt_channel_1",
          threadRef: "thread_alpha",
          classifier: {
            classifierId: "assistant-router",
            label: "normal_agent_turn",
            confidence: 0.91
          }
        })
      ).resolves.toMatchObject({
        kind: "agent",
        command: "submitConversationOperation"
      })
      const channelInputs = await storage.listSessionInputs({
        sessionId: "ses_assistant_app_backend_channel_envelope"
      })
      const channelReadModel = await app.commands.readSessionInputProvenance({
        sessionId: "ses_assistant_app_backend_channel_envelope"
      })
      expect(channelInputs[0]).toMatchObject({
        origin: {
          kind: "connector",
          sourceRef: "evt_channel_1",
          parentRef: "thread_alpha",
          metadata: {
            connectorId: "connector.reference.assistant",
            eventId: "evt_channel_1",
            classifierId: "assistant-router",
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
    const app = await createBackendApp({
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
    let app: Awaited<ReturnType<typeof createBackendApp>> | undefined

    try {
      await storage.createSession({
        id: "ses_assistant_app_backend_guided_envelope",
        title: "guided envelope",
        kind: "agent"
      })
      const submitted = await storage.submitSessionTurn({
        id: "inp_assistant_app_backend_guided_base",
        turnId: "turn_assistant_app_backend_guided_base",
        sessionId: "ses_assistant_app_backend_guided_envelope",
        jobId: "job_assistant_app_backend_guided_base",
        principalId: "principal_guided",
        idempotencyKey: "assistant.backend-guided-base-input",
        jobIdempotencyKey: "assistant.backend-guided-base-job",
        content: [
          {
            type: "text",
            id: "guided_base_text",
            text: "base work"
          }
        ],
        executionBinding: createTestTurnExecutionBinding(
          assistantTestModelEndpoint({
            endpointId: "assistant.backend-fake",
            modelId: "assistant.backend-model"
          })
        ),
        maxSteps: 1
      })
      const workerId = "worker_assistant_app_backend_guided"
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
      app = await createBackendApp({
        storage: {
          kind: "local-system-service",
          storeDir
        },
        artifacts: {
          explicitPath: serviceBin
        },
        modelEndpoint: assistantTestModelEndpoint({
          endpointId: "assistant.backend-fake",
          modelId: "assistant.backend-model"
        })
      })

      await expect(
        app.commands.routeWorkflowEnvelope({
          kind: "guided_follow_up",
          text: "after this, summarize risks",
          sessionId: "ses_assistant_app_backend_guided_envelope",
          activeTurnId: submitted.turn.id,
          sourceRef: "composer-guided"
        })
      ).resolves.toMatchObject({
        kind: "guided_follow_up",
        command: "queueGuidedFollowUp",
        result: {
          sessionId: "ses_assistant_app_backend_guided_envelope",
          activeTurnId: submitted.turn.id,
          input: {
            intent: "follow_up",
            sourceRef: "composer-guided",
            runControlPolicy: "queue_after_current"
          },
          job: {
            kind: "session.turn",
            state: "ready",
            modelEndpointId: "assistant.backend-fake"
          }
        }
      })

      const guidedInputs = await storage.listSessionInputs({
        sessionId: "ses_assistant_app_backend_guided_envelope"
      })
      const guidedReadModel = await app.commands.readSessionInputProvenance({
        sessionId: "ses_assistant_app_backend_guided_envelope"
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
          parentRef: submitted.turn.id
        },
        intent: "follow_up",
        runControlPolicy: "queue_after_current",
        expectedTurnId: submitted.turn.id
      })
      expect(followUpInput?.origin?.metadata).toBeUndefined()
      expect(followUpRow).toMatchObject({
        kind: "interactive",
        label: "Interactive",
        sourceRef: "composer-guided",
        parentRef: submitted.turn.id,
        intent: "follow_up",
        runControlPolicy: "queue_after_current",
        expectedTurnId: submitted.turn.id,
        metadataKeys: []
      })

    } finally {
      await storage.dispose()
      await app?.dispose()
    }
  })

  it("runs agent turns with a assistant-owned context profile", async () => {
    const storeDir = await createStoreDir()
    const workspaceRoot = await createStoreDir()
    const cwd = join(workspaceRoot, "apps/demo")
    await writeFileRecursive(join(workspaceRoot, "AGENTS.md"), "Use assistant profile.")
    await writeFileRecursive(
      join(workspaceRoot, ".agents/skills/write-tests/SKILL.md"),
      skillMd({
        name: "write-tests",
        description: "Write focused tests.",
        body: "FULL APP COMMAND RUNTIME SKILL BODY"
      })
    )
    const app = await createBackendApp({
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
      },
      modelEndpoint: testModelEndpoint("assistant.backend-context")
    })

    try {
      const result = await app.commands.submitConversationOperation({
        content: [{ type: "text", text: "use configured context" }],
        sessionId: "ses_assistant_app_backend_context"
      })

      expect(result).toMatchObject({
        sessionId: "ses_assistant_app_backend_context",
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

  it("hot reloads context profile config for later assistant commands", async () => {
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
    const app = await createBackendApp({
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
      },
      modelEndpoint: testModelEndpoint("assistant.backend-hot-context")
    })

    try {
      await expect(
        app.commands.submitConversationOperation({
          content: [{ type: "text", text: "first profile" }],
          sessionId: "ses_assistant_app_backend_hot_first"
        })
      ).resolves.toMatchObject({
        sessionId: "ses_assistant_app_backend_hot_first"
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
        key: BACKEND_AGENT_CONTEXT_PROFILE_KEY,
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
        sessionId: "ses_assistant_app_backend_hot_second"
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
    const app = await createBackendApp({
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
      },
      modelEndpoint: testModelEndpoint("assistant.backend-invalid-context")
    })
    const storage = createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin
    })

    try {
      await storage.putConfig(BACKEND_AGENT_CONTEXT_PROFILE_KEY, {
        skills: {
          cwd: "",
          registerActivationTool: true
        }
      })
      const reload = await app.commands.refreshAgentContextProfile()

      expect(reload).toMatchObject({
        key: BACKEND_AGENT_CONTEXT_PROFILE_KEY,
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
          sessionId: "ses_assistant_app_backend_bad_profile"
        })
      ).resolves.toMatchObject({
        sessionId: "ses_assistant_app_backend_bad_profile"
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
    const app = await createBackendApp({
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
        key: BACKEND_AGENT_CONTEXT_PROFILE_KEY,
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
        key: BACKEND_AGENT_CONTEXT_PROFILE_KEY,
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

  it("runs an optional assistant-owned context refresh monitor", async () => {
    const storeDir = await createStoreDir()
    const workspaceRoot = await createStoreDir()
    const instructionPath = join(workspaceRoot, "AGENTS.md")
    await writeFileRecursive(instructionPath, "Monitor first instruction.")
    const app = await createBackendApp({
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
            key: BACKEND_AGENT_CONTEXT_PROFILE_KEY,
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
    const app = await createBackendApp({
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
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-assistant.backend-"))
  tempDirs.push(storeDir)
  return storeDir
}

function assistantCommandGeneration(revision: string, version: string) {
  return {
    revision,
    snapshot: resolveAppExtensionContributions([
      {
        id: "plugin.dynamic",
        domain: "command",
        value: {
          name: "plugin.dynamic",
          title: "Dynamic Plugin Command",
          paletteVisibility: "visible",
          handlerRef:
            `wanex.plugin-action:plugin.dynamic/run?version=${version}`
        },
        provenance: {
          source: {
            kind: "plugin",
            scope: "user",
            id: "plugin.dynamic",
            version
          },
          trust: "user_enabled"
        },
        privileged: true
      } satisfies AppCommandContribution
    ])
  }
}

function testModelEndpoint(id: string) {
  return assistantTestModelEndpoint({
    endpointId: id,
    modelId: `${id}-model`
  })
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
