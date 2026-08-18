import { rm } from "node:fs/promises"
import {
  createMemoryStateStore,
  createShell,
  createSurfaceAdapter,
  type SurfaceEvent
} from "@wanex/product"
import {
  createInProcessSurfaceClientTransport,
  createSurfaceClient,
  type SurfaceClient
} from "@wanex/product/surface"
import {
  createSurface,
  type Snapshot
} from "@wanex/web"
import {
  EnvSecretProvider,
  SecretResolver
} from "@wanex/runtime/secrets"
import { createStorageTestStore } from "@wanex/storage/testing"
import { createEvalScenario } from "../runner.js"
import { assert, evalOpenAICompatibleModelEndpoint } from "../scenario-utils.js"
import { mktemp } from "../product-bootstrap/helpers.js"
import { productConversationRowText } from "./conversation-helpers.js"

const PROFILE_ID = "eval-product-conversation-lifecycle"
const PROVIDER_BASE_URL = "https://provider.lifecycle.example.test/v1"
const SECRET_REF = "env://WANEX_EVAL_PRODUCT_CONVERSATION_KEY"
const SECRET_VALUE = "wanex-eval-product-conversation-secret"
const STREAMED_TEXT = "visible assistant delta"
const SETTLED_TEXT = " reconciled from canonical transcript"
const STALE_TEXT = "stale operation text must stay hidden"
const REGENERATED_TEXT = "regenerated canonical answer"

