import { rm } from "node:fs/promises"
import {
  createMemoryStateStore,
  createShell,
  createSurfaceAdapter,
  type Shell
} from "@wanex/assistant"
import {
  createInProcessSurfaceClientTransport,
  createSurfaceClient
} from "@wanex/assistant/surface"
import {
  createSurface,
  type Snapshot
} from "@wanex/assistant-ui"
import type {
  SessionInputRecord,
  SessionTurnRecord
} from "@wanex/protocol"
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
import { mktemp } from "../assistant-bootstrap/helpers.js"
import { assistantConversationRowText } from "./conversation-helpers.js"

const SESSION_ID = "ses_eval_assistant_guided_follow_up"
const PROFILE_A_ID = "eval-guided-provider-a"
const PROFILE_B_ID = "eval-guided-provider-b"
const PROFILE_A_MODEL = "eval-guided-model-a"
const PROFILE_B_MODEL = "eval-guided-model-b"
const PROFILE_A_BASE_URL = "https://provider-a.guided.example.test/v1"
const PROFILE_B_BASE_URL = "https://provider-b.guided.example.test/v1"
const PROFILE_A_SECRET_REF = "env://WANEX_EVAL_GUIDED_PROVIDER_A_KEY"
const PROFILE_B_SECRET_REF = "env://WANEX_EVAL_GUIDED_PROVIDER_B_KEY"
const PARENT_TEXT = "perform the current analysis"
const GUIDED_TEXT = "then summarize only the remaining risks"
const PARENT_DELTA_BEFORE_GUIDANCE = "parent analysis started"
const PARENT_DELTA_AFTER_GUIDANCE = " and continued after guidance"
const PARENT_SETTLED_SUFFIX = " before settlement"
const CHILD_DELTA = "remaining risks summarized"
const CHILD_SETTLED_SUFFIX = " canonically"

