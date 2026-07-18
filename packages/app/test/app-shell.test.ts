import { describe, expect, it } from "vitest"
import { WanexRuntimeHost } from "@wanex/runtime/host"
import { createStorageTestStore } from "@wanex/storage/testing"
import {
  createWanexAppShell,
  projectWanexAppShellSafeError,
  runWanexAppShellSmoke
} from "../src/internal-index.js"
import { createStoreDir, serviceBin } from "./helpers.js"

describe("@wanex/app", () => {
  it("runs the reusable app-shell smoke path end to end", async () => {
    const storeDir = await createStoreDir()

    const result = await runWanexAppShellSmoke({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      },
      providerProfile: {
        id: "app-shell-test-profile",
        modelId: "app-shell-test-model"
      },
      text: "shell smoke"
    })

    expect(result.run).toMatchObject({
      sessionId: "ses_app_shell_smoke",
      assistantText: "Fake response from app-shell-test-model",
      messageCount: 1,
      jobStatuses: ["succeeded"]
    })
    expect(result.diagnostics.generatedAt).toBe(3_456)
    expect(result.provider).toEqual({
      id: "app-shell-test-profile",
      kind: "fake",
      providerId: "fake",
      modelId: "app-shell-test-model",
      hasApiKey: false,
      active: true
    })
    expect(result.provenance).toEqual({
      sessionId: "ses_app_shell_smoke",
      hasProductClientField: false,
      rows: [
        expect.objectContaining({
          sessionId: "ses_app_shell_smoke",
          kind: "interactive",
          label: "Interactive",
          metadataKeys: []
        })
      ]
    })
    expect(result.shutdown).toEqual({
      disposed: true,
      repeated: false
    })
  })


  it("projects supplied runtime-host health through app-shell diagnostics", async () => {
    const storeDir = await createStoreDir()
    const app = await createWanexAppShell({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      }
    })
    const host = new WanexRuntimeHost({
      storageConfig: {
        kind: "local-system-service",
        mode: "persistent",
        storeDir,
        serviceBin
      },
      workerCount: 1,
      fakeResponseText: "app-shell diagnostics host"
    })

    try {
      const snapshot = await app.commands.readDiagnostics({
        now: 555,
        runtimeHost: host
      })

      expect(snapshot.generatedAt).toBe(555)
      expect(snapshot.diagnostics.map((item) => item.code)).toEqual(
        expect.arrayContaining([
          "app.runtime_host.summary",
          "app.runtime_host.health"
        ])
      )
      expect(
        snapshot.activity.some(
          (item) =>
            item.source === "app" &&
            item.id === "runtime-host-activity:health"
        )
      ).toBe(true)
    } finally {
      await host.dispose()
      await app.dispose()
    }
  })


  it("projects supplied runtime-host health through support bundles", async () => {
    const storeDir = await createStoreDir()
    const app = await createWanexAppShell({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      }
    })
    const host = new WanexRuntimeHost({
      storageConfig: {
        kind: "local-system-service",
        mode: "persistent",
        storeDir,
        serviceBin
      },
      workerCount: 1,
      fakeResponseText: "app-shell support host"
    })

    try {
      const bundle = await app.commands.buildSupportBundle({
        now: 556,
        runtimeHost: host
      })

      expect(bundle.generatedAt).toBe(556)
      expect(bundle.diagnostics.diagnostics.map((item) => item.code)).toEqual(
        expect.arrayContaining([
          "app.runtime_host.summary",
          "app.runtime_host.health"
        ])
      )
      expect(
        bundle.diagnostics.activity.some(
          (item) =>
            item.source === "app" &&
            item.id === "runtime-host-activity:health"
        )
      ).toBe(true)
    } finally {
      await host.dispose()
      await app.dispose()
    }
  })


  it("keeps storage behind commands and rejects direct calls after shutdown", async () => {
    const storeDir = await createStoreDir()
    const app = await createWanexAppShell({
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
      expect(app.status()).toEqual({
        disposed: false,
        providerProfileId: "app-shell-fake",
        activeProviderProfileId: "app-shell-fake",
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
        app.commands.runAgentTurn({
          text: "through shell",
          sessionId: "ses_app_shell_commands"
        })
      ).resolves.toMatchObject({
        sessionId: "ses_app_shell_commands",
        assistantText: "Fake response from app-shell-model"
      })
      await expect(
        storage.listSessionInputs({
          sessionId: "ses_app_shell_commands"
        })
      ).resolves.toEqual([
        expect.objectContaining({
          sessionId: "ses_app_shell_commands",
          principalId: "app-shell-user"
        })
      ])
      await expect(
        app.commands.readRecentSessions({ limit: 5 })
      ).resolves.toMatchObject({
        kind: "app-shell.recent_sessions",
        limit: 5,
        rows: [
          expect.objectContaining({
            sessionId: "ses_app_shell_commands",
            kind: "agent",
            status: "active"
          })
        ]
      })
      await expect(
        app.commands.readRecentSessions({ limit: 0 })
      ).rejects.toThrow("recent session limit must be a positive integer")

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
      ).rejects.toThrow("app shell is disposed")
      await expect(
        app.commands.readActiveProviderProfile()
      ).rejects.toThrow("app shell is disposed")
    } finally {
      await storage.dispose()
      await app.dispose()
    }
  })


  it("projects scheduler provenance without product client fields", async () => {
    const storeDir = await createStoreDir()
    const app = await createWanexAppShell({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      }
    })

    try {
      await app.commands.runAgentTurn({
        text: "scheduled shell input",
        sessionId: "ses_app_shell_scheduler",
        origin: {
          kind: "scheduler",
          sourceRef: "schedule_app_shell_minutely",
          metadata: {
            scheduleId: "schedule_app_shell_minutely",
            tickId: "tick_0001",
            nonOverlap: true
          }
        },
        intent: "normal"
      })

      await expect(
        app.commands.readSessionInputProvenance({
          sessionId: "ses_app_shell_scheduler"
        })
      ).resolves.toEqual({
        sessionId: "ses_app_shell_scheduler",
        hasProductClientField: false,
        rows: [
          expect.objectContaining({
            sessionId: "ses_app_shell_scheduler",
            kind: "scheduler",
            label: "Scheduled",
            sourceRef: "schedule_app_shell_minutely",
            intent: "normal",
            metadataKeys: ["nonOverlap", "scheduleId", "tickId"]
          })
        ]
      })
    } finally {
      await app.dispose()
    }
  })


  it("projects durable session transcript through an app-shell read model", async () => {
    const storeDir = await createStoreDir()
    const app = await createWanexAppShell({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      },
      providerProfile: {
        id: "app-shell-transcript-profile",
        modelId: "app-shell-transcript-model"
      }
    })

    try {
      const run = await app.commands.runAgentTurn({
        text: "show transcript please",
        sessionId: "ses_app_shell_transcript"
      })
      const transcript = await app.commands.readSessionTranscript({
        sessionId: run.sessionId
      })

      expect(transcript.sessionId).toBe("ses_app_shell_transcript")
      expect(transcript.rows).toHaveLength(2)
      expect(transcript.rows[0]).toMatchObject({
        kind: "input",
        role: "user",
        status: "completed",
        text: "show transcript please",
        inputId: expect.stringMatching(/^inp_/),
        parts: [
          {
            type: "text",
            visibility: "default",
            text: "show transcript please"
          }
        ]
      })
      expect(transcript.rows[1]).toMatchObject({
        kind: "message",
        role: "assistant",
        status: "completed",
        text: "Fake response from app-shell-transcript-model",
        inputId: transcript.rows[0]?.inputId,
        runId: expect.stringMatching(/^run_/),
        parts: [
          {
            type: "text",
            visibility: "default",
            text: "Fake response from app-shell-transcript-model"
          }
        ]
      })
    } finally {
      await app.dispose()
    }
  })


  it("summarizes rich transcript parts without exposing provider replay content", async () => {
    const storeDir = await createStoreDir()
    const app = await createWanexAppShell({
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
      await storage.createSession({
        id: "ses_app_shell_rich_transcript",
        kind: "agent"
      })
      await storage.submitSessionRun({
        id: "inp_app_shell_rich_transcript",
        sessionId: "ses_app_shell_rich_transcript",
        principalId: "app-shell-user",
        idempotencyKey: "app-shell-rich-transcript",
        content: [
          {
            id: "user_text",
            type: "text",
            text: "inspect rich parts"
          }
        ],
        providerProfileId: "app-shell-fake",
        mode: "once",
        maxSteps: 1
      })
      const claim = await storage.claimRunner({
        sessionId: "ses_app_shell_rich_transcript",
        runnerId: "runner_app_shell_rich_transcript",
        leaseMs: 30_000
      })
      expect(claim).not.toBeNull()
      await storage.completeRun({
        sessionId: claim!.sessionId,
        runId: claim!.runId,
        inputId: claim!.inputId,
        runnerId: claim!.runnerId,
        leaseToken: claim!.leaseToken,
        assistantMessage: [
          {
            id: "assistant_text",
            type: "text",
            text: "visible assistant text"
          },
          {
            id: "private_reasoning",
            type: "reasoning",
            text: "secret chain state",
            visibility: "provider_replay_only"
          },
          {
            id: "preview_resource",
            type: "resource",
            resourceId: "res_app_shell_preview",
            mediaType: "image/png"
          },
          {
            id: "tool_call",
            type: "tool_call",
            toolCallId: "tool_1",
            toolName: "read_file",
            input: {
              path: "/private/file"
            }
          },
          {
            id: "tool_result",
            type: "tool_result",
            toolCallId: "tool_1",
            result: {
              secret: "not projected"
            },
            isError: false
          },
          {
            id: "surface",
            type: "ui_surface",
            surface: {
              protocol: "a2ui",
              version: "1",
              surfaceKind: "preview",
              payload: {
                secret: "not projected"
              },
              fallback: {
                kind: "text",
                text: "surface fallback"
              }
            }
          }
        ]
      })

      const transcript = await app.commands.readSessionTranscript({
        sessionId: "ses_app_shell_rich_transcript"
      })
      const assistant = transcript.rows.find(
        (row) => row.kind === "message" && row.role === "assistant"
      )

      expect(assistant).toMatchObject({
        text: [
          "visible assistant text",
          "[resource:res_app_shell_preview]",
          "[tool_call:read_file]",
          "[tool_result]",
          "surface fallback"
        ].join("\n"),
        parts: [
          {
            type: "text",
            text: "visible assistant text"
          },
          {
            type: "hidden",
            sourceType: "reasoning",
            visibility: "provider_replay_only",
            hidden: true
          },
          {
            type: "resource",
            resourceId: "res_app_shell_preview",
            mediaType: "image/png"
          },
          {
            type: "tool_call",
            toolCallId: "tool_1",
            toolName: "read_file"
          },
          {
            type: "tool_result",
            toolCallId: "tool_1",
            isError: false
          },
          {
            type: "ui_surface",
            protocol: "a2ui",
            surfaceKind: "preview",
            fallbackText: "surface fallback"
          }
        ]
      })
      expect(JSON.stringify(transcript)).not.toContain("secret chain state")
      expect(JSON.stringify(transcript)).not.toContain("/private/file")
      expect(JSON.stringify(transcript)).not.toContain("not projected")
    } finally {
      await storage.dispose()
      await app.dispose()
    }
  })


  it("wraps command failures in safe envelopes without leaking local paths", async () => {
    const storeDir = await createStoreDir()
    const app = await createWanexAppShell({
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
          command: "readDiagnostics",
          run: () => app.commands.readDiagnostics({ now: 9_999 })
        })
      ).resolves.toMatchObject({
        ok: true,
        command: "readDiagnostics",
        value: {
          generatedAt: 9_999
        }
      })

      await expect(
        app.commands.safeCommand({
          command: "runAgentTurn",
          run: () => app.commands.runAgentTurn({ text: "   " })
        })
      ).resolves.toEqual({
        ok: false,
        command: "runAgentTurn",
        error: {
          code: "validation_error",
          category: "validation",
          message: "app shell agent text must not be empty"
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
          message: "app shell is disposed"
        }
      })
    } finally {
      await app.dispose()
    }
  })


  it("redacts path-like raw errors in safe envelopes", () => {
    expect(
      projectWanexAppShellSafeError(
        new Error("failed opening C:\\Users\\asuna\\storeDir\\apiKey.txt")
      )
    ).toEqual({
      code: "runtime_error",
      category: "runtime",
      message: "command failed; see app diagnostics for details"
    })
    expect(projectWanexAppShellSafeError("boom")).toEqual({
      code: "unknown_error",
      category: "unknown",
      message: "boom"
    })
  })
})
