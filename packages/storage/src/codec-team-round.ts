import type {
  JsonValue,
  ListTeamDiscussionRoundsRequest,
  TeamDiscussionRoundRecord,
  TeamDiscussionRoundResult
} from "@wanex/protocol"
import {
  expectNumber,
  expectString,
  isRecord,
  optionalNumber,
  withOptionalFields
} from "./codec-helpers.js"
import {
  expectTeamConversationMode,
  expectTeamDiscussionRoundOutcome,
  expectTeamDiscussionRoundState
} from "./codec-team-enums.js"
import type { ListTeamDiscussionRoundsWire } from "./generated/storage-rpc.js"

export function toRpcListTeamDiscussionRoundsRequest(
  request: ListTeamDiscussionRoundsRequest
): ListTeamDiscussionRoundsWire {
  return {
    conversation_id: request.conversationId,
    state: request.state ?? null,
    after_created_at: request.afterCreatedAt ?? null,
    after_round_id: request.afterRoundId ?? null,
    limit: request.limit ?? null
  }
}

export function fromRpcTeamDiscussionRoundRecord(
  value: JsonValue
): TeamDiscussionRoundRecord {
  if (!isRecord(value)) throw new Error("team discussion round must be an object")
  const state = expectTeamDiscussionRoundState(value.state)
  const expectedDeliveryCount = expectNonNegativeInteger(
    value.expected_delivery_count,
    "team_discussion_round.expected_delivery_count"
  )
  const result = value.result === null || value.result === undefined
    ? undefined
    : fromRpcTeamDiscussionRoundResult(value.result)
  const outcome = value.outcome === null || value.outcome === undefined
    ? undefined
    : expectTeamDiscussionRoundOutcome(value.outcome)
  const closedAt = optionalNumber(value.closed_at, "team_discussion_round.closed_at")
  if (
    (state === "open" && (result !== undefined || outcome !== undefined || closedAt !== undefined)) ||
    (state === "closed" && (result === undefined || outcome === undefined || closedAt === undefined))
  ) {
    throw new Error("team discussion round terminal fields do not match state")
  }
  if (result !== undefined && result.expected !== expectedDeliveryCount) {
    throw new Error("team discussion round result does not match expected delivery count")
  }
  return withOptionalFields(
    {
      id: expectString(value.id, "team_discussion_round.id"),
      conversationId: expectString(
        value.conversation_id,
        "team_discussion_round.conversation_id"
      ),
      sourceMessageId: expectString(
        value.source_message_id,
        "team_discussion_round.source_message_id"
      ),
      routingDecisionId: expectString(
        value.routing_decision_id,
        "team_discussion_round.routing_decision_id"
      ),
      mode: expectTeamConversationMode(value.mode),
      state,
      expectedDeliveryCount,
      idempotencyKey: expectString(
        value.idempotency_key,
        "team_discussion_round.idempotency_key"
      ),
      createdAt: expectNumber(value.created_at, "team_discussion_round.created_at"),
      updatedAt: expectNumber(value.updated_at, "team_discussion_round.updated_at")
    },
    { outcome, result, closedAt }
  )
}

function fromRpcTeamDiscussionRoundResult(value: JsonValue): TeamDiscussionRoundResult {
  if (!isRecord(value)) throw new Error("team discussion round result must be an object")
  const result = {
    expected: expectNonNegativeInteger(value.expected, "team_discussion_round.result.expected"),
    responded: expectNonNegativeInteger(
      value.responded,
      "team_discussion_round.result.responded"
    ),
    passed: expectNonNegativeInteger(value.passed, "team_discussion_round.result.passed"),
    failed: expectNonNegativeInteger(value.failed, "team_discussion_round.result.failed"),
    cancelled: expectNonNegativeInteger(
      value.cancelled,
      "team_discussion_round.result.cancelled"
    )
  }
  if (
    result.responded + result.passed + result.failed + result.cancelled !== result.expected
  ) {
    throw new Error("team discussion round result counts do not sum to expected")
  }
  return result
}

function expectNonNegativeInteger(value: unknown, label: string): number {
  const parsed = expectNumber(value, label)
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative safe integer`)
  }
  return parsed
}