export const guidedFollowUpScenario = createEvalScenario({
  id: "assistant.guided-follow-up-operational",
  title:
    "Assistant queues an exact next Turn without rebinding or interrupting the current Turn",
  tags: [
    "assistant",
    "conversation",
    "guided-follow-up",
    "provider-binding",
    "web",
    "assistant-path"
  ],
  async run(context) {
    const storeDir = await mktemp("wanex-eval-assistant-guided-follow-up-")
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
            WANEX_EVAL_GUIDED_PROVIDER_A_KEY: "eval-guided-secret-a",
            WANEX_EVAL_GUIDED_PROVIDER_B_KEY: "eval-guided-secret-b"
          })
        ]),
        stateStore: createMemoryStateStore()
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

      await app.modelEndpoints.upsertModelEndpoint({
        modelEndpoint: modelEndpoint({
          id: PROFILE_B_ID,
          modelId: PROFILE_B_MODEL,
          baseUrl: PROFILE_B_BASE_URL,
          secretRef: PROFILE_B_SECRET_REF
        })
      })

      const submitted = await web.dispatchAction({
        type: "submit-conversation",
        input: {
          sessionId: SESSION_ID,
          text: PARENT_TEXT
        }
      })
      const parentOperation = submitted.snapshot.conversation.operation
      assert(
        submitted.ok &&
          parentOperation !== undefined &&
          parentOperation.capabilities.terminal === false,
        "parent should return an active durable Assistant operation"
      )
      await withTimeout(
        provider.parentStarted.promise,
        2_000,
        "parent Provider request did not start"
      )
      const parentBeforeGuidance = await eventually(async () => {
        const snapshot = await web.reconcileEvents({ limit: 50 })
        assert(
          snapshot.conversation.operationId === parentOperation.operationId &&
            snapshot.conversation.transientAssistantText?.includes(
              PARENT_DELTA_BEFORE_GUIDANCE
            ) === true,
          "parent delta should stream before guidance admission"
        )
        return snapshot
      })

      const evidenceBeforeForgery = await readEvidence(storage, SESSION_ID)
      assert(
        evidenceBeforeForgery.inputs.length === 1 &&
          evidenceBeforeForgery.turns.length === 1,
        "parent admission should create exactly one Input and Turn"
      )
      const forged = await web.dispatchAction({
        type: "queue-guided-follow-up",
        input: {
          sessionId: SESSION_ID,
          operationId: `${parentOperation.operationId}_forged`,
          text: "forged guidance"
        }
      })
      assert(
        !forged.ok &&
          forged.message.includes("no longer current") &&
          forged.snapshot.operationStatus.state === "blocked" &&
          forged.snapshot.conversation.operationId ===
            parentOperation.operationId,
        "forged Assistant operation identity should fail without replacing canonical parent state"
      )
      const evidenceAfterForgery = await readEvidence(storage, SESSION_ID)
      assert(
        evidenceAfterForgery.inputs.length === 1 &&
          evidenceAfterForgery.turns.length === 1,
        "forged opaque identity must not create durable work"
      )

      await app.modelEndpoints.setActiveModelEndpoint({
        endpointId: PROFILE_B_ID
      })
      const guided = await web.dispatchAction({
        type: "queue-guided-follow-up",
        input: {
          sessionId: SESSION_ID,
          operationId: parentOperation.operationId,
          text: GUIDED_TEXT
        }
      })
      const pending = guided.snapshot.conversation.pendingFollowUp
      assert(
        guided.ok &&
          guided.snapshot.conversation.operationId ===
            parentOperation.operationId &&
          pending !== undefined &&
          pending.state === "queued" &&
          pending.text === GUIDED_TEXT,
        "guided admission should retain the parent and expose one canonical pending child"
      )
      await app.modelEndpoints.setActiveModelEndpoint({
        endpointId: PROFILE_A_ID
      })

      const queuedEvidence = await readEvidence(storage, SESSION_ID)
      const parentInput = inputByText(queuedEvidence.inputs, PARENT_TEXT)
      const childInput = inputByText(queuedEvidence.inputs, GUIDED_TEXT)
      const parentTurn = turnForInput(queuedEvidence.turns, parentInput.id)
      const childTurn = turnForInput(queuedEvidence.turns, childInput.id)
      assert(
        parentTurn.executionBinding.modelEndpoint.endpointId === PROFILE_A_ID &&
          parentTurn.executionBinding.modelEndpoint.model.id === PROFILE_A_MODEL &&
          childTurn.executionBinding.modelEndpoint.endpointId === PROFILE_B_ID &&
          childTurn.executionBinding.modelEndpoint.model.id === PROFILE_B_MODEL,
        "each admitted Turn should retain its immutable Provider binding"
      )
      assert(
        childInput.intent === "follow_up" &&
          childInput.runControlPolicy === "queue_after_current" &&
          childInput.expectedTurnId === parentTurn.id &&
          childInput.origin?.kind === "interactive" &&
          childInput.origin.sourceRef === "assistant.guided-follow-up" &&
          childInput.origin.parentRef === parentTurn.id,
        "guided child should persist exact intent, policy, target, and origin provenance"
      )
      const queuedChildAttempts = await storage.listSessionAttempts({
        turnId: childTurn.id
      })
      assert(
        queuedChildAttempts.length === 0 && childTurn.state === "queued",
        "child must not execute while the parent owns the Session concurrency key"
      )

      provider.continueParent.resolve()
      const parentAfterGuidance = await eventually(async () => {
        const snapshot = await web.reconcileEvents({ limit: 50 })
        assert(
          snapshot.conversation.operationId === parentOperation.operationId &&
            snapshot.conversation.pendingFollowUp?.operationId ===
              pending.operationId &&
            snapshot.conversation.transientAssistantText?.includes(
              PARENT_DELTA_AFTER_GUIDANCE
            ) === true,
          "parent deltas should continue while the child remains pending"
        )
        return snapshot
      })

      provider.releaseParent.resolve()
      await withTimeout(
        provider.childStarted.promise,
        2_000,
        "guided child Provider request did not start after parent settlement"
      )
      const promoted = await eventually(async () => {
        const snapshot = await web.reconcileEvents({ limit: 50 })
        assert(
          snapshot.conversation.operationId === pending.operationId &&
            snapshot.conversation.pendingFollowUp === undefined &&
            snapshot.conversation.transientAssistantText?.includes(
              CHILD_DELTA
            ) === true,
          "canonical read should promote the child and route its deltas to the new opaque operation"
        )
        return snapshot
      })

      const staleOpaque = await app.queueGuidedFollowUp({
        sessionId: SESSION_ID,
        operationId: parentOperation.operationId,
        text: "stale opaque guidance"
      })
      assert(
        staleOpaque.kind === "assistant.conversation-operation.rejected" &&
          staleOpaque.reason === "operation_identity_mismatch",
        "the promoted child should make the parent Assistant identity stale"
      )
      const staleDurable = await app.dispatchAssistantCommand({
        command: "routeWorkflowEnvelope",
        input: {
          kind: "guided_follow_up",
          sessionId: SESSION_ID,
          activeTurnId: parentTurn.id,
          sourceRef: "eval.stale-guidance",
          text: "stale durable guidance"
        }
      })
      assert(
        !staleDurable.ok &&
          staleDurable.error.category === "validation",
        "System Service should reject a stale exact parent Turn"
      )
      const evidenceAfterStale = await readEvidence(storage, SESSION_ID)
      assert(
        evidenceAfterStale.inputs.length === 2 &&
          evidenceAfterStale.turns.length === 2,
        "stale Assistant and durable references must not create extra work"
      )

      provider.releaseChild.resolve()
      const terminal = await waitForTerminal(web, pending.operationId)
      const finalEvidence = await readEvidence(storage, SESSION_ID)
      const parentAttempts = await storage.listSessionAttempts({
        turnId: parentTurn.id
      })
      const childAttempts = await storage.listSessionAttempts({
        turnId: childTurn.id
      })
      assert(
        parentAttempts.length === 1 &&
          childAttempts.length === 1 &&
          parentAttempts[0]!.finishedAt !== undefined &&
          childAttempts[0]!.startedAt >= parentAttempts[0]!.finishedAt,
        "child execution should begin only after parent settlement"
      )
      assert(
        finalEvidence.turns.every((turn) => turn.state === "succeeded"),
        "both parent and guided child should settle successfully"
      )
      assert(
        provider.calls.length === 2 &&
          provider.calls[0]?.url.startsWith(PROFILE_A_BASE_URL) === true &&
          provider.calls[0]?.model === PROFILE_A_MODEL &&
          provider.calls[1]?.url.startsWith(PROFILE_B_BASE_URL) === true &&
          provider.calls[1]?.model === PROFILE_B_MODEL,
        "physical Provider calls should honor the immutable A then B Turn bindings"
      )
      const transcript = terminal.conversation.historyRows.map((row) => ({
        role: row.role,
        text: assistantConversationRowText(row)
      }))
      assert(
        transcript.some(
          (row) => row.role === "user" && row.text === PARENT_TEXT
        ) &&
          transcript.some(
            (row) =>
              row.role === "assistant" &&
              row.text ===
                `${PARENT_DELTA_BEFORE_GUIDANCE}${PARENT_DELTA_AFTER_GUIDANCE}${PARENT_SETTLED_SUFFIX}`
          ) &&
          transcript.some(
            (row) => row.role === "user" && row.text === GUIDED_TEXT
          ) &&
          transcript.some(
            (row) =>
              row.role === "assistant" &&
              row.text === `${CHILD_DELTA}${CHILD_SETTLED_SUFFIX}`
          ),
        "canonical Session history should contain both complete Turns"
      )

      return {
        parentReceiptState: parentOperation.state,
        parentDeltaVisibleBeforeGuidance:
          parentBeforeGuidance.conversation.transientAssistantText?.includes(
            PARENT_DELTA_BEFORE_GUIDANCE
          ) === true,
        parentDeltaVisibleAfterGuidance:
          parentAfterGuidance.conversation.transientAssistantText?.includes(
            PARENT_DELTA_AFTER_GUIDANCE
          ) === true,
        pendingState: pending.state,
        promotedOperationIdMatches:
          promoted.conversation.operationId === pending.operationId,
        terminalState: terminal.conversation.state,
        parentModelEndpointId:
          parentTurn.executionBinding.modelEndpoint.endpointId,
        childModelEndpointId:
          childTurn.executionBinding.modelEndpoint.endpointId,
        durableInputCount: finalEvidence.inputs.length,
        durableTurnCount: finalEvidence.turns.length,
        forgedRejected: !forged.ok,
        staleRejected: !staleDurable.ok
      }
    } finally {
      provider.releaseAll()
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
  const continueParent = deferred<void>()
  const releaseParent = deferred<void>()
  const releaseChild = deferred<void>()
  const parentStarted = deferred<void>()
  const childStarted = deferred<void>()
  const calls: ProviderCall[] = []
  const fetch = (async (
    input: Parameters<typeof globalThis.fetch>[0],
    init?: Parameters<typeof globalThis.fetch>[1]
  ): Promise<Response> => {
    const call = {
      url: String(input),
      model: requestModel(init)
    }
    calls.push(call)
    if (calls.length === 1) {
      parentStarted.resolve()
      return providerResponse((async function* () {
        yield sseChunk(PARENT_DELTA_BEFORE_GUIDANCE, null)
        await continueParent.promise
        yield sseChunk(PARENT_DELTA_AFTER_GUIDANCE, null)
        await releaseParent.promise
        yield sseChunk(PARENT_SETTLED_SUFFIX, "stop")
        yield "data: [DONE]\n\n"
      })())
    }
    if (calls.length === 2) {
      childStarted.resolve()
      return providerResponse((async function* () {
        yield sseChunk(CHILD_DELTA, null)
        await releaseChild.promise
        yield sseChunk(CHILD_SETTLED_SUFFIX, "stop")
        yield "data: [DONE]\n\n"
      })())
    }
    throw new Error("guided follow-up eval dispatched an unexpected Provider call")
  }) as typeof globalThis.fetch
  return {
    fetch,
    calls,
    continueParent,
    releaseParent,
    releaseChild,
    parentStarted,
    childStarted,
    releaseAll() {
      continueParent.resolve()
      releaseParent.resolve()
      releaseChild.resolve()
    }
  }
}

