import type { JsonValue, ModelEndpoint } from "@wanex/protocol"
import type {
  PreparedProviderReplayMessage,
  ProviderAdapter,
  ProviderEvent,
  ProviderRequest,
  ProviderReplayMessage
} from "@wanex/runtime/provider"
import { WanexSessionCore } from "@wanex/runtime/sessions"
import { settleEvalTurn, startEvalTurn } from "../durable-turn-fixture.js"
import { evalFakeModelEndpoint } from "../scenario-utils.js"

export const MEMORY_PROJECTION_SESSION_ID = "ses_eval_memory_projection"
export const MEMORY_REPLAY_SESSION_ID = "ses_eval_memory_replay"

export const MEMORY_MODEL_ENDPOINT: ModelEndpoint = (() => {
  const endpoint = evalFakeModelEndpoint(
    "eval-memory-semantic",
    "eval-memory-semantic-model",
    "eval-memory-provider"
  )
  return {
    ...endpoint,
    model: {
      ...endpoint.model,
      limits: { contextWindowTokens: 7_500, maxOutputTokens: 500 }
    }
  }
})()

export function contextCompactionEventTypes(types: readonly string[]): string[] {
  return [
    "context.compaction.planned",
    "context.compaction.applied",
    "context.compaction.skipped",
    "context.compaction.failed",
    "context.epoch.created",
    "context.epoch.activated",
    "context.epoch.superseded"
  ].filter((type) => types.includes(type))
}

export function memoryCompactionPolicy() {
  return {
    reserveInputTokens: 1_500,
    keepRecentTokens: 100,
    minimumRecentTurns: 1,
    maxSummaryOutputTokens: 200,
    maxSerializedToolResultChars: 200,
    minimumTokenSavings: 1,
    maxProviderAttempts: 2
  } as const
}

export async function seedCompletedMemoryTurns(
  session: WanexSessionCore
): Promise<void> {
  await session.create({ id: MEMORY_PROJECTION_SESSION_ID, kind: "agent" })
  await appendMemoryTurn(session, {
    sessionId: MEMORY_PROJECTION_SESSION_ID,
    index: 1,
    userText: "preserve the first semantic source turn",
    assistantText: "first durable semantic context ".repeat(200)
  })
  await appendMemoryTurn(session, {
    sessionId: MEMORY_PROJECTION_SESSION_ID,
    index: 2,
    userText: "preserve the second semantic source turn",
    assistantText: "second durable semantic context ".repeat(200)
  })
  await appendMemoryTurn(session, {
    sessionId: MEMORY_PROJECTION_SESSION_ID,
    index: 3,
    userText: "retain this recent turn exactly",
    assistantText: "recent exact semantic context ".repeat(500)
  })
}

export async function seedReplaySession(session: WanexSessionCore): Promise<void> {
  await session.create({ id: MEMORY_REPLAY_SESSION_ID, kind: "agent" })
  await appendMemoryTurn(session, {
    sessionId: MEMORY_REPLAY_SESSION_ID,
    index: 1,
    userText: "preserve old replay history semantically",
    assistantText: "old replay durable context ".repeat(500)
  })
  await appendMemoryTurn(session, {
    sessionId: MEMORY_REPLAY_SESSION_ID,
    index: 2,
    userText: "keep the latest turn raw",
    assistantText: "latest replay turn stays exact ".repeat(400)
  })
}

export class MemorySemanticProvider implements ProviderAdapter {
  readonly protocol = MEMORY_MODEL_ENDPOINT.protocol
  readonly providerId = MEMORY_MODEL_ENDPOINT.connection.providerId
  readonly model = MEMORY_MODEL_ENDPOINT.model
  readonly summaryRequests: ProviderRequest[] = []
  lastMessages: readonly ProviderReplayMessage[] = []

  async *stream(request: ProviderRequest): AsyncIterable<ProviderEvent> {
    const isSummary = request.messages[0]?.content.some(
      (part) => part.type === "text" && part.text.includes("semantic checkpoint")
    ) === true
    if (isSummary) {
      this.summaryRequests.push(request)
      yield {
        type: "text_delta",
        partId: "eval_memory_summary",
        delta: "## Goal\nPreserve durable eval context\n## Progress\nOlder turns summarized"
      }
      yield { type: "finish", reason: "stop" }
      return
    }
    this.lastMessages = request.messages
    yield {
      type: "text_delta",
      partId: "assistant_eval_memory_replay_new",
      delta: "semantic replay ok"
    }
    yield { type: "finish", reason: "stop" }
  }

  buildReplayMessages(
    messages: readonly PreparedProviderReplayMessage[]
  ): JsonValue[] {
    return messages.map((message) => ({
      role: message.role,
      content: message.content as unknown as JsonValue
    }))
  }
}

async function appendMemoryTurn(
  session: WanexSessionCore,
  request: {
    readonly sessionId: string
    readonly index: number
    readonly userText: string
    readonly assistantText: string
  }
): Promise<void> {
  const suffix = `${request.sessionId}_${request.index}`
  const turn = await startEvalTurn({
    session,
    sessionId: request.sessionId,
    principalId: "principal_eval_memory",
    inputId: `inp_${suffix}`,
    turnId: `turn_${suffix}`,
    jobId: `job_${suffix}`,
    workerId: `worker_${suffix}`,
    idempotencyKey: `idem_${suffix}`,
    modelEndpoint: MEMORY_MODEL_ENDPOINT,
    content: [{ type: "text", id: `user_${suffix}`, text: request.userText }]
  })
  await settleEvalTurn(session, turn, [
    { type: "text", id: `assistant_${suffix}`, text: request.assistantText }
  ])
}
