import { rm } from "node:fs/promises"
import {
  createMemoryStateStore,
  createShell,
  createSurfaceAdapter,
  type Shell
} from "@wanex/product"
import {
  createInProcessSurfaceClientTransport,
  createSurfaceClient
} from "@wanex/product/surface"
import {
  createSurface,
  type Snapshot
} from "@wanex/web"
import {
  EnvSecretProvider,
  SecretResolver
} from "@wanex/runtime/secrets"
import {
  createStorageTestStore,
  type StorageTestStore
} from "@wanex/storage/testing"
import { createEvalScenario } from "../runner.js"
import { assert, evalOpenAICompatibleModelEndpoint } from "../scenario-utils.js"
import { mktemp } from "../product-bootstrap/helpers.js"
import { productConversationRowText } from "./conversation-helpers.js"

const SESSION_ID = "ses_eval_product_same_turn_steering"
const PROFILE_A_ID = "eval-same-turn-steering-a"
const PROFILE_B_ID = "eval-same-turn-steering-b"
const PROFILE_A_MODEL = "eval-same-turn-steering-model-a"
const PROFILE_B_MODEL = "eval-same-turn-steering-model-b"
const PROFILE_A_BASE_URL = "https://provider-a.steering.example.test/v1"
const PROFILE_B_BASE_URL = "https://provider-b.steering.example.test/v1"
const PROFILE_A_SECRET_REF = "env://WANEX_EVAL_STEERING_PROVIDER_A_KEY"
const PROFILE_B_SECRET_REF = "env://WANEX_EVAL_STEERING_PROVIDER_B_KEY"
const INITIAL_TEXT = "analyze the release readiness"
const STEERING_TEXT = "focus the answer on unresolved operational risks"
const FIRST_RESPONSE = "initial release analysis"
const FINAL_RESPONSE = "operational risks after guidance"