function requestModel(init: Parameters<typeof globalThis.fetch>[1]): string {
  assert(
    typeof init?.body === "string",
    "Provider request body should be JSON text"
  )
  const value = JSON.parse(init.body) as { readonly model?: unknown }
  assert(typeof value.model === "string", "Provider request should name a model")
  return value.model
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

async function readEvidence(
  storage: StorageTestStore,
  sessionId: string
): Promise<{
  readonly inputs: readonly SessionInputRecord[]
  readonly turns: readonly SessionTurnRecord[]
}> {
  const [inputs, turns] = await Promise.all([
    storage.listSessionInputs({ sessionId }),
    storage.listSessionTurns({ sessionId })
  ])
  return { inputs, turns }
}

function inputByText(
  inputs: readonly SessionInputRecord[],
  text: string
): SessionInputRecord {
  const input = inputs.find((candidate) =>
    candidate.content.some(
      (part) => part.type === "text" && part.text === text
    )
  )
  assert(input !== undefined, `durable Input not found for text: ${text}`)
  return input
}

function turnForInput(
  turns: readonly SessionTurnRecord[],
  inputId: string
): SessionTurnRecord {
  const turn = turns.find((candidate) => candidate.primaryInputId === inputId)
  assert(turn !== undefined, `durable Turn not found for Input: ${inputId}`)
  return turn
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
      "guided child has not reached terminal state"
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