export const conversationLifecycleScenario = createEvalScenario({
  id: "product.conversation-lifecycle-operational",
  title:
    "Product conversation receipts, progress, cancel, regeneration, and recovery stay coherent",
  tags: [
    "product",
    "conversation",
    "progress",
    "cancel",
    "regeneration",
    "recovery",
    "product-path"
  ],
  async run(context) {
    const storeDir = await mktemp("wanex-eval-product-conversation-")
    const stateStore = createMemoryStateStore()
    const provider = createProviderFixture()
    const originalFetch = globalThis.fetch
    globalThis.fetch = provider.fetch
    let firstStack: Awaited<ReturnType<typeof createProductStack>> | undefined
    let secondStack: Awaited<ReturnType<typeof createProductStack>> | undefined

    try {
      firstStack = await createProductStack({
        storeDir,
        serviceBin: context.serviceBin,
        stateStore
      })
      const staleProbe: StaleEventProbe = { injected: false }
      const web = await createSurface({
        client: withStaleEventProbe(firstStack.client, staleProbe)
      })
      const submitted = await web.dispatchAction({
        type: "submit-conversation",
        input: {
          text: "stream and reconcile this turn",
          sessionId: "ses_eval_product_conversation_stream"
        }
      })
      const submittedOperation = submitted.snapshot.conversation.operation
      assert(submitted.ok, "conversation submission should succeed")
      assert(
        submittedOperation !== undefined &&
          !submittedOperation.capabilities.terminal,
        "Product should return a nonterminal receipt before provider completion"
      )

      const competing = await firstStack.app.submitConversationOperation({
        text: "same-session overlap must be rejected",
        sessionId: submittedOperation.sessionId
      })
      assert(
        competing.kind === "product.conversation-operation.rejected" &&
          competing.reason === "operation_active",
        "Product should reject a second same-session turn while one is active"
      )

      staleProbe.target = {
        operationId: submittedOperation.operationId,
        sessionId: submittedOperation.sessionId
      }
      staleProbe.matchingAlreadyVisible =
        submitted.snapshot.conversation.transientAssistantText?.includes(
          STREAMED_TEXT
        ) === true
      const progressing = await eventually(async () => {
        const snapshot = await web.reconcileEvents({ limit: 50 })
        assert(
          snapshot.conversation.operation?.capabilities.terminal === false,
          "streaming conversation should remain durably nonterminal"
        )
        assert(
          snapshot.conversation.transientAssistantText?.includes(
            STREAMED_TEXT
          ) === true,
          "matching assistant delta should be visible before settlement"
        )
        assert(
          !snapshot.conversation.transientAssistantText.includes(STALE_TEXT),
          "a different operation delta must not alter the active conversation"
        )
        assert(staleProbe.injected, "stale operation probe should be exercised")
        return snapshot
      })

      provider.releaseStream.resolve()
      const settled = await waitForTerminal(web)
      assert(
        settled.conversation.state === "succeeded" &&
          settled.conversation.transientAssistantText === undefined,
        "terminal durable state should replace transient assistant text"
      )
      assert(
        settled.conversation.operation?.transcript.rows.some(
          (row) =>
            row.role === "assistant" &&
            productConversationRowText(row) ===
              `${STREAMED_TEXT}${SETTLED_TEXT}`
        ) === true,
        "canonical transcript should contain the settled assistant response"
      )
      const recoveredOperationId =
        settled.conversation.operation?.operationId
      assert(
        recoveredOperationId !== undefined,
        "settled Product operation should retain its opaque identity"
      )

      await disposeProductStack(firstStack)
      firstStack = undefined
      secondStack = await createProductStack({
        storeDir,
        serviceBin: context.serviceBin,
        stateStore
      })
      const restartedWeb = await createSurface({
        client: secondStack.client
      })
      const recovered = restartedWeb.snapshot()
      assert(
        recovered.conversation.operation?.operationId === recoveredOperationId &&
          recovered.conversation.state === "succeeded",
        "Product restart should reconnect through its persisted operation reference"
      )

      const cancelSubmitted = await restartedWeb.dispatchAction({
        type: "submit-conversation",
        input: {
          text: "cancel this provider call",
          sessionId: "ses_eval_product_conversation_cancel"
        }
      })
      const cancelledSourceOperation =
        cancelSubmitted.snapshot.conversation.operation
      assert(
        cancelSubmitted.ok &&
          cancelledSourceOperation !== undefined &&
          !cancelledSourceOperation.capabilities.terminal,
        "cancellation fixture should begin as an active Product operation"
      )
      await withTimeout(
        provider.cancelStarted.promise,
        2_000,
        "cancellation provider call did not start"
      )
      const cancelRequested = await restartedWeb.dispatchAction({
        type: "cancel-conversation",
        input: {
          sessionId: cancelledSourceOperation.sessionId,
          reason: "eval user cancelled"
        }
      })
      assert(cancelRequested.ok, "Product cancellation command should return")
      const cancelled = await waitForTerminal(restartedWeb)
      assert(
        cancelled.conversation.state === "cancelled" &&
          cancelled.conversation.operation?.transcript.rows.every(
            (row) => row.role !== "assistant"
          ) === true,
        "cancelled operation should reach durable cancellation without a late assistant row"
      )

      const regenerated = await restartedWeb.dispatchAction({
        type: "regenerate-conversation",
        input: { sessionId: cancelledSourceOperation.sessionId }
      })
      const regeneratedOperation = regenerated.snapshot.conversation.operation
      assert(
        regenerated.ok &&
          regeneratedOperation !== undefined &&
          regeneratedOperation.operationId !==
            cancelledSourceOperation.operationId,
        "regeneration should create a fresh opaque Product operation"
      )
      const regeneratedTerminal = await waitForTerminal(restartedWeb)
      assert(
        regeneratedTerminal.conversation.state === "succeeded" &&
          regeneratedTerminal.conversation.operation?.transcript.rows.some(
            (row) =>
              row.role === "assistant" &&
              productConversationRowText(row) === REGENERATED_TEXT
          ) === true,
        "regeneration should settle as a fresh canonical turn"
      )

      const { turns, attempts } = await readTrustedExecutionEvidence({
        storeDir,
        serviceBin: context.serviceBin,
        sessionId: cancelledSourceOperation.sessionId
      })
      assert(turns.length === 2, "regeneration should persist exactly two turns")
      const sourceTurn = turns.find(
        (turn) => turn.regeneratesTurnId === undefined
      )
      const regeneratedTurn = turns.find(
        (turn) => turn.regeneratesTurnId !== undefined
      )
      assert(
        sourceTurn !== undefined &&
          regeneratedTurn !== undefined &&
          regeneratedTurn.regeneratesTurnId === sourceTurn.id &&
          regeneratedTurn.id !== sourceTurn.id &&
          regeneratedTurn.primaryInputId !== sourceTurn.primaryInputId &&
          regeneratedTurn.jobId !== sourceTurn.jobId,
        "regeneration should use fresh input, turn, and job identities linked to the source turn"
      )

      const rendererJson = JSON.stringify({
        submitted: submitted.snapshot,
        progressing,
        settled,
        recovered,
        cancelSubmitted: cancelSubmitted.snapshot,
        cancelRequested: cancelRequested.snapshot,
        cancelled,
        regenerated: regenerated.snapshot,
        regeneratedTerminal
      })
      const forbiddenRendererValues = [
        storeDir,
        context.serviceBin,
        SECRET_REF,
        SECRET_VALUE,
        ...turns.flatMap((turn) => [
          turn.id,
          turn.primaryInputId,
          turn.jobId
        ]),
        ...attempts.flatMap((attempt) => [
          attempt.id,
          attempt.workerId,
          attempt.leaseToken
        ])
      ]
      for (const forbidden of forbiddenRendererValues) {
        assert(
          !rendererJson.includes(forbidden),
          `renderer projection leaked trusted value: ${forbidden}`
        )
      }
      assert(
        rendererJson.includes(PROVIDER_BASE_URL),
        "renderer endpoint projection should retain the auditable service location"
      )

      return {
        receiptState: submittedOperation.state,
        progressState: progressing.conversation.state,
        matchingDeltaVisible:
          progressing.conversation.transientAssistantText?.includes(
            STREAMED_TEXT
          ) === true,
        staleDeltaRejected:
          !progressing.conversation.transientAssistantText?.includes(
            STALE_TEXT
          ),
        settledState: settled.conversation.state,
        recoveredState: recovered.conversation.state,
        cancelledState: cancelled.conversation.state,
        regeneratedState: regeneratedTerminal.conversation.state,
        regenerationLinked: regeneratedTurn.regeneratesTurnId === sourceTurn.id,
        rendererPrivacyChecked: forbiddenRendererValues.length
      }
    } finally {
      if (secondStack !== undefined) {
        await disposeProductStack(secondStack)
      }
      if (firstStack !== undefined) {
        await disposeProductStack(firstStack)
      }
      globalThis.fetch = originalFetch
      await rm(storeDir, { recursive: true, force: true })
    }
  }
})

