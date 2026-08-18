import { createServer, type Server } from "node:http"
import { describe, expect, it } from "vitest"
import { SecretResolver, StaticSecretProvider } from "@wanex/runtime/secrets"
import { createStorageTestStore } from "@wanex/storage/testing"
import { createWanexApp } from "../src/internal-index.js"
import { startTestTurn, submitTestTurn } from "./durable-turn-test-fixture.js"
import { createStoreDir, serviceBin } from "./helpers.js"
import { appTestModelEndpoint } from "./model-endpoint-fixture.js"

const fakeModelEndpoint = appTestModelEndpoint()

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
      },
      modelEndpoint: fakeModelEndpoint
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
        modelEndpointId: "wanex-app-fake",
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
          modelEndpointId: "wanex-app-fake"
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
            metadataKeys: []
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
      },
      modelEndpoint: fakeModelEndpoint
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
        modelEndpointId: "wanex-app-fake",
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

  it("aborts side queries without creating durable execution or context records", async () => {
    const storeDir = await createStoreDir()
    const provider = await createBlockingOpenAIProvider()
    const secretRef = "static://wanex-app-side-query"
    const app = await createWanexApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      },
      modelEndpoint: fakeModelEndpoint,
      secretResolver: new SecretResolver([
        new StaticSecretProvider({
          values: { [secretRef]: "side-query-test-key" }
        })
      ])
    })
    const storage = createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin
    })

    try {
      const sessionId = "ses_wanex_app_cancelled_side_query"
      await app.commands.runAgentTurn({
        content: [{ type: "text", text: "durable context before side query" }],
        sessionId
      })
      await app.commands.upsertModelEndpoint({
        modelEndpoint: appTestModelEndpoint({
          endpointId: "blocking-side-query-provider",
          protocolId: "openai-chat-completions",
          providerId: "openai-compatible",
          modelId: "blocking-side-query-model",
          baseUrl: provider.baseUrl,
          secretRef
        }),
        makeActive: true
      })
      const before = await readDurableSessionSnapshot(storage, sessionId)
      const controller = new AbortController()
      const query = app.commands.askSideQuery({
        sessionId,
        question: "answer without persisting this side query",
        signal: controller.signal
      })

      await provider.requestStarted
      controller.abort()

      await expect(query).rejects.toMatchObject({
        name: "WanexAbortError",
        message: "ephemeral query provider completion aborted"
      })
      await provider.responseClosed
      await expect(
        readDurableSessionSnapshot(storage, sessionId)
      ).resolves.toEqual(before)
    } finally {
      await storage.dispose()
      await app.dispose()
      await closeServer(provider.server)
    }
  })

  it("uses the active model endpoint for side queries without restart", async () => {
    const storeDir = await createStoreDir()
    const app = await createWanexApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      },
      modelEndpoint: fakeModelEndpoint
    })
    await app.stop()

    try {
      await app.commands.upsertModelEndpoint({
        modelEndpoint: appTestModelEndpoint({
          endpointId: "side-query-fake",
          modelId: "side-query-model"
        }),
        makeActive: true
      })

      await expect(
        app.commands.askSideQuery({
          question: "which provider is active?",
          expectedModelEndpointId: "side-query-fake"
        })
      ).resolves.toMatchObject({
        answerText: "Fake response from side-query-model",
        persisted: false,
        modelEndpointId: "side-query-fake",
        telemetry: {
          providerId: "fake",
          modelId: "side-query-model"
        }
      })
      await expect(
        app.commands.askSideQuery({
          question: "do not run with a changed provider",
          expectedModelEndpointId: fakeModelEndpoint.id
        })
      ).rejects.toThrow(
        "active model endpoint changed: expected wanex-app-fake, found side-query-fake"
      )
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
      },
      modelEndpoint: fakeModelEndpoint
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
      },
      modelEndpoint: fakeModelEndpoint
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
        kind: "scheduled",
        command: "submitScheduledTick",
        result: {
          status: "submitted",
          modelEndpointId: "wanex-app-fake",
          receipt: {
            sessionId: "ses_wanex_app_envelope_scheduled",
            state: "queued"
          }
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
        command: "submitConversationOperation",
        result: {
          sessionId: "ses_wanex_app_envelope_channel",
          state: "queued"
        }
      })
      await expect(
        app.commands.routeWorkflowEnvelope({
          kind: "interactive",
          text: "interactive from envelope",
          sessionId: "ses_wanex_app_envelope_interactive",
          sourceRef: "composer",
          gesture: "submit"
        })
      ).resolves.toMatchObject({
        kind: "agent",
        command: "submitConversationOperation",
        result: {
          sessionId: "ses_wanex_app_envelope_interactive",
          state: "queued"
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
          sessionId: "ses_wanex_app_envelope_interactive"
        })
      ).resolves.toEqual({
        sessionId: "ses_wanex_app_envelope_interactive",
        hasProductClientField: false,
        rows: [
          expect.objectContaining({
            kind: "interactive",
            sourceRef: "composer",
            intent: "normal",
            metadataKeys: ["gesture"]
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
      },
      modelEndpoint: fakeModelEndpoint
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
        content: [
          { type: "text", text: "durable side query envelope context" }
        ],
        sessionId: "ses_wanex_app_envelope_side"
      })
      const [inputsBefore, messagesBefore, jobsBefore] = await Promise.all([
        storage.listSessionInputs({ sessionId: "ses_wanex_app_envelope_side" }),
        storage.listSessionMessages({
          sessionId: "ses_wanex_app_envelope_side"
        }),
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
        storage.listSessionMessages({
          sessionId: "ses_wanex_app_envelope_side"
        }),
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
      },
      modelEndpoint: fakeModelEndpoint
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

async function readDurableSessionSnapshot(
  storage: ReturnType<typeof createStorageTestStore>,
  sessionId: string
) {
  const [inputs, messages, turns, jobs, events, epochs] =
    await Promise.all([
      storage.listSessionInputs({ sessionId }),
      storage.listSessionMessages({ sessionId }),
      storage.listSessionTurns({ sessionId }),
      storage.listJobs({ limit: 100 }),
      storage.queryEvents({ scope: { sessionId }, limit: 1_000 }),
      storage.listContextEpochs({ sessionId })
    ])
  const [attempts, providerInvocations] = await Promise.all([
    Promise.all(
      turns.map((turn) => storage.listSessionAttempts({ turnId: turn.id }))
    ),
    Promise.all(
      turns.map((turn) => storage.listProviderInvocations({ turnId: turn.id }))
    )
  ])
  return {
    inputs,
    messages,
    turns,
    attempts: attempts.flat(),
    providerInvocations: providerInvocations.flat(),
    jobs,
    events,
    epochs
  }
}

async function createBlockingOpenAIProvider(): Promise<{
  readonly server: Server
  readonly baseUrl: string
  readonly requestStarted: Promise<void>
  readonly responseClosed: Promise<void>
}> {
  const requestStarted = deferred<void>()
  const responseClosed = deferred<void>()
  const server = createServer(async (request, response) => {
    for await (const _chunk of request) {
      // Consume the request before exposing the active Provider call.
    }
    response.once("close", () => responseClosed.resolve())
    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache"
    })
    response.flushHeaders()
    requestStarted.resolve()
  })
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  if (address === null || typeof address === "string") {
    throw new Error("blocking Provider fixture did not expose a TCP address")
  }
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    requestStarted: requestStarted.promise,
    responseClosed: responseClosed.promise
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

function deferred<T>(): {
  readonly promise: Promise<T>
  readonly resolve: (value: T | PromiseLike<T>) => void
} {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}
