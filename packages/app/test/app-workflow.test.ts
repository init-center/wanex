import { describe, expect, it } from "vitest"
import { createStorageTestStore } from "@wanex/storage/testing"
import { createWanexApp } from "../src/internal-index.js"
import { startTestTurn, submitTestTurn } from "./durable-turn-test-fixture.js"
import { createStoreDir, serviceBin } from "./helpers.js"

describe("@wanex/app workflow commands", () => {
  it("queues guided follow-ups through neutral turn-control provenance", async () => {
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
        id: "ses_wanex_app_guided",
        title: "guided",
        kind: "agent"
      })
      const submitted = await submitTestTurn(storage, {
        id: "inp_wanex_app_guided_base",
        turnId: "turn_wanex_app_guided_base",
        sessionId: "ses_wanex_app_guided",
        jobId: "job_wanex_app_guided_base",
        principalId: "principal_guided",
        idempotencyKey: "wanex-app-guided-base-input",
        jobIdempotencyKey: "wanex-app-guided-base-job",
        content: [
          {
            type: "text",
            id: "guided_base_text",
            text: "base work"
          }
        ],
        maxSteps: 1
      })
      const active = await startTestTurn(
        storage,
        submitted,
        "worker_wanex_app_guided"
      )

      const result = await app.commands.queueGuidedFollowUp({
        sessionId: "ses_wanex_app_guided",
        activeTurnId: active.submitted.turn.id,
        text: "after the current work, summarize risks",
        inputId: "inp_wanex_app_guided_follow_up",
        jobId: "job_wanex_app_guided_follow_up",
        sourceRef: "guided-overlay"
      })

      expect(result).toMatchObject({
        sessionId: "ses_wanex_app_guided",
        activeTurnId: active.submitted.turn.id,
        providerProfileId: "wanex-app-fake",
        input: {
          inputId: "inp_wanex_app_guided_follow_up",
          status: "admitted",
          intent: "follow_up",
          originKind: "interactive",
          sourceRef: "guided-overlay",
          parentRef: active.submitted.turn.id,
          runControlPolicy: "queue_after_current",
          expectedTurnId: active.submitted.turn.id
        },
        job: {
          jobId: "job_wanex_app_guided_follow_up",
          kind: "session.turn",
          state: "ready",
          providerProfileId: "wanex-app-fake"
        }
      })
      await expect(
        app.commands.readSessionInputProvenance({
          sessionId: "ses_wanex_app_guided"
        })
      ).resolves.toEqual({
        sessionId: "ses_wanex_app_guided",
        hasProductClientField: false,
        rows: expect.arrayContaining([
          expect.objectContaining({
            inputId: "inp_wanex_app_guided_follow_up",
            kind: "interactive",
            sourceRef: "guided-overlay",
            parentRef: active.submitted.turn.id,
            intent: "follow_up",
            runControlPolicy: "queue_after_current",
            expectedTurnId: active.submitted.turn.id,
            metadataKeys: ["productPolicy"]
          })
        ])
      })

    } finally {
      await storage.dispose()
      await app.dispose()
    }
  })


  it("answers side queries without mutating durable session state", async () => {
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
      await app.commands.runAgentTurn({
        content: [{ type: "text", text: "durable wanex-app context" }],
        sessionId: "ses_wanex_app_side_query"
      })
      const [inputsBefore, messagesBefore, jobsBefore] = await Promise.all([
        storage.listSessionInputs({ sessionId: "ses_wanex_app_side_query" }),
        storage.listSessionMessages({ sessionId: "ses_wanex_app_side_query" }),
        storage.listJobs({ kind: "session.turn", limit: 20 })
      ])

      const result = await app.commands.askSideQuery({
        sessionId: "ses_wanex_app_side_query",
        question: "answer this without changing the conversation",
        maxOutputTokens: 64
      })

      const [inputsAfter, messagesAfter, jobsAfter] = await Promise.all([
        storage.listSessionInputs({ sessionId: "ses_wanex_app_side_query" }),
        storage.listSessionMessages({ sessionId: "ses_wanex_app_side_query" }),
        storage.listJobs({ kind: "session.turn", limit: 20 })
      ])
      expect(result).toMatchObject({
        sessionId: "ses_wanex_app_side_query",
        answerText: "Fake response from wanex-app-model",
        persisted: false,
        providerProfileId: "wanex-app-fake",
        telemetry: {
          providerId: "fake",
          modelId: "wanex-app-model"
        }
      })
      expect(inputsAfter).toEqual(inputsBefore)
      expect(messagesAfter).toEqual(messagesBefore)
      expect(jobsAfter).toEqual(jobsBefore)
    } finally {
      await storage.dispose()
      await app.dispose()
    }
  })


  it("uses the active provider profile for side queries without restart", async () => {
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
      await app.commands.upsertProviderProfile({
        profile: {
          id: "side-query-fake",
          kind: "fake",
          capabilities: { input: ["text"], output: ["text"] },
          providerId: "fake",
          modelId: "side-query-model"
        },
        makeActive: true
      })

      await expect(
        app.commands.askSideQuery({
          question: "which provider is active?"
        })
      ).resolves.toMatchObject({
        answerText: "Fake response from side-query-model",
        persisted: false,
        providerProfileId: "side-query-fake",
        telemetry: {
          providerId: "fake",
          modelId: "side-query-model"
        }
      })
    } finally {
      await app.dispose()
    }
  })


  it("validates workflow command inputs through safe envelopes", async () => {
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
          command: "askSideQuery",
          run: () => app.commands.askSideQuery({ question: "   " })
        })
      ).resolves.toEqual({
        ok: false,
        command: "askSideQuery",
        error: {
          code: "validation_error",
          category: "validation",
          message: "side query question must not be empty"
        }
      })
      await expect(
        app.commands.safeCommand({
          command: "queueGuidedFollowUp",
          run: () =>
            app.commands.queueGuidedFollowUp({
              sessionId: "missing-session",
              activeTurnId: "turn_1",
              text: "follow"
            })
        })
      ).resolves.toEqual({
        ok: false,
        command: "queueGuidedFollowUp",
        error: {
          code: "validation_error",
          category: "validation",
          message: "guided follow-up session not found: missing-session"
        }
      })
    } finally {
      await app.dispose()
    }
  })


  it("routes workflow envelopes into neutral provenance records", async () => {
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
        app.commands.routeWorkflowEnvelope({
          kind: "scheduled",
          text: "scheduled from envelope",
          sessionId: "ses_wanex_app_envelope_scheduled",
          scheduleId: "schedule_wanex_app_envelope",
          tickId: "tick_0001",
          nonOverlap: true,
          classifier: {
            classifierId: "intent-v1",
            label: "maintenance",
            confidence: 0.75
          }
        })
      ).resolves.toMatchObject({
        kind: "agent",
        command: "runAgentTurn",
        result: {
          sessionId: "ses_wanex_app_envelope_scheduled",
          assistantText: "Fake response from wanex-app-model"
        }
      })
      await expect(
        app.commands.routeWorkflowEnvelope({
          kind: "channel",
          text: "channel from envelope",
          sessionId: "ses_wanex_app_envelope_channel",
          connectorId: "connector.telegram",
          eventId: "event_001",
          threadRef: "thread_001"
        })
      ).resolves.toMatchObject({
        kind: "agent",
        command: "runAgentTurn",
        result: {
          sessionId: "ses_wanex_app_envelope_channel"
        }
      })

      await expect(
        app.commands.readSessionInputProvenance({
          sessionId: "ses_wanex_app_envelope_scheduled"
        })
      ).resolves.toEqual({
        sessionId: "ses_wanex_app_envelope_scheduled",
        hasProductClientField: false,
        rows: [
          expect.objectContaining({
            kind: "scheduler",
            sourceRef: "schedule_wanex_app_envelope",
            intent: "normal",
            metadataKeys: [
              "classifierConfidence",
              "classifierId",
              "classifierLabel",
              "nonOverlap",
              "scheduleId",
              "tickId"
            ]
          })
        ]
      })
      await expect(
        app.commands.readSessionInputProvenance({
          sessionId: "ses_wanex_app_envelope_channel"
        })
      ).resolves.toEqual({
        sessionId: "ses_wanex_app_envelope_channel",
        hasProductClientField: false,
        rows: [
          expect.objectContaining({
            kind: "connector",
            sourceRef: "event_001",
            parentRef: "thread_001",
            intent: "normal",
            metadataKeys: ["connectorId", "eventId"]
          })
        ]
      })
    } finally {
      await app.dispose()
    }
  })


  it("routes guided and side-query envelopes through product workflow commands", async () => {
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
        id: "ses_wanex_app_envelope_guided",
        title: "envelope guided",
        kind: "agent"
      })
      const submitted = await submitTestTurn(storage, {
        id: "inp_wanex_app_envelope_guided_base",
        turnId: "turn_wanex_app_envelope_guided_base",
        sessionId: "ses_wanex_app_envelope_guided",
        jobId: "job_wanex_app_envelope_guided_base",
        principalId: "principal_guided_envelope",
        idempotencyKey: "wanex-app-envelope-guided-base-input",
        jobIdempotencyKey: "wanex-app-envelope-guided-base-job",
        content: [
          {
            type: "text",
            id: "guided_base_text",
            text: "base guided envelope work"
          }
        ],
        maxSteps: 1
      })
      const active = await startTestTurn(
        storage,
        submitted,
        "worker_wanex_app_envelope_guided"
      )

      await expect(
        app.commands.routeWorkflowEnvelope({
          kind: "guided_follow_up",
          text: "follow from envelope",
          sessionId: "ses_wanex_app_envelope_guided",
          activeTurnId: active.submitted.turn.id,
          sourceRef: "guided-envelope"
        })
      ).resolves.toMatchObject({
        kind: "guided_follow_up",
        command: "queueGuidedFollowUp",
        result: {
          sessionId: "ses_wanex_app_envelope_guided",
          activeTurnId: active.submitted.turn.id,
          input: {
            intent: "follow_up",
            runControlPolicy: "queue_after_current",
            sourceRef: "guided-envelope"
          }
        }
      })

      app.start()
      await app.commands.runAgentTurn({
        content: [{ type: "text", text: "durable side query envelope context" }],
        sessionId: "ses_wanex_app_envelope_side"
      })
      const [inputsBefore, messagesBefore, jobsBefore] = await Promise.all([
        storage.listSessionInputs({ sessionId: "ses_wanex_app_envelope_side" }),
        storage.listSessionMessages({ sessionId: "ses_wanex_app_envelope_side" }),
        storage.listJobs({ kind: "session.turn", limit: 20 })
      ])
      await expect(
        app.commands.routeWorkflowEnvelope({
          kind: "side_query",
          text: "temporary aside from envelope",
          sessionId: "ses_wanex_app_envelope_side",
          sourceRef: "btw-overlay"
        })
      ).resolves.toMatchObject({
        kind: "side_query",
        command: "askSideQuery",
        result: {
          sessionId: "ses_wanex_app_envelope_side",
          answerText: "Fake response from wanex-app-model",
          persisted: false
        }
      })
      const [inputsAfter, messagesAfter, jobsAfter] = await Promise.all([
        storage.listSessionInputs({ sessionId: "ses_wanex_app_envelope_side" }),
        storage.listSessionMessages({ sessionId: "ses_wanex_app_envelope_side" }),
        storage.listJobs({ kind: "session.turn", limit: 20 })
      ])
      expect(inputsAfter).toEqual(inputsBefore)
      expect(messagesAfter).toEqual(messagesBefore)
      expect(jobsAfter).toEqual(jobsBefore)

    } finally {
      await storage.dispose()
      await app.dispose()
    }
  })


  it("returns tagged workflow envelope validation errors", async () => {
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
        app.commands.routeWorkflowEnvelope({
          kind: "scheduled",
          text: "   ",
          scheduleId: "schedule_empty",
          tickId: "tick_empty"
        })
      ).resolves.toEqual({
        kind: "error",
        command: "routeWorkflowEnvelope",
        code: "empty_input",
        message: "workflow envelope text must not be empty"
      })
      await expect(
        app.commands.routeWorkflowEnvelope({
          kind: "channel",
          text: "bad classifier",
          connectorId: "connector",
          eventId: "event",
          classifier: {
            classifierId: "",
            label: "bad",
            confidence: 1.1
          }
        })
      ).resolves.toEqual({
        kind: "error",
        command: "routeWorkflowEnvelope",
        code: "invalid_arguments",
        message:
          "classifier hint requires classifierId, label, and confidence between 0 and 1"
      })
      await expect(
        app.commands.routeWorkflowEnvelope({
          kind: "guided_follow_up",
          text: "missing session",
          activeTurnId: "turn_1"
        })
      ).resolves.toEqual({
        kind: "error",
        command: "routeWorkflowEnvelope",
        code: "invalid_arguments",
        message: "guided follow-up envelope requires sessionId"
      })
    } finally {
      await app.dispose()
    }
  })

})
