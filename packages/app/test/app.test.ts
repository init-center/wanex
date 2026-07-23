import { describe, expect, it } from "vitest"
import { WanexRuntimeHost } from "@wanex/runtime/host"
import { createStorageTestStore } from "@wanex/storage/testing"
import {
  createWanexApp,
  projectWanexAppSafeError,
  runWanexAppSmoke
} from "../src/internal-index.js"
import { startTestTurn, submitTestTurn } from "./durable-turn-test-fixture.js"
import { createStoreDir, serviceBin } from "./helpers.js"

describe("@wanex/app", () => {
  it("runs the reusable App Host smoke path end to end", async () => {
    const storeDir = await createStoreDir()

    const result = await runWanexAppSmoke({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      },
      providerProfile: {
        id: "wanex-app-test-profile",
        modelId: "wanex-app-test-model"
      },
      text: "shell smoke"
    })

    expect(result.run).toMatchObject({
      sessionId: "ses_wanex_app_smoke",
      assistantText: "Fake response from wanex-app-test-model",
      messageCount: 2,
      jobStatuses: ["succeeded"]
    })
    expect(result.diagnostics.generatedAt).toBe(3_456)
    expect(result.provider).toEqual({
      id: "wanex-app-test-profile",
      kind: "fake",
      capabilities: { input: ["text"], output: ["text"] },
      providerId: "fake",
      modelId: "wanex-app-test-model",
      credentialConfigured: false,
      active: true
    })
    expect(result.provenance).toEqual({
      sessionId: "ses_wanex_app_smoke",
      hasProductClientField: false,
      rows: [
        expect.objectContaining({
          sessionId: "ses_wanex_app_smoke",
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


  it("projects supplied runtime-host health through App diagnostics", async () => {
    const storeDir = await createStoreDir()
    const app = await createWanexApp({
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
      fakeResponseText: "wanex-app diagnostics host"
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
    const app = await createWanexApp({
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
      fakeResponseText: "wanex-app support host"
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
    const app = await createWanexApp({
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
        started: true,
        workerCount: 1,
        providerProfileId: "wanex-app-fake",
        activeProviderProfileId: "wanex-app-fake",
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
          content: [{ type: "text", text: "through shell" }],
          sessionId: "ses_wanex_app_commands"
        })
      ).resolves.toMatchObject({
        sessionId: "ses_wanex_app_commands",
        assistantText: "Fake response from wanex-app-model"
      })
      await expect(
        storage.listSessionInputs({
          sessionId: "ses_wanex_app_commands"
        })
      ).resolves.toEqual([
        expect.objectContaining({
          sessionId: "ses_wanex_app_commands",
          principalId: "wanex-app-user"
        })
      ])
      await expect(
        app.commands.readRecentSessions({ limit: 5 })
      ).resolves.toMatchObject({
        kind: "wanex-app.recent_sessions",
        limit: 5,
        rows: [
          expect.objectContaining({
            sessionId: "ses_wanex_app_commands",
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
      ).rejects.toThrow("app is disposed")
      await expect(
        app.commands.readActiveProviderProfile()
      ).rejects.toThrow("app is disposed")
    } finally {
      await storage.dispose()
      await app.dispose()
    }
  })


  it("projects scheduler provenance without product client fields", async () => {
    const storeDir = await createStoreDir()
    const app = await createWanexApp({
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
        content: [{ type: "text", text: "scheduled shell input" }],
        sessionId: "ses_wanex_app_scheduler",
        origin: {
          kind: "scheduler",
          sourceRef: "schedule_wanex_app_minutely",
          metadata: {
            scheduleId: "schedule_wanex_app_minutely",
            tickId: "tick_0001",
            nonOverlap: true
          }
        },
        intent: "normal"
      })

      await expect(
        app.commands.readSessionInputProvenance({
          sessionId: "ses_wanex_app_scheduler"
        })
      ).resolves.toEqual({
        sessionId: "ses_wanex_app_scheduler",
        hasProductClientField: false,
        rows: [
          expect.objectContaining({
            sessionId: "ses_wanex_app_scheduler",
            kind: "scheduler",
            label: "Scheduled",
            sourceRef: "schedule_wanex_app_minutely",
            intent: "normal",
            metadataKeys: ["nonOverlap", "scheduleId", "tickId"]
          })
        ]
      })
    } finally {
      await app.dispose()
    }
  })


  it("projects a durable session transcript through an App read model", async () => {
    const storeDir = await createStoreDir()
    const app = await createWanexApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      },
      providerProfile: {
        id: "wanex-app-transcript-profile",
        modelId: "wanex-app-transcript-model"
      }
    })

    try {
      const run = await app.commands.runAgentTurn({
        content: [{ type: "text", text: "show transcript please" }],
        sessionId: "ses_wanex_app_transcript"
      })
      const transcript = await app.commands.readSessionTranscript({
        sessionId: run.sessionId
      })

      expect(transcript.sessionId).toBe("ses_wanex_app_transcript")
      expect(transcript.rows).toHaveLength(2)
      expect(transcript.rows[0]).toMatchObject({
        kind: "message",
        role: "user",
        status: "completed",
        text: "show transcript please",
        inputId: expect.stringMatching(/^inp_/),
        turnId: expect.stringMatching(/^turn_/),
        attemptId: expect.stringMatching(/^attempt_/),
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
        text: "Fake response from wanex-app-transcript-model",
        inputId: transcript.rows[0]?.inputId,
        turnId: transcript.rows[0]?.turnId,
        attemptId: transcript.rows[0]?.attemptId,
        parts: [
          {
            type: "text",
            visibility: "default",
            text: "Fake response from wanex-app-transcript-model"
          }
        ]
      })
    } finally {
      await app.dispose()
    }
  })


  it("summarizes rich transcript parts without exposing provider replay content", async () => {
    const storeDir = await createStoreDir()
    const app = await createWanexApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      }
    })
    await app.stop()
    const storage = createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin
    })

    try {
      await storage.createSession({
        id: "ses_wanex_app_rich_transcript",
        kind: "agent"
      })
      const submitted = await submitTestTurn(storage, {
        id: "inp_wanex_app_rich_transcript",
        turnId: "turn_wanex_app_rich_transcript",
        jobId: "job_wanex_app_rich_transcript",
        sessionId: "ses_wanex_app_rich_transcript",
        principalId: "wanex-app-user",
        idempotencyKey: "wanex-app-rich-transcript",
        content: [
          {
            id: "user_text",
            type: "text",
            text: "inspect rich parts"
          }
        ],
        maxSteps: 1
      })
      const active = await startTestTurn(
        storage,
        submitted,
        "worker_wanex_app_rich_transcript"
      )
      const checkpointInvocation = await storage.beginProviderInvocation({
        sessionId: active.submitted.turn.sessionId,
        turnId: active.submitted.turn.id,
        attemptId: active.started.attempt.id,
        inputId: active.submitted.admission.inputId,
        jobId: active.submitted.job.id,
        workerId: active.workerId,
        leaseToken: active.leaseToken,
        step: 1,
        invocationNumber: 1,
        requestDigest: "wanex-app-rich-checkpoint"
      })
      await storage.finishProviderInvocation({
        sessionId: active.submitted.turn.sessionId,
        turnId: active.submitted.turn.id,
        attemptId: active.started.attempt.id,
        inputId: active.submitted.admission.inputId,
        jobId: active.submitted.job.id,
        workerId: active.workerId,
        leaseToken: active.leaseToken,
        invocationId: checkpointInvocation.id,
        outcome: "succeeded",
        assistantMessage: [
          {
            id: "tool_call",
            type: "tool_call",
            toolCallId: "tool_1",
            toolName: "read_file",
            input: {
              path: "/private/file"
            }
          }
        ]
      })
      await storage.appendSessionMessage({
        sessionId: active.submitted.turn.sessionId,
        turnId: active.submitted.turn.id,
        attemptId: active.started.attempt.id,
        inputId: active.submitted.admission.inputId,
        jobId: active.submitted.job.id,
        workerId: active.workerId,
        leaseToken: active.leaseToken,
        idempotencyKey: "wanex-app-rich-tool-result",
        role: "tool",
        content: [
          {
            id: "tool_result",
            type: "tool_result",
            toolCallId: "tool_1",
            result: {
              secret: "not projected"
            },
            isError: false
          }
        ]
      })
      const finalInvocation = await storage.beginProviderInvocation({
        sessionId: active.submitted.turn.sessionId,
        turnId: active.submitted.turn.id,
        attemptId: active.started.attempt.id,
        inputId: active.submitted.admission.inputId,
        jobId: active.submitted.job.id,
        workerId: active.workerId,
        leaseToken: active.leaseToken,
        step: 2,
        invocationNumber: 1,
        requestDigest: "wanex-app-rich-final"
      })
      await storage.settleSessionTurn({
        sessionId: active.submitted.turn.sessionId,
        turnId: active.submitted.turn.id,
        attemptId: active.started.attempt.id,
        inputId: active.submitted.admission.inputId,
        jobId: active.submitted.job.id,
        workerId: active.workerId,
        leaseToken: active.leaseToken,
        outcome: "succeeded",
        providerInvocationId: finalInvocation.id,
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
            resourceId: "res_wanex_app_preview",
            sha256: "a".repeat(64),
            sizeBytes: 128,
            kind: "image",
            mediaType: "image/png"
          },
          {
            id: "a2ui_resource",
            type: "resource",
            resourceId: "res_wanex_app_a2ui",
            sha256: "b".repeat(64),
            sizeBytes: 256,
            kind: "artifact",
            mediaType: "application/vnd.a2ui+json"
          }
        ]
      })

      const transcript = await app.commands.readSessionTranscript({
        sessionId: "ses_wanex_app_rich_transcript"
      })
      const assistantRows = transcript.rows.filter(
        (row) => row.kind === "message" && row.role === "assistant"
      )
      const checkpoint = assistantRows.find((row) =>
        row.parts.some((part) => part.type === "tool_call")
      )
      const assistant = assistantRows.find((row) =>
        row.parts.some(
          (part) => part.type === "text" && part.text === "visible assistant text"
        )
      )
      const tool = transcript.rows.find(
        (row) => row.kind === "message" && row.role === "tool"
      )

      expect(assistantRows).toHaveLength(2)
      expect(checkpoint).toMatchObject({
        text: "[tool_call:read_file]",
        parts: [{
          type: "tool_call",
          toolCallId: "tool_1",
          toolName: "read_file"
        }]
      })
      expect(tool).toMatchObject({
        text: "[tool_result]",
        parts: [{
          type: "tool_result",
          toolCallId: "tool_1",
          isError: false
        }]
      })

      expect(assistant).toMatchObject({
        text: [
          "visible assistant text",
          "[resource:res_wanex_app_preview]",
          "[resource:res_wanex_app_a2ui]"
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
            resourceId: "res_wanex_app_preview",
            mediaType: "image/png"
          },
          {
            type: "resource",
            resourceId: "res_wanex_app_a2ui",
            mediaType: "application/vnd.a2ui+json"
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
    const app = await createWanexApp({
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
          run: () => app.commands.runAgentTurn({ content: [{ type: "text", text: "   " }] })
        })
      ).resolves.toEqual({
        ok: false,
        command: "runAgentTurn",
        error: {
          code: "validation_error",
          category: "validation",
          message: "conversation operation text part 0 must not be empty"
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
          message: "app is disposed"
        }
      })
    } finally {
      await app.dispose()
    }
  })

  it("ingests and reads immutable resources through the trusted App command boundary", async () => {
    const storeDir = await createStoreDir()
    const app = await createWanexApp({
      storage: { kind: "local-system-service", storeDir },
      artifacts: { explicitPath: serviceBin }
    })
    try {
      const content = new Uint8Array([1, 2, 3, 4])
      const resource = await app.commands.ingestResource({
        content,
        kind: "image",
        mediaType: "image/png",
        origin: "user_upload",
        label: "app-resource.png"
      })
      const read = await app.commands.readResource({ resourceId: resource.id })

      expect(read).toMatchObject({
        id: resource.id,
        kind: "image",
        mediaType: "image/png",
        origin: "user_upload",
        state: "available",
        label: "app-resource.png",
        sizeBytes: content.byteLength,
        sha256: resource.sha256
      })
      expect(read).not.toHaveProperty("content")
      await expect(
        app.commands.readResource({ resourceId: "res_missing_app_resource" })
      ).resolves.toBeNull()
    } finally {
      await app.dispose()
    }
  })


  it("redacts path-like raw errors in safe envelopes", () => {
    expect(
      projectWanexAppSafeError(
        new Error("failed opening C:\\Users\\asuna\\storeDir\\apiKey.txt")
      )
    ).toEqual({
      code: "runtime_error",
      category: "runtime",
      message: "command failed; see app diagnostics for details"
    })
    expect(projectWanexAppSafeError("boom")).toEqual({
      code: "unknown_error",
      category: "unknown",
      message: "boom"
    })
  })
})
