import type {
  MessagePart,
  TeamConversationPage,
  TeamConversationRecord,
  TeamDeliveryRecord,
  TeamDiscussionRoundRecord,
  TeamMessageRecord,
  TeamParticipantRecord
} from "@wanex/protocol"
import type {
  TeamConversationPageReadModel,
  TeamConversationSummary,
  TeamDeliveryReadModel,
  TeamDeliveryStatus,
  TeamMessageContentPart,
  TeamMessageReadModel,
  TeamMessageStatus,
  TeamParticipantReadModel,
  TeamRoundReadModel,
  TeamRoundStatus
} from "./model.js"

export interface TeamConversationSummarySource {
  readonly conversation: TeamConversationRecord
  readonly participants: readonly TeamParticipantRecord[]
  readonly rounds: readonly TeamDiscussionRoundRecord[]
}

export function projectTeamConversationSummary(
  source: TeamConversationSummarySource
): TeamConversationSummary {
  if (
    source.conversation.mode !== "peer" &&
    source.conversation.mode !== "orchestrated"
  ) {
    throw new Error(
      `unsupported Product Team conversation mode: ${source.conversation.mode}`
    )
  }
  if (
    source.conversation.mode === "peer" &&
    source.conversation.leadParticipantId !== undefined
  ) {
    throw new Error("discussion Team conversation cannot have a coordinator")
  }
  if (
    source.conversation.leadParticipantId !== undefined &&
    !source.participants.some((participant) =>
      participant.id === source.conversation.leadParticipantId &&
      participant.kind === "agent" &&
      participant.state === "active"
    )
  ) {
    throw new Error("coordinated Team coordinator must be an active agent")
  }
  return {
    conversationId: source.conversation.id,
    title: source.conversation.title ?? "Untitled group",
    mode: source.conversation.mode === "peer" ? "discussion" : "coordinated",
    state: source.conversation.state,
    ...(source.conversation.leadParticipantId === undefined
      ? {}
      : { coordinatorParticipantId: source.conversation.leadParticipantId }),
    participantCount: source.participants.filter(
      (participant) => participant.state !== "left"
    ).length,
    activeAgentCount: source.participants.filter(
      (participant) =>
        participant.kind === "agent" && participant.state === "active"
    ).length,
    activeRound: source.rounds.some((round) => round.state === "open"),
    createdAt: source.conversation.createdAt,
    updatedAt: source.conversation.updatedAt
  }
}

export function projectTeamConversationPage(
  page: TeamConversationPage,
  nextCursor?: string
): TeamConversationPageReadModel {
  return {
    kind: "product.team-conversation-page",
    conversation: projectTeamConversationSummary({
      conversation: page.conversation,
      participants: page.participants,
      rounds: page.rounds
    }),
    participants: page.participants.map(projectParticipant),
    messages: page.messages.map(projectMessage),
    rounds: page.rounds.map(projectRound),
    deliveries: page.deliveries.map(projectDelivery),
    observedAt: page.observedAt,
    ...(nextCursor === undefined ? {} : { nextCursor })
  }
}

export function projectParticipant(
  participant: TeamParticipantRecord
): TeamParticipantReadModel {
  return {
    participantId: participant.id,
    kind: participant.kind,
    state: participant.state,
    displayName: participant.displayName ?? defaultParticipantName(participant),
    ...(participant.role === undefined ? {} : { role: participant.role }),
    createdAt: participant.createdAt,
    updatedAt: participant.updatedAt
  }
}

export function projectMessage(
  message: TeamMessageRecord
): TeamMessageReadModel {
  return {
    messageId: message.id,
    authorParticipantId: message.authorParticipantId,
    ...(message.parentMessageId === undefined
      ? {}
      : { parentMessageId: message.parentMessageId }),
    ...(message.discussionRoundId === undefined
      ? {}
      : { roundId: message.discussionRoundId }),
    kind: message.kind,
    status: projectMessageStatus(message.state),
    content: message.content.map(projectContentPart),
    revision: message.revision,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt
  }
}

export function projectRound(
  round: TeamDiscussionRoundRecord
): TeamRoundReadModel {
  const result = round.result
  return {
    roundId: round.id,
    sourceMessageId: round.sourceMessageId,
    status: projectRoundStatus(round),
    expected: result?.expected ?? round.expectedDeliveryCount,
    replied: result?.responded ?? 0,
    passed: result?.passed ?? 0,
    failed: result?.failed ?? 0,
    cancelled: result?.cancelled ?? 0,
    createdAt: round.createdAt,
    updatedAt: round.updatedAt,
    ...(round.closedAt === undefined ? {} : { finishedAt: round.closedAt })
  }
}

export function projectDelivery(
  delivery: TeamDeliveryRecord
): TeamDeliveryReadModel {
  return {
    deliveryId: delivery.id,
    sourceMessageId: delivery.messageId,
    roundId: delivery.discussionRoundId,
    participantId: delivery.targetParticipantId,
    status: projectDeliveryStatus(delivery.state),
    ...(delivery.replyMessageId === undefined
      ? {}
      : { replyMessageId: delivery.replyMessageId }),
    createdAt: delivery.createdAt,
    updatedAt: delivery.updatedAt,
    ...(delivery.finishedAt === undefined
      ? {}
      : { finishedAt: delivery.finishedAt })
  }
}

function projectContentPart(part: MessagePart): TeamMessageContentPart {
  if (part.type === "text") {
    return { type: "text", partId: part.id, text: part.text }
  }
  if (part.type === "resource") {
    return {
      type: "resource",
      partId: part.id,
      resourceId: part.resourceId,
      sha256: part.sha256,
      sizeBytes: part.sizeBytes,
      kind: part.kind,
      ...(part.mediaType === undefined ? {} : { mediaType: part.mediaType })
    }
  }
  throw new Error(`unsupported public Team message part: ${part.type}`)
}

function projectMessageStatus(
  state: TeamMessageRecord["state"]
): TeamMessageStatus {
  if (state === "admitted") return "queued"
  if (state === "routed" || state === "visible") return "sent"
  if (state === "blocked") return "failed"
  return "superseded"
}

function projectDeliveryStatus(
  state: TeamDeliveryRecord["state"]
): TeamDeliveryStatus {
  if (state === "queued") return "waiting"
  if (state === "dispatched") return "responding"
  if (state === "responded") return "replied"
  return state
}

function projectRoundStatus(
  round: TeamDiscussionRoundRecord
): TeamRoundStatus {
  if (round.state === "open") return "running"
  return round.outcome ?? "failed"
}

function defaultParticipantName(participant: TeamParticipantRecord): string {
  if (participant.kind === "user") return "You"
  if (participant.kind === "agent") return "Agent"
  if (participant.kind === "tool") return "Tool"
  return "System"
}