export const sameTurnSteeringScenario = createEvalScenario({
  id: "product.same-turn-steering-operational",
  title:
    "Product guides one active Turn at a Provider safe point without identity leakage",
  tags: [
    "product",
    "conversation",
    "steering",
    "provider-binding",
    "web",
    "product-path"
  ],
  async run(context) {
    const storeDir = await mktemp("wanex-eval-product-same-turn-steering-")
    const provider = createProviderFixture()
    const originalFetch = globalThis.fetch
    globalThis.fetch = provider.fetch
    let app: Shell | undefined
    let surface:
      | ReturnType<typeof createSurfaceAdapter>
      | undefined
    let storage: StorageTestStore | undefined

    try {
      app = await createShell({
        storage: {
          kind: "local-system-service",
          storeDir
        },
        artifacts: {
          explicitPath: context.serviceBin
        },
        modelEndpoint: modelEndpoint({
          id: PROFILE_A_ID,
          modelId: PROFILE_A_MODEL,
          baseUrl: PROFILE_A_BASE_URL,
          secretRef: PROFILE_A_SECRET_REF
        }),
        secretResolver: new SecretResolver([
          new EnvSecretProvider({
            WANEX_EVAL_STEERING_PROVIDER_A_KEY: "eval-steering-secret-a",
            WANEX_EVAL_STEERING_PROVIDER_B_KEY: "eval-steering-secret-b"
          })
        ]),
        stateStore: createMemoryStateStore()
      })
      await app.modelEndpoints.upsertModelEndpoint({
        modelEndpoint: modelEndpoint({
          id: PROFILE_B_ID,
          modelId: PROFILE_B_MODEL,
          baseUrl: PROFILE_B_BASE_URL,
          secretRef: PROFILE_B_SECRET_REF
        })
      })
      surface = createSurfaceAdapter(app)
      const client = createSurfaceClient(
        createInProcessSurfaceClientTransport(surface)
      )
      const web = await createSurface({ client })
      storage = createStorageTestStore({
        kind: "local-system-service",
        mode: "oneshot",
        storeDir,
        serviceBin: context.serviceBin
      })

      const submitted = await web.dispatchAction({
        type: "submit-conversation",
        input: {
          sessionId: SESSION_ID,
          text: INITIAL_TEXT
        }
      })
      const operation = submitted.snapshot.conversation.operation
      assert(
        submitted.ok &&
          operation !== undefined &&
          operation.state === "running" &&
          operation.capabilities.steerable,
        "Product should return one steerable active conversation operation"
      )
      await withTimeout(
        provider.firstStarted.promise,
        2_000,
        "first Provider request did not start"
      )

      const beforeSteering = await readExecutionEvidence(storage, SESSION_ID)
      assert(
        beforeSteering.sessions.length === 1 &&
          beforeSteering.turns.length === 1 &&
          beforeSteering.attempts.length === 1,
        "initial Product submission should create one Session, Turn, and attempt"
      )
      const initialTurn = beforeSteering.turns[0]!
      const initialAttempt = beforeSteering.attempts[0]!
      assert(
        initialTurn.state === "running" &&
          initialTurn.currentAttemptId === initialAttempt.id &&
          initialTurn.executionBinding.modelEndpoint.endpointId === PROFILE_A_ID,
        "active Turn should bind its exact attempt and initial model endpoint"
      )

      await app.modelEndpoints.setActiveModelEndpoint({
        endpointId: PROFILE_B_ID
      })
      const steered = await web.dispatchAction(
        {
          type: "steer-current-response",
          input: {
            sessionId: SESSION_ID,
            operationId: operation.operationId,
            text: STEERING_TEXT
          }
        },
        { requestId: "eval-product-same-turn-steering" }
      )
      const pending = steered.snapshot.conversation.operation?.steering?.pending
      assert(
        steered.ok &&
          steered.snapshot.conversation.operationId === operation.operationId &&
          steered.snapshot.conversation.operation?.state === "running" &&
          pending?.length === 1 &&
          pending[0]?.text === STEERING_TEXT &&
          !steered.snapshot.conversation.canSteer,
        "Web should expose one canonical pending guidance record after durable acceptance"
      )

      const pendingEvidence = await readExecutionEvidence(storage, SESSION_ID)
      assert(
        pendingEvidence.controls.length === 1 &&
          pendingEvidence.controls[0]?.status === "pending" &&
          pendingEvidence.controls[0]?.turnId === initialTurn.id &&
          pendingEvidence.controls[0]?.attemptId === initialAttempt.id,
        "durable steering should target the exact active Turn attempt"
      )
      assertNoLowerIdentityLeak(
        steered.snapshot,
        lowerIdentities(pendingEvidence)
      )

      provider.releaseFirst.resolve()
      await withTimeout(
        provider.secondStarted.promise,
        2_000,
        "second Provider request did not start after the safe checkpoint"
      )
      const terminal = await waitForTerminal(web, operation.operationId)
      const finalEvidence = await readExecutionEvidence(storage, SESSION_ID)
      const terminalOperation = terminal.conversation.operation

      assert(
        terminal.conversation.state === "succeeded" &&
          terminal.conversation.operationId === operation.operationId &&
          terminalOperation !== undefined &&
          terminalOperation.steering === undefined,
        "the same opaque Product operation should settle without pending steering"
      )
      assert(
        terminalOperation.transcript.rows.some(
          (row) =>
            row.role === "user" &&
            productConversationRowText(row) === STEERING_TEXT
        ) &&
          terminalOperation.transcript.rows.some(
            (row) =>
              row.role === "assistant" &&
              productConversationRowText(row) === FINAL_RESPONSE
          ),
        "canonical Product transcript should contain promoted guidance and the final response"
      )
      assert(
        finalEvidence.sessions.length === 1 &&
          finalEvidence.turns.length === 1 &&
          finalEvidence.attempts.length === 1 &&
          finalEvidence.turns[0]?.id === initialTurn.id &&
          finalEvidence.attempts[0]?.id === initialAttempt.id,
        "steering must not create a second Session, Turn, or attempt"
      )
      assert(
        finalEvidence.invocations.length === 2 &&
          finalEvidence.invocations.every(
            (invocation) =>
              invocation.turnId === initialTurn.id &&
              invocation.attemptId === initialAttempt.id &&
              invocation.state === "succeeded"
          ),
        "the same attempt should own exactly two successful Provider invocations"
      )
      assert(
        finalEvidence.controls.length === 1 &&
          finalEvidence.controls[0]?.status === "applied" &&
          finalEvidence.controls[0]?.inputId !== undefined,
        "Runtime should promote the accepted steering control exactly once"
      )
      assert(
        provider.calls.length === 2 &&
          provider.calls.every(
            (call) =>
              call.url.startsWith(PROFILE_A_BASE_URL) &&
              call.model === PROFILE_A_MODEL
          ) &&
          provider.calls[1]?.messageText.includes(STEERING_TEXT) === true &&
          provider.abortCount === 0,
        "both Provider requests should use the frozen endpoint and the second should include guidance"
      )
      assertNoLowerIdentityLeak(terminal, lowerIdentities(finalEvidence))

      return {
        operationIdStable:
          terminal.conversation.operationId === operation.operationId,
        sessionCount: finalEvidence.sessions.length,
        turnCount: finalEvidence.turns.length,
        attemptCount: finalEvidence.attempts.length,
        providerCallCount: provider.calls.length,
        providerInvocationCount: finalEvidence.invocations.length,
        frozenModelEndpointId:
          finalEvidence.turns[0]?.executionBinding.modelEndpoint.endpointId,
        steeringStatus: finalEvidence.controls[0]?.status,
        lowerIdentityLeak: false
      }
    } finally {
      provider.releaseFirst.resolve()
      await storage?.dispose()
      await surface?.dispose()
      await app?.dispose()
      globalThis.fetch = originalFetch
      await rm(storeDir, { recursive: true, force: true })
    }
  }
})

