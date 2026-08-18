import type {
  JsonValue,
  ReadTeamConversationPageRequest,
  TeamConversationPage
} from "@wanex/protocol"
import {
  assertArray,
  expectNumber,
  expectString,
  isRecord,
  withOptionalFields
} from "./codec-helpers.js"
import {
  fromRpcTeamConversationRecord,
  fromRpcTeamDeliveryRecord,
  fromRpcTeamMessageRecord,
  fromRpcTeamParticipantRecord,
  fromRpcTeamRoutingDecisionRecord
} from "./codec-team.js"
import { fromRpcTeamDiscussionRoundRecord } from "./codec-team-round.js"
import type { ReadTeamConversationPageWire } from "./generated/storage-rpc.js"

export function toRpcReadTeamConversationPageRequest(
  request: ReadTeamConversationPageRequest
): ReadTeamConversationPageWire {
  return {
    conversation_id: request.conversationId,
    before_created_at: request.beforeCreatedAt ?? null,
    before_message_id: request.beforeMessageId ?? null,
    limit: request.limit ?? null
  }
}

export function fromRpcTeamConversationPage(value: JsonValue): TeamConversationPage {
  if (!isRecord(value)) throw new Error("team conversation page must be an object")
  assertArray(value.participants, "team conversation page participants")
  assertArray(value.messages, "team conversation page messages")
  assertArray(value.routing_decisions, "team conversation page routing decisions")
  assertArray(value.rounds, "team conversation page rounds")
  assertArray(value.deliveries, "team conversation page deliveries")
  const nextCursor = value.next_cursor === null || value.next_cursor === undefined
    ? undefined
    : fromRpcTeamConversationPageCursor(value.next_cursor)
  return withOptionalFields(
    {
      conversation: fromRpcTeamConversationRecord(value.conversation ?? null),
      participants: value.participants.map(fromRpcTeamParticipantRecord),
      messages: value.messages.map(fromRpcTeamMessageRecord),
      routingDecisions: value.routing_decisions.map(fromRpcTeamRoutingDecisionRecord),
      rounds: value.rounds.map(fromRpcTeamDiscussionRoundRecord),
      deliveries: value.deliveries.map(fromRpcTeamDeliveryRecord),
      observedAt: expectNumber(value.observed_at, "team_conversation_page.observed_at")
    },
    { nextCursor }
  )
}

function fromRpcTeamConversationPageCursor(value: JsonValue) {
  if (!isRecord(value)) throw new Error("team conversation page cursor must be an object")
  return {
    createdAt: expectNumber(value.created_at, "team_conversation_page.cursor.created_at"),
    messageId: expectString(value.message_id, "team_conversation_page.cursor.message_id")
  }
}