type StateStore = ReturnType<
  typeof createMemoryStateStore
>

interface StaleEventProbe {
  target?: {
    readonly operationId: string
    readonly sessionId: string
  }
  matchingAlreadyVisible?: boolean
  injected: boolean
}

async function createProductStack(request: {
  readonly storeDir: string
  readonly serviceBin: string
  readonly stateStore: StateStore
}) {
  const app = await createShell({
    storage: {
      kind: "local-system-service",
      storeDir: request.storeDir
    },
    artifacts: {
      explicitPath: request.serviceBin
    },
    modelEndpoint: evalOpenAICompatibleModelEndpoint({
      id: PROFILE_ID,
      modelId: "eval-product-conversation-model",
      baseUrl: PROVIDER_BASE_URL,
      secretRef: SECRET_REF
    }),
    secretResolver: new SecretResolver([
      new EnvSecretProvider({
        WANEX_EVAL_PRODUCT_CONVERSATION_KEY: SECRET_VALUE
      })
    ]),
    stateStore: request.stateStore
  })
  const surface = createSurfaceAdapter(app)
  const client = createSurfaceClient(
    createInProcessSurfaceClientTransport(surface)
  )
  return { app, surface, client }
}

async function disposeProductStack(
  stack: Awaited<ReturnType<typeof createProductStack>>
): Promise<void> {
  await stack.surface.dispose()
  await stack.app.dispose()
}

