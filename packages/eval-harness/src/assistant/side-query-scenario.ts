import { rm } from "node:fs/promises"
import {
  createMemoryStateStore,
  createShell,
  createSurfaceAdapter,
  type Shell
} from "@wanex/assistant"
import {
  createMessageSurfaceClientTransport,
  createSurfaceClient,
  handleSurfaceTransportRequest,
  type SideQueryReadModel
} from "@wanex/assistant/surface"
import { EnvSecretProvider, SecretResolver } from "@wanex/runtime/secrets"
import {
  createStorageTestStore,
  type StorageTestStore
} from "@wanex/storage/testing"
import { mktemp } from "../assistant-bootstrap/helpers.js"
import { createEvalScenario } from "../runner.js"
import { assert, evalOpenAICompatibleModelEndpoint } from "../scenario-utils.js"

const SESSION_A = "ses_eval_assistant_side_query_a"
const SESSION_B = "ses_eval_assistant_side_query_b"
const PROFILE_A = "eval-side-query-provider-a"
const PROFILE_B = "eval-side-query-provider-b"
const MODEL_A = "eval-side-query-model-a"
const MODEL_B = "eval-side-query-model-b"
const CONTEXT_A = "durable selected context alpha"
const CONTEXT_B = "durable unselected context beta"
const SUCCESS_QUESTION = "compare the selected context"
const CANCEL_QUESTION = "cancel this transient question"
const DISPOSE_QUESTION = "dispose this transient question"

