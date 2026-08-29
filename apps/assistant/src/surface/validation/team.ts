import type {
  ReadTeamConversationResult,
  TeamConversationListReadModel,
  TeamConversationPageReadModel,
  TeamConversationSummary,
  TeamInvalidatedEvent,
  TeamParticipantReadModel,
  TeamRoundReceipt
} from "../../team/model.js"
import { isNonNegativeSafeInteger, isRecord } from "./common.js"

export function isTeamConversationListReadModel(
  value: unknown
): value is TeamConversationListReadModel {
  return (
    exactRecord(value, ["kind", "availability", "conversations"]) &&
    value.kind === "assistant.team-conversation-list" &&
    isTeamAvailability(value.availability) &&
    Array.isArray(value.conversations) &&
    value.conversations.every(isTeamConversationSummary)
  )
}

export function isReadTeamConversationResult(
  value: unknown
): value is ReadTeamConversationResult {
  if (!isRecord(value)) return false
  if (value.kind === "assistant.team-conversation.found") {
    return exactRecord(value, ["kind", "page"]) && isTeamConversationPage(value.page)
  }
  if (value.kind === "assistant.team-conversation.missing") {
    return exactRecord(value, ["kind", "conversationId"]) &&
      nonEmptyString(value.conversationId)
  }
  if (value.kind === "assistant.team-conversation.no-selection") {
    return exactRecord(value, ["kind"])
  }
  if (value.kind === "assistant.team-conversation.unavailable") {
    return exactRecord(value, ["kind", "availability"]) &&
      isTeamAvailability(value.availability)
  }
  return false
}

export function isTeamConversationSummary(
  value: unknown
): value is TeamConversationSummary {
  return (
    exactRecord(value, [
      "conversationId",
      "title",
      "mode",
      "state",
      "coordinatorParticipantId",
      "participantCount",
      "activeAgentCount",
      "activeRound",
      "createdAt",
      "updatedAt"
    ]) &&
    nonEmptyString(value.conversationId) &&
    typeof value.title === "string" &&
    (value.mode === "discussion" || value.mode === "coordinated") &&
    optionalString(value.coordinatorParticipantId) &&
    (value.mode === "coordinated" || value.coordinatorParticipantId === undefined) &&
    ["open", "paused", "closed", "cancelled"].includes(String(value.state)) &&
    isNonNegativeSafeInteger(value.participantCount) &&
    isNonNegativeSafeInteger(value.activeAgentCount) &&
    typeof value.activeRound === "boolean" &&
    timestamp(value.createdAt) &&
    timestamp(value.updatedAt)
  )
}

export function isTeamParticipantReadModel(
  value: unknown
): value is TeamParticipantReadModel {
  return (
    exactRecord(value, [
      "participantId",
      "kind",
      "state",
      "displayName",
      "role",
      "createdAt",
      "updatedAt"
    ]) &&
    nonEmptyString(value.participantId) &&
    ["user", "agent", "tool", "system"].includes(String(value.kind)) &&
    ["active", "muted", "left"].includes(String(value.state)) &&
    typeof value.displayName === "string" &&
    optionalString(value.role) &&
    timestamp(value.createdAt) &&
    timestamp(value.updatedAt)
  )
}

export function isTeamRoundReceipt(
  value: unknown
): value is TeamRoundReceipt {
  return (
    exactRecord(value, ["kind", "conversation", "message", "round", "deliveries"]) &&
    value.kind === "assistant.team-round.submitted" &&
    isTeamConversationSummary(value.conversation) &&
    isTeamMessage(value.message) &&
    isTeamRound(value.round) &&
    Array.isArray(value.deliveries) &&
    value.deliveries.every(isTeamDelivery)
  )
}

export function isTeamInvalidatedEvent(
  value: unknown
): value is TeamInvalidatedEvent {
  return (
    exactRecord(value, ["kind", "sequence", "conversationId", "cause", "at"]) &&
    value.kind === "assistant.team.invalidated" &&
    Number.isSafeInteger(value.sequence) &&
    (value.sequence as number) > 0 &&
    optionalString(value.conversationId) &&
    [
      "conversation_changed",
      "participants_changed",
      "message_changed",
      "round_changed",
      "delivery_changed"
    ].includes(String(value.cause)) &&
    timestamp(value.at)
  )
}

function isTeamConversationPage(
  value: unknown
): value is TeamConversationPageReadModel {
  return (
    exactRecord(value, [
      "kind",
      "conversation",
      "participants",
      "messages",
      "rounds",
      "deliveries",
      "observedAt",
      "nextCursor"
    ]) &&
    value.kind === "assistant.team-conversation-page" &&
    isTeamConversationSummary(value.conversation) &&
    Array.isArray(value.participants) &&
    value.participants.every(isTeamParticipantReadModel) &&
    Array.isArray(value.messages) &&
    value.messages.every(isTeamMessage) &&
    Array.isArray(value.rounds) &&
    value.rounds.every(isTeamRound) &&
    Array.isArray(value.deliveries) &&
    value.deliveries.every(isTeamDelivery) &&
    timestamp(value.observedAt) &&
    optionalString(value.nextCursor)
  )
}