function withStaleEventProbe(
  client: SurfaceClient,
  probe: StaleEventProbe
): SurfaceClient {
  return {
    ...client,
    async readSurfaceEvents(request) {
      const result = await client.readSurfaceEvents(request)
      if (
        !result.ok ||
        probe.injected ||
        probe.target === undefined
      ) {
        return result
      }
      const target = probe.target
      const matchingEventPresent = result.events.some(
        (event) => {
          const delta = event.conversation
          return (
            delta !== undefined &&
            delta.kind === "product.conversation.assistant-text-delta" &&
            delta.operationId === target.operationId &&
            delta.sessionId === target.sessionId &&
            delta.text.includes(STREAMED_TEXT)
          )
        }
      )
      if (!probe.matchingAlreadyVisible && !matchingEventPresent) {
        return result
      }
      const sequence =
        result.events.reduce(
          (maximum, event) => Math.max(maximum, event.sequence),
          request?.afterSequence ?? 0
        ) + 1
      probe.injected = true
      const staleEvent: SurfaceEvent = {
        id: `product_app_surface_event_stale_${sequence}`,
        sequence,
        type: "product.surface.conversation.assistant-text-delta",
        command: "readTrackedConversationOperation",
        at: Date.now(),
        conversation: {
          kind: "product.conversation.assistant-text-delta",
          sequence: 1,
          at: Date.now(),
          operationId: "product_app_operation_stale",
          sessionId: target.sessionId,
          partId: "text_0",
          text: STALE_TEXT,
          truncated: false
        }
      }
      return {
        ...result,
        latestSequence: sequence,
        events: [...result.events, staleEvent]
      }
    }
  }
}

async function readTrustedExecutionEvidence(request: {
  readonly storeDir: string
  readonly serviceBin: string
  readonly sessionId: string
}) {
  const storage = createStorageTestStore({
    kind: "local-system-service",
    mode: "oneshot",
    storeDir: request.storeDir,
    serviceBin: request.serviceBin
  })
  try {
    const turns = await storage.listSessionTurns({
      sessionId: request.sessionId
    })
    const attempts = (
      await Promise.all(
        turns.map(async (turn) =>
          await storage.listSessionAttempts({ turnId: turn.id })
        )
      )
    ).flat()
    return { turns, attempts }
  } finally {
    await storage.dispose()
  }
}

async function waitForTerminal(
  web: Awaited<ReturnType<typeof createSurface>>
): Promise<Snapshot> {
  return await eventually(async () => {
    const snapshot = await web.reconcileEvents({ limit: 50 })
    assert(
      snapshot.conversation.operation?.capabilities.terminal === true,
      "conversation operation has not reached a terminal state"
    )
    return snapshot
  })
}

function createProviderFixture() {
  const releaseStream = deferred<void>()
  const cancelStarted = deferred<void>()
  let callCount = 0
  const fetch = (async (
    _input: Parameters<typeof globalThis.fetch>[0],
    init?: Parameters<typeof globalThis.fetch>[1]
  ): Promise<Response> => {
    callCount += 1
    if (callCount === 1) {
      return providerResponse((async function* () {
        yield sseChunk(STREAMED_TEXT, null)
        await releaseStream.promise
        yield sseChunk(SETTLED_TEXT, "stop")
        yield "data: [DONE]\n\n"
      })())
    }
    if (callCount === 2) {
      cancelStarted.resolve()
      await waitForAbort(init?.signal)
      throw new DOMException("provider request aborted", "AbortError")
    }
    return providerResponse((async function* () {
      yield sseChunk(REGENERATED_TEXT, "stop")
      yield "data: [DONE]\n\n"
    })())
  }) as typeof globalThis.fetch
  return {
    fetch,
    releaseStream,
    cancelStarted
  }
}

function providerResponse(body: AsyncIterable<string>): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    body,
    async text() {
      return ""
    }
  } as unknown as Response
}

function sseChunk(text: string, finishReason: string | null): string {
  return `data: ${JSON.stringify({
    choices: [
      {
        delta: { content: text },
        finish_reason: finishReason
      }
    ]
  })}\n\n`
}

async function waitForAbort(
  signal: AbortSignal | null | undefined
): Promise<void> {
  assert(signal !== null && signal !== undefined, "provider signal is required")
  if (signal.aborted) {
    return
  }
  await new Promise<void>((resolve) => {
    signal.addEventListener("abort", () => resolve(), { once: true })
  })
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

async function eventually<T>(run: () => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      return await run()
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  }
  throw lastError
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs)
      })
    ])
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer)
    }
  }
}