export const sideQueryScenario = createEvalScenario({
  id: "assistant.side-query-operational",
  title:
    "Assistant side query preserves selected context, binding, cancellation, and durable state",
  tags: [
    "assistant",
    "side-query",
    "provider-binding",
    "cancellation",
    "surface",
    "assistant-path"
  ],
  async run(context) {
    const storeDir = await mktemp("wanex-eval-assistant-side-query-")
    const provider = createProviderFixture()
    const originalFetch = globalThis.fetch
    globalThis.fetch = provider.fetch
    let app: Shell | undefined
    let surface: ReturnType<typeof createSurfaceAdapter> | undefined
    let storage: StorageTestStore | undefined

    try {
      app = await createShell({
        storage: { kind: "local-system-service", storeDir },
        artifacts: { explicitPath: context.serviceBin },
        modelEndpoint: modelEndpoint({
          id: PROFILE_A,
          modelId: MODEL_A,
          baseUrl: "https://provider-a.side-query.example.test/v1",
          secretRef: "env://WANEX_EVAL_SIDE_QUERY_A_KEY"
        }),
        secretResolver: new SecretResolver([
          new EnvSecretProvider({
            WANEX_EVAL_SIDE_QUERY_A_KEY: "eval-side-query-secret-a",
            WANEX_EVAL_SIDE_QUERY_B_KEY: "eval-side-query-secret-b"
          })
        ]),
        stateStore: createMemoryStateStore()
      })
      await app.modelEndpoints.upsertModelEndpoint({
        modelEndpoint: modelEndpoint({
          id: PROFILE_B,
          modelId: MODEL_B,
          baseUrl: "https://provider-b.side-query.example.test/v1",
          secretRef: "env://WANEX_EVAL_SIDE_QUERY_B_KEY"
        })
      })
      await submitAndWait(app, SESSION_A, CONTEXT_A)
      await submitAndWait(app, SESSION_B, CONTEXT_B)
      await app.selectSession({ sessionId: SESSION_A })

      surface = createSurfaceAdapter(app, {
        streamId: "eval-assistant-side-query-stream"
      })
      const transport = createMessageSurfaceClientTransport({
        send: async (request) =>
          await handleSurfaceTransportRequest(surface!, request),
        subscribe: (listener) => surface!.subscribeSurfaceEvents(listener)
      })
      const client = createSurfaceClient(transport)
      storage = createStorageTestStore({
        kind: "local-system-service",
        mode: "oneshot",
        storeDir,
        serviceBin: context.serviceBin
      })
      const durableBefore = await readDurableEvidence(storage)

      const started = await client.startSideQuery({
        question: SUCCESS_QUESTION,
        maxOutputTokens: 128
      })
      assert(started.ok, "Assistant side query should return a running receipt")
      assert(
        started.value.state === "running" &&
          started.value.sessionId === SESSION_A &&
          started.value.modelEndpointId === PROFILE_A,
        "start should freeze the selected Session and active Provider"
      )
      await provider.successStarted.promise
      await app.selectSession({ sessionId: SESSION_B })
      await app.modelEndpoints.setActiveModelEndpoint({
        endpointId: PROFILE_B
      })
      provider.releaseSuccess.resolve()

      const succeeded = await readTerminal(client, started.value.queryId)
      assert(
        succeeded.state === "succeeded" &&
          succeeded.sessionId === SESSION_A &&
          succeeded.modelEndpointId === PROFILE_A &&
          succeeded.answerText === "selected side answer",
        "late Assistant selection/profile changes must not rebind the running query"
      )
      const successCall = provider.callForQuestion(SUCCESS_QUESTION)
      assert(
        successCall.model === MODEL_A &&
          successCall.body.includes(CONTEXT_A) &&
          !successCall.body.includes(CONTEXT_B),
        "Provider replay should contain only the selected canonical Session context"
      )

      const staleCancel = await client.cancelSideQuery({
        queryId: `${started.value.queryId}_stale`
      })
      assert(!staleCancel.ok, "stale cancel ID should fail closed")
      const retainedSuccess = await client.readSideQuery({
        queryId: started.value.queryId
      })
      assert(
        retainedSuccess.ok &&
          retainedSuccess.value.kind === "assistant.side-query.found" &&
          retainedSuccess.value.query.state === "succeeded",
        "stale cancel must not change the retained successful query"
      )

      const cancelling = await client.startSideQuery({
        question: CANCEL_QUESTION
      })
      assert(
        cancelling.ok &&
          cancelling.value.sessionId === SESSION_B &&
          cancelling.value.modelEndpointId === PROFILE_B,
        "explicit replacement should bind the newly selected context and Provider"
      )
      await provider.cancelStarted.promise
      const staleDismiss = await client.dismissSideQuery({
        queryId: `${cancelling.value.queryId}_stale`
      })
      assert(!staleDismiss.ok, "stale dismiss ID should fail closed")
      const cancelled = await client.cancelSideQuery({
        queryId: cancelling.value.queryId
      })
      assert(
        cancelled.ok && cancelled.value.state === "cancelled",
        "exact cancel should settle the retained Assistant query"
      )
      await provider.cancelAborted.promise
      assert(
        provider.callForQuestion(CANCEL_QUESTION).model === MODEL_B,
        "cancelled query should preserve its Provider binding"
      )
      const dismissed = await client.dismissSideQuery({
        queryId: cancelling.value.queryId
      })
      assert(
        dismissed.ok && dismissed.value.queryId === cancelling.value.queryId,
        "exact terminal dismiss should remove Assistant presentation state"
      )

      const disposingQuery = await client.startSideQuery({
        question: DISPOSE_QUESTION
      })
      assert(disposingQuery.ok, "disposal query should start")
      await provider.disposeStarted.promise
      await surface.dispose()
      surface = undefined
      let disposeCompleted = false
      const disposing = app.dispose().then(() => {
        disposeCompleted = true
      })
      await provider.disposeAborted.promise
      assert(
        !disposeCompleted,
        "Assistant disposal must wait for Provider cleanup to drain"
      )
      provider.releaseDisposeCleanup.resolve()
      await disposing
      app = undefined

      const durableAfter = await readDurableEvidence(storage)
      assert(
        JSON.stringify(durableAfter) === JSON.stringify(durableBefore),
        "success, cancellation, dismiss, and disposal must leave all durable evidence unchanged"
      )
      assert(
        provider.calls.length === 5,
        "the fixture should observe two durable seed calls and three ephemeral calls"
      )

      return {
        successState: succeeded.state,
        successSessionId: succeeded.sessionId,
        successModelEndpointId: succeeded.modelEndpointId,
        cancelledState: cancelled.ok ? cancelled.value.state : "unknown",
        providerCallCount: provider.calls.length,
        durableEvidenceBytes: JSON.stringify(durableAfter).length,
        durableEvidenceUnchanged:
          JSON.stringify(durableAfter) === JSON.stringify(durableBefore)
      }
    } finally {
      await surface?.dispose()
      await app?.dispose()
      await storage?.dispose()
      globalThis.fetch = originalFetch
      await rm(storeDir, { recursive: true, force: true })
    }
  }
})

async function submitAndWait(
  app: Shell,
  sessionId: string,
  text: string
): Promise<void> {
  const submitted = await app.submitConversationOperation({ sessionId, text })
  assert(
    submitted.kind === "assistant.conversation-operation.found",
    `seed conversation should be admitted: ${sessionId}`
  )
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const operation = await app.readTrackedConversationOperation({ sessionId })
    if (
      operation.kind === "assistant.conversation-operation.found" &&
      operation.operation.capabilities.terminal
    ) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`seed conversation did not settle: ${sessionId}`)
}

async function readTerminal(
  client: ReturnType<typeof createSurfaceClient>,
  queryId: string
): Promise<SideQueryReadModel> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const result = await client.readSideQuery({ queryId })
    assert(result.ok, "side-query canonical read should succeed")
    assert(
      result.value.kind === "assistant.side-query.found",
      "side-query should remain retained until explicit replacement or dismiss"
    )
    if (result.value.query.state !== "running") return result.value.query
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`side query did not settle: ${queryId}`)
}

