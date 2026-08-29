import type { ResourceKind } from "@wanex/protocol"

export type TeamAvailabilityState = "ready" | "unavailable"

export interface TeamAvailability {
  readonly kind: "assistant.team-availability"
  readonly state: TeamAvailabilityState
  readonly reason: "configured" | "not_configured"
  readonly capabilities: TeamCapabilities
}

export interface TeamCapabilities {
  readonly canList: boolean
  readonly canCreateDiscussion: boolean
  readonly canCreateCoordinated: boolean
  readonly canManageParticipants: boolean
  readonly canAssignCoordinator: boolean
  readonly canSubmitRound: boolean
}

export type TeamConversationState = "open" | "paused" | "closed" | "cancelled"
export type TeamConversationMode = "discussion" | "coordinated"

export interface TeamConversationSummary {
  readonly conversationId: string
  readonly title: string
  readonly mode: TeamConversationMode
  readonly state: TeamConversationState
  readonly coordinatorParticipantId?: string
  readonly participantCount: number
  readonly activeAgentCount: number
  readonly activeRound: boolean
  readonly createdAt: number
  readonly updatedAt: number
}

export interface TeamConversationListReadModel {
  readonly kind: "assistant.team-conversation-list"
  readonly availability: TeamAvailability
  readonly conversations: readonly TeamConversationSummary[]
}

export type TeamParticipantKind = "user" | "agent" | "tool" | "system"
export type TeamParticipantState = "active" | "muted" | "left"

export interface TeamParticipantReadModel {
  readonly participantId: string
  readonly kind: TeamParticipantKind
  readonly state: TeamParticipantState
  readonly displayName: string
  readonly role?: string
  readonly createdAt: number
  readonly updatedAt: number
}

export type TeamMessageStatus =
  | "queued"
  | "sent"
  | "failed"
  | "superseded"

export type TeamMessageContentPart =
  | TeamTextContentPart
  | TeamResourceContentPart

export interface TeamTextContentPart {
  readonly type: "text"
  readonly partId: string
  readonly text: string
}

export interface TeamResourceContentPart {
  readonly type: "resource"
  readonly partId: string
  readonly resourceId: string
  readonly sha256: string
  readonly sizeBytes: number
  readonly kind: ResourceKind
  readonly mediaType?: string
}

export interface TeamMessageReadModel {
  readonly messageId: string
  readonly authorParticipantId: string
  readonly parentMessageId?: string
  readonly roundId?: string
  readonly kind: "message" | "decision" | "handoff" | "system"
  readonly status: TeamMessageStatus
  readonly content: readonly TeamMessageContentPart[]
  readonly revision: number
  readonly createdAt: number
  readonly updatedAt: number
}

export type TeamDeliveryStatus =
  | "waiting"
  | "responding"
  | "replied"
  | "passed"
  | "failed"
  | "cancelled"

export interface TeamDeliveryReadModel {
  readonly deliveryId: string
  readonly sourceMessageId: string
  readonly roundId: string
  readonly participantId: string
  readonly status: TeamDeliveryStatus
  readonly replyMessageId?: string
  readonly createdAt: number
  readonly updatedAt: number
  readonly finishedAt?: number
}

export type TeamRoundStatus =
  | "running"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled"

export interface TeamRoundReadModel {
  readonly roundId: string
  readonly sourceMessageId: string
  readonly status: TeamRoundStatus
  readonly expected: number
  readonly replied: number
  readonly passed: number
  readonly failed: number
  readonly cancelled: number
  readonly createdAt: number
  readonly updatedAt: number
  readonly finishedAt?: number
}

export interface TeamConversationPageReadModel {
  readonly kind: "assistant.team-conversation-page"
  readonly conversation: TeamConversationSummary
  readonly participants: readonly TeamParticipantReadModel[]
  readonly messages: readonly TeamMessageReadModel[]
  readonly rounds: readonly TeamRoundReadModel[]
  readonly deliveries: readonly TeamDeliveryReadModel[]
  readonly observedAt: number
  readonly nextCursor?: string
}

export type ReadTeamConversationResult =
  | {
      readonly kind: "assistant.team-conversation.found"
      readonly page: TeamConversationPageReadModel
    }
  | {
      readonly kind: "assistant.team-conversation.missing"
      readonly conversationId: string
    }
  | {
      readonly kind: "assistant.team-conversation.no-selection"
    }
  | {
      readonly kind: "assistant.team-conversation.unavailable"
      readonly availability: TeamAvailability
    }

export interface TeamRoundReceipt {
  readonly kind: "assistant.team-round.submitted"
  readonly conversation: TeamConversationSummary
  readonly message: TeamMessageReadModel
  readonly round: TeamRoundReadModel
  readonly deliveries: readonly TeamDeliveryReadModel[]
}

export type TeamInvalidationCause =
  | "conversation_changed"
  | "participants_changed"
  | "message_changed"
  | "round_changed"
  | "delivery_changed"

export interface TeamPortInvalidation {
  readonly conversationId?: string
  readonly cause: TeamInvalidationCause
  readonly at: number
}

export interface TeamInvalidatedEvent extends TeamPortInvalidation {
  readonly kind: "assistant.team.invalidated"
  readonly sequence: number
}

export type TeamEventListener = (event: TeamInvalidatedEvent) => void
export type TeamEventUnsubscribe = () => void

export interface TeamEvents {
  subscribeTeamEvents(listener: TeamEventListener): TeamEventUnsubscribe
}