function isTeamAvailability(value: unknown): boolean {
  return (
    exactRecord(value, ["kind", "state", "reason", "capabilities"]) &&
    value.kind === "assistant.team-availability" &&
    (value.state === "ready" || value.state === "unavailable") &&
    (value.reason === "configured" || value.reason === "not_configured") &&
    exactRecord(value.capabilities, [
      "canList",
      "canCreateDiscussion",
      "canCreateCoordinated",
      "canManageParticipants",
      "canAssignCoordinator",
      "canSubmitRound"
    ]) &&
    typeof value.capabilities.canList === "boolean" &&
    typeof value.capabilities.canCreateDiscussion === "boolean" &&
    typeof value.capabilities.canCreateCoordinated === "boolean" &&
    typeof value.capabilities.canManageParticipants === "boolean" &&
    typeof value.capabilities.canAssignCoordinator === "boolean" &&
    typeof value.capabilities.canSubmitRound === "boolean"
  )
}

function isTeamMessage(value: unknown): boolean {
  return (
    exactRecord(value, [
      "messageId",
      "authorParticipantId",
      "parentMessageId",
      "roundId",
      "kind",
      "status",
      "content",
      "revision",
      "createdAt",
      "updatedAt"
    ]) &&
    nonEmptyString(value.messageId) &&
    nonEmptyString(value.authorParticipantId) &&
    optionalString(value.parentMessageId) &&
    optionalString(value.roundId) &&
    ["message", "decision", "handoff", "system"].includes(String(value.kind)) &&
    ["queued", "sent", "failed", "superseded"].includes(String(value.status)) &&
    Array.isArray(value.content) &&
    value.content.every(isTeamContentPart) &&
    Number.isSafeInteger(value.revision) &&
    (value.revision as number) > 0 &&
    timestamp(value.createdAt) &&
    timestamp(value.updatedAt)
  )
}

function isTeamContentPart(value: unknown): boolean {
  if (!isRecord(value)) return false
  if (value.type === "text") {
    return exactRecord(value, ["type", "partId", "text"]) &&
      nonEmptyString(value.partId) && typeof value.text === "string"
  }
  if (value.type === "resource") {
    return (
      exactRecord(value, [
        "type",
        "partId",
        "resourceId",
        "sha256",
        "sizeBytes",
        "kind",
        "mediaType"
      ]) &&
      nonEmptyString(value.partId) &&
      nonEmptyString(value.resourceId) &&
      typeof value.sha256 === "string" &&
      isNonNegativeSafeInteger(value.sizeBytes) &&
      [
        "file",
        "image",
        "video",
        "audio",
        "document",
        "artifact",
        "log",
        "patch",
        "url"
      ].includes(String(value.kind)) &&
      optionalString(value.mediaType)
    )
  }
  return false
}

function isTeamRound(value: unknown): boolean {
  return (
    exactRecord(value, [
      "roundId",
      "sourceMessageId",
      "status",
      "expected",
      "replied",
      "passed",
      "failed",
      "cancelled",
      "createdAt",
      "updatedAt",
      "finishedAt"
    ]) &&
    nonEmptyString(value.roundId) &&
    nonEmptyString(value.sourceMessageId) &&
    ["running", "completed", "partial", "failed", "cancelled"].includes(
      String(value.status)
    ) &&
    [
      value.expected,
      value.replied,
      value.passed,
      value.failed,
      value.cancelled
    ].every(isNonNegativeSafeInteger) &&
    timestamp(value.createdAt) &&
    timestamp(value.updatedAt) &&
    optionalTimestamp(value.finishedAt)
  )
}

function isTeamDelivery(value: unknown): boolean {
  return (
    exactRecord(value, [
      "deliveryId",
      "sourceMessageId",
      "roundId",
      "participantId",
      "status",
      "replyMessageId",
      "createdAt",
      "updatedAt",
      "finishedAt"
    ]) &&
    nonEmptyString(value.deliveryId) &&
    nonEmptyString(value.sourceMessageId) &&
    nonEmptyString(value.roundId) &&
    nonEmptyString(value.participantId) &&
    ["waiting", "responding", "replied", "passed", "failed", "cancelled"].includes(
      String(value.status)
    ) &&
    optionalString(value.replyMessageId) &&
    timestamp(value.createdAt) &&
    timestamp(value.updatedAt) &&
    optionalTimestamp(value.finishedAt)
  )
}

function exactRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return isRecord(value) && Object.keys(value).every((key) => keys.includes(key))
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

function optionalString(value: unknown): boolean {
  return value === undefined || nonEmptyString(value)
}

function timestamp(value: unknown): boolean {
  return isNonNegativeSafeInteger(value)
}

function optionalTimestamp(value: unknown): boolean {
  return value === undefined || timestamp(value)
}