async function readDurableEvidence(storage: StorageTestStore) {
  const sessions = [SESSION_A, SESSION_B]
  const sessionEvidence = await Promise.all(
    sessions.map(async (sessionId) => {
      const [inputs, messages, turns, events, tools, epochs] =
        await Promise.all([
          storage.listSessionInputs({ sessionId }),
          storage.listSessionMessages({ sessionId }),
          storage.listSessionTurns({ sessionId }),
          storage.queryEvents({ scope: { sessionId }, limit: 1_000 }),
          storage.listToolExecutions({ sessionId }),
          storage.listContextEpochs({ sessionId })
        ])
      const [attempts, invocations, controls, toolAttempts] = await Promise.all(
        [
          Promise.all(
            turns.map(
              async (turn) =>
                await storage.listSessionAttempts({ turnId: turn.id })
            )
          ).then((rows) => rows.flat()),
          Promise.all(
            turns.map(
              async (turn) =>
                await storage.listProviderInvocations({ turnId: turn.id })
            )
          ).then((rows) => rows.flat()),
          Promise.all(
            turns.map(
              async (turn) =>
                await storage.listSessionTurnControls({
                  sessionId,
                  turnId: turn.id
                })
            )
          ).then((rows) => rows.flat()),
          Promise.all(
            tools.map(
              async (tool) =>
                await storage.listToolExecutionAttempts({
                  executionId: tool.id
                })
            )
          ).then((rows) => rows.flat())
        ]
      )
      return {
        sessionId,
        inputs,
        messages,
        turns,
        attempts,
        invocations,
        controls,
        events,
        tools,
        toolAttempts,
        epochs
      }
    })
  )
  return {
    sessions: sessionEvidence,
    jobs: await storage.listJobs({ limit: 1_000 })
  }
}

function modelEndpoint(request: {
  readonly id: string
  readonly modelId: string
  readonly baseUrl: string
  readonly secretRef: string
}) {
  return evalOpenAICompatibleModelEndpoint({
    id: request.id,
    modelId: request.modelId,
    baseUrl: request.baseUrl,
    secretRef: request.secretRef
  })
}

function createProviderFixture() {
  const successStarted = deferred<void>()
  const releaseSuccess = deferred<void>()
  const cancelStarted = deferred<void>()
  const cancelAborted = deferred<void>()
  const disposeStarted = deferred<void>()
  const disposeAborted = deferred<void>()
  const releaseDisposeCleanup = deferred<void>()
  const calls: Array<{
    readonly model: string
    readonly body: string
  }> = []

  const fetch = (async (
    _input: Parameters<typeof globalThis.fetch>[0],
    init?: Parameters<typeof globalThis.fetch>[1]
  ): Promise<Response> => {
    assert(typeof init?.body === "string", "Provider body should be JSON text")
    const body = init.body
    const model = requestModel(body)
    calls.push({ model, body })
    if (body.includes(SUCCESS_QUESTION)) {
      successStarted.resolve()
      await releaseSuccess.promise
      return providerTextResponse("selected side answer")
    }
    if (body.includes(CANCEL_QUESTION)) {
      cancelStarted.resolve()
      return await abortableProviderRequest({
        signal: init.signal,
        aborted: cancelAborted,
        cleanup: Promise.resolve()
      })
    }
    if (body.includes(DISPOSE_QUESTION)) {
      disposeStarted.resolve()
      return await abortableProviderRequest({
        signal: init.signal,
        aborted: disposeAborted,
        cleanup: releaseDisposeCleanup.promise
      })
    }
    return providerTextResponse(`seed answer for ${calls.length}`)
  }) as typeof globalThis.fetch

  return {
    fetch,
    calls,
    successStarted,
    releaseSuccess,
    cancelStarted,
    cancelAborted,
    disposeStarted,
    disposeAborted,
    releaseDisposeCleanup,
    callForQuestion(question: string) {
      const call = calls.find((candidate) => candidate.body.includes(question))
      assert(call !== undefined, `Provider call not found: ${question}`)
      return call
    }
  }
}

async function abortableProviderRequest(request: {
  readonly signal: AbortSignal | null | undefined
  readonly aborted: ReturnType<typeof deferred<void>>
  readonly cleanup: Promise<void>
}): Promise<Response> {
  return await new Promise<Response>((_resolve, reject) => {
    const abort = () => {
      request.aborted.resolve()
      void request.cleanup.then(() => {
        const error = new Error("Provider request aborted after cleanup")
        error.name = "AbortError"
        reject(error)
      })
    }
    if (request.signal?.aborted) {
      abort()
      return
    }
    request.signal?.addEventListener("abort", abort, { once: true })
  })
}

function requestModel(body: string): string {
  const parsed = JSON.parse(body) as { readonly model?: unknown }
  assert(
    typeof parsed.model === "string",
    "Provider request should name a model"
  )
  return parsed.model
}

function providerTextResponse(text: string): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    body: (async function* () {
      yield `data: ${JSON.stringify({
        choices: [
          {
            delta: { content: text },
            finish_reason: "stop"
          }
        ]
      })}\n\n`
      yield "data: [DONE]\n\n"
    })(),
    async text() {
      return ""
    }
  } as unknown as Response
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}
