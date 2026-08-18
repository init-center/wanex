import type {
  AdmitTeamMessageRequest,
  FailTeamDeliveryMaterializationReceipt,
  FailTeamDeliveryMaterializationRequest,
  JsonValue,
  ListTeamDeliveriesRequest,
  ListTeamDiscussionRoundsRequest,
  ListTeamMessagesRequest,
  ListTeamRoutingDecisionsRequest,
  MaterializeTeamDeliveryReceipt,
  MaterializeTeamDeliveryRequest,
  MessagePart,
  RouteTeamDeliveryRequest,
  ProjectTeamDeliveryOutcomeReceipt,
  ProjectTeamDeliveryOutcomeRequest,
  ReadTeamConversationPageRequest,
  PrincipalId,
  SessionId,
  RouteTeamMessageReceipt,
  RouteTeamMessageRequest,
  SetTeamConversationLeadRequest,
  TeamConversationMode,
  TeamConversationPage,
  TeamConversationRecord,
  TeamConversationState,
  TeamDeliveryRecord,
  TeamDeliveryChildTurnPlan,
  TeamDeliveryMaterializationContext,
  TeamDiscussionRoundOutcome,
  TeamDiscussionRoundRecord,
  TeamDiscussionRoundResult,
  TeamDiscussionRoundState,
  TeamMessageRecord,
  TeamMessageKind,
  TeamParticipantKind,
  TeamParticipantRecord,
  TeamParticipantState,
  TeamRoutingDecisionRecord,
  TeamRoutingOutcome,
  TeamTarget
} from "@wanex/protocol"
import type { TeamConversationRuntimeStorage } from "./storage.js"

export interface TeamConversationRuntimeOptions {
  readonly storage: TeamConversationRuntimeStorage
  readonly principalId?: PrincipalId
  /**
   * Best-effort notification after a durable route creates dispatch work.
   * Scheduler recovery remains authoritative when the notification is absent.
   */
  readonly notifyWorkAvailable?: () => void
}

export interface CreateTeamConversationRequest {
  readonly id?: string
  readonly principalId?: PrincipalId
  readonly title?: string
  readonly mode?: TeamConversationMode
  readonly metadata?: JsonValue
  readonly idempotencyKey?: string
}

export interface ListTeamConversationsRequest {
  readonly principalId?: PrincipalId
  readonly state?: TeamConversationState
  readonly mode?: TeamConversationMode
  readonly limit?: number
}

export interface AddTeamParticipantRequest {
  readonly id?: string
  readonly conversationId: string
  readonly principalId: PrincipalId
  readonly kind: TeamParticipantKind
  readonly displayName?: string
  readonly role?: string
  readonly agentSessionId?: SessionId
  readonly metadata?: JsonValue
  readonly idempotencyKey?: string
}

export interface SubmitRoutedTeamMessageRequest {
  readonly idempotencyKey: string
  readonly message: TeamMessageAdmissionInput
  readonly route: TeamMessageRouteInput
}

export interface SubmitOrchestratedTeamMessageRequest {
  readonly idempotencyKey: string
  readonly message: TeamMessageAdmissionInput
}

export interface TeamMessageAdmissionInput {
  readonly id?: string
  readonly conversationId: string
  readonly authorParticipantId: string
  readonly parentMessageId?: string
  readonly kind?: TeamMessageKind
  readonly targets: readonly TeamTarget[]
  readonly content: readonly MessagePart[]
  readonly metadata?: JsonValue
}

export interface TeamMessageRouteInput {
  readonly expectedLeadParticipantId?: string
  readonly mode: TeamConversationMode
  readonly outcome: TeamRoutingOutcome
  readonly actorPrincipalId: PrincipalId
  readonly reason: string
  readonly metadata?: JsonValue
  readonly deliveries: readonly RouteTeamDeliveryRequest[]
}

export type {
  AdmitTeamMessageRequest,
  FailTeamDeliveryMaterializationReceipt,
  FailTeamDeliveryMaterializationRequest,
  ListTeamDeliveriesRequest,
  ListTeamDiscussionRoundsRequest,
  ListTeamMessagesRequest,
  ListTeamRoutingDecisionsRequest,
  MaterializeTeamDeliveryReceipt,
  MaterializeTeamDeliveryRequest,
  ProjectTeamDeliveryOutcomeReceipt,
  ProjectTeamDeliveryOutcomeRequest,
  ReadTeamConversationPageRequest,
  RouteTeamMessageReceipt,
  RouteTeamMessageRequest,
  SetTeamConversationLeadRequest,
  TeamConversationMode,
  TeamConversationPage,
  TeamConversationRecord,
  TeamConversationState,
  TeamDeliveryRecord,
  TeamDeliveryChildTurnPlan,
  TeamDeliveryMaterializationContext,
  TeamDiscussionRoundOutcome,
  TeamDiscussionRoundRecord,
  TeamDiscussionRoundResult,
  TeamDiscussionRoundState,
  TeamMessageRecord,
  TeamParticipantKind,
  TeamParticipantRecord,
  TeamParticipantState,
  TeamRoutingDecisionRecord
}