interface ProviderCall {
  readonly url: string
  readonly model: string
  readonly messageText: string
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
  const firstStarted = deferred<void>()
  const secondStarted = deferred<void>()
  const releaseFirst = deferred<void>()
  const calls: ProviderCall[] = []
  let abortCount = 0
  const fetch = (async (
    input: Parameters<typeof globalThis.fetch>[0],
    init?: Parameters<typeof globalThis.fetch>[1]
  ): Promise<Response> => {
    const body = requestBody(init)
    calls.push({
      url: String(input),
      model: body.model,
      messageText: providerMessageText(body.messages)
    })
    if (calls.length === 1) {
      firstStarted.resolve()
      return providerResponse((async function* () {
        await releaseFirst.promise
        if (init?.signal?.aborted === true) abortCount += 1
        yield sseChunk(FIRST_RESPONSE, "stop")
        yield "data: [DONE]\n\n"
      })())
    }
    if (calls.length === 2) {
      secondStarted.resolve()
      return providerResponse((async function* () {
        yield sseChunk(FINAL_RESPONSE, "stop")
        yield "data: [DONE]\n\n"
      })())
    }
    throw new Error("same-Turn steering dispatched an unexpected Provider call")
  }) as typeof globalThis.fetch
  return {
    fetch,
    calls,
    firstStarted,
    secondStarted,
    releaseFirst,
    get abortCount() {
      return abortCount
    }
  }
}

function requestBody(init: Parameters<typeof globalThis.fetch>[1]): {
  readonly model: string
  readonly messages: readonly unknown[]
} {
  assert(
    typeof init?.body === "string",
    "Provider request body should be JSON text"
  )
  const body = JSON.parse(init.body) as {
    readonly model?: unknown
    readonly messages?: unknown
  }
  assert(typeof body.model === "string", "Provider request should name a model")
  assert(Array.isArray(body.messages), "Provider request should contain messages")
  return { model: body.model, messages: body.messages }
}

function providerMessageText(messages: readonly unknown[]): string {
  return messages
    .flatMap((message) => {
      if (typeof message !== "object" || message === null) return []
      const content = (message as { readonly content?: unknown }).content
      if (typeof content === "string") return [content]
      if (!Array.isArray(content)) return []
      return content.flatMap((part) => {
        if (typeof part !== "object" || part === null) return []
        const text = (part as { readonly text?: unknown }).text
        return typeof text === "string" ? [text] : []
      })
    })
    .join("\n")
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

async function readExecutionEvidence(
  storage: StorageTestStore,
  sessionId: string
) {
  const [sessions, turns] = await Promise.all([
    storage.listSessions({}),
    storage.listSessionTurns({ sessionId })
  ])
  const attempts = (
    await Promise.all(
      turns.map((turn) => storage.listSessionAttempts({ turnId: turn.id }))
    )
  ).flat()
  const controls = (
    await Promise.all(
      turns.map((turn) =>
        storage.listSessionTurnControls({
          sessionId,
          turnId: turn.id,
          kind: "steer"
        })
      )
    )
  ).flat()
  const invocations = (
    await Promise.all(
      turns.map((turn) =>
        storage.listProviderInvocations({ turnId: turn.id })
      )
    )
  ).flat()
  return { sessions, turns, attempts, controls, invocations }
}

function lowerIdentities(
  evidence: Awaited<ReturnType<typeof readExecutionEvidence>>
): readonly string[] {
  return [
    ...evidence.turns.flatMap((turn) => [
      turn.id,
      turn.primaryInputId,
      turn.jobId
    ]),
    ...evidence.attempts.map((attempt) => attempt.id),
    ...evidence.controls.flatMap((control) => [
      control.id,
      ...(control.inputId === undefined ? [] : [control.inputId])
    ]),
    ...evidence.invocations.map((invocation) => invocation.id)
  ]
}

function assertNoLowerIdentityLeak(value: unknown, identities: readonly string[]) {
  const serialized = JSON.stringify(value)
  for (const identity of identities) {
    assert(
      !serialized.includes(identity),
      `Product/Web output exposed lower execution identity: ${identity}`
    )
  }
}

async function waitForTerminal(
  web: Awaited<ReturnType<typeof createSurface>>,
  operationId: string
): Promise<Snapshot> {
  return await eventually(async () => {
    const snapshot = await web.reconcileEvents({ limit: 50 })
    assert(
      snapshot.conversation.operationId === operationId &&
        snapshot.conversation.operation?.capabilities.terminal === true,
      "same-Turn steering operation has not reached terminal state"
    )
    return snapshot
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
    if (timer !== undefined) clearTimeout(timer)
  }
}
