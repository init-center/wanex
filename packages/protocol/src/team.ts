import type { JsonValue } from "./json.js"
import type {
  PrincipalId,
  SessionId,
  SessionInputId,
  SessionTurnId
} from "./ids.js"
import type { MessagePart } from "./message.js"
import type { SessionInputOrigin } from "./run-control.js"
import type { SchedulerJobRecord } from "./scheduler.js"
import type {
  SessionMessageRecord,
  SessionTurnRecord,
  SessionTurnExecutionBinding,
  SubmitSessionTurnReceipt
} from "./session.js"

export type TeamConversationMode = "orchestrated" | "peer" | "hybrid"
export type TeamConversationState = "open" | "paused" | "closed" | "cancelled"
export type TeamParticipantKind = "user" | "agent" | "tool" | "system"
export type TeamParticipantState = "active" | "muted" | "left"
export type TeamMessageKind = "message" | "decision" | "handoff" | "system"
export type TeamMessageState =
  | "admitted"
  | "routed"
  | "visible"
  | "blocked"
  | "superseded"
export type TeamTarget =
  | { readonly kind: "participant"; readonly participantId: string }
  | { readonly kind: "lead" }
  | { readonly kind: "all" }
export type TeamRoutingOutcome = "deliver" | "blocked"
export type TeamDeliveryRole = "speaker" | "observer" | "summarizer"
export type TeamDeliveryTrigger =
  | "direct"
  | "mention"
  | "lead"
  | "round"
  | "delegation"
export type TeamDeliveryState =
  | "queued"
  | "dispatched"
  | "responded"
  | "passed"
  | "failed"
  | "cancelled"
export type TeamDiscussionRoundState = "open" | "closed"
export type TeamDiscussionRoundOutcome =
  | "completed"
  | "partial"
  | "failed"
  | "cancelled"

export type TeamDelegationOperationState =
  | "running"
  | "cancel_requested"
  | "succeeded"
  | "failed"
  | "cancelled"

export interface TeamDiscussionRoundResult {
  readonly expected: number
  readonly responded: number
  readonly passed: number
  readonly failed: number
  readonly cancelled: number
}

export interface TeamDiscussionRoundRecord {
  readonly id: string
  readonly conversationId: string
  readonly sourceMessageId: string
  readonly routingDecisionId: string
  readonly mode: TeamConversationMode
  readonly state: TeamDiscussionRoundState
  readonly expectedDeliveryCount: number
  readonly outcome?: TeamDiscussionRoundOutcome
  readonly result?: TeamDiscussionRoundResult
  readonly idempotencyKey: string
  readonly createdAt: number
  readonly updatedAt: number
  readonly closedAt?: number
}

export interface TeamConversationRecord {
  readonly id: string
  readonly principalId: PrincipalId
  readonly title?: string
  readonly mode: TeamConversationMode
  readonly state: TeamConversationState
  readonly leadParticipantId?: string
  readonly metadata?: JsonValue
  readonly createdAt: number
  readonly updatedAt: number
  readonly closedAt?: number
}

export interface TeamParticipantRecord {
  readonly id: string
  readonly conversationId: string
  readonly principalId: PrincipalId
  readonly kind: TeamParticipantKind
  readonly displayName?: string
  readonly role?: string
  readonly agentSessionId?: SessionId
  readonly state: TeamParticipantState
  readonly metadata?: JsonValue
  readonly createdAt: number
  readonly updatedAt: number
}

export interface TeamMessageRecord {
  readonly id: string
  readonly conversationId: string
  readonly authorParticipantId: string
  readonly parentMessageId?: string
  readonly discussionRoundId?: string
  readonly kind: TeamMessageKind
  readonly state: TeamMessageState
  readonly targets: readonly TeamTarget[]
  readonly content: readonly MessagePart[]
  readonly metadata?: JsonValue
  readonly idempotencyKey: string
  readonly revision: number
  readonly createdAt: number
  readonly updatedAt: number
  readonly visibleAt?: number
}

export interface TeamRoutingDecisionRecord {
  readonly id: string
  readonly conversationId: string
  readonly messageId: string
  readonly mode: TeamConversationMode
  readonly outcome: TeamRoutingOutcome
  readonly leadParticipantId?: string
  readonly actorPrincipalId: PrincipalId
  readonly reason: string
  readonly metadata?: JsonValue
  readonly idempotencyKey: string
  readonly createdAt: number
}

export interface TeamDeliveryRecord {
  readonly id: string
  readonly conversationId: string
  readonly messageId: string
  readonly routingDecisionId: string
  readonly discussionRoundId: string
  readonly targetParticipantId: string
  readonly role: TeamDeliveryRole
  readonly trigger: TeamDeliveryTrigger
  readonly state: TeamDeliveryState
  readonly targetSessionId: SessionId
  readonly dispatchJobId: string
  readonly childInputId?: SessionInputId
  readonly childTurnId?: SessionTurnId
  readonly childTurnJobId?: string
  readonly outcomeJobId?: string
  readonly replyMessageId?: string
  readonly participationToolExecutionId?: string
  readonly budgetGrantId?: string
  readonly lastError?: JsonValue
  readonly idempotencyKey: string
  readonly createdAt: number
  readonly updatedAt: number
  readonly materializedAt?: number
  readonly finishedAt?: number
}

export interface TeamDelegationOperationRecord {
  readonly id: string
  readonly conversationId: string
  readonly sourceDeliveryId: string
  readonly sourceRoutingDecisionId: string
  readonly sourceDiscussionRoundId: string
  readonly leadParticipantId: string
  readonly parentSessionId: SessionId
  readonly parentInputId: SessionInputId
  readonly parentTurnId: SessionTurnId
  readonly parentSessionAttemptId: string
  readonly parentSessionJobId: string
  readonly parentToolExecutionId: string
  readonly parentToolInvocationAttemptId: string
  readonly parentToolCallId: string
  readonly delegationGraphId: string
  readonly state: TeamDelegationOperationState
  readonly idempotencyKey: string
  readonly createdAt: number
  readonly updatedAt: number
  readonly finishedAt?: number
}

export interface TeamDelegationTaskRecord {
  readonly id: string
  readonly operationId: string
  readonly graphNodeId: string
  readonly targetParticipantId: string
  readonly targetSessionId: SessionId
  readonly prompt: string
  readonly childInputId: SessionInputId
  readonly childTurnId: SessionTurnId
  readonly childJobId: string
  readonly inputIdempotencyKey: string
  readonly jobIdempotencyKey: string
  readonly executionBinding: SessionTurnExecutionBinding
  readonly executionBindingDigest: string
  readonly maxSteps?: number
  readonly priority?: number
  readonly materializedAt?: number
  readonly createdAt: number
  readonly updatedAt: number
}

export interface RouteTeamMessageReceipt {
  readonly message: TeamMessageRecord
  readonly decision: TeamRoutingDecisionRecord
  readonly round?: TeamDiscussionRoundRecord
  readonly deliveries: readonly TeamDeliveryRecord[]
  readonly dispatchJobs: readonly SchedulerJobRecord[]
  readonly created: boolean
}

export interface TeamDeliveryMaterializationContext {
  readonly conversation: TeamConversationRecord
  readonly participant: TeamParticipantRecord
  readonly message: TeamMessageRecord
  readonly delivery: TeamDeliveryRecord
  readonly dispatchJob: SchedulerJobRecord
  readonly childPlan: TeamDeliveryChildTurnPlan
}

export interface TeamDeliveryChildTurnPlan {
  readonly sessionId: SessionId
  readonly inputId: SessionInputId
  readonly turnId: SessionTurnId
  readonly jobId: string
  readonly principalId: PrincipalId
  readonly inputType: "user" | "system"
  readonly content: readonly MessagePart[]
  readonly origin: SessionInputOrigin
  readonly intent: "normal"
  readonly inputIdempotencyKey: string
  readonly jobIdempotencyKey: string
}

export interface MaterializeTeamDeliveryRequest {
  readonly deliveryId: string
  readonly dispatchJobId: string
  readonly workerId: string
  readonly leaseToken: string
  readonly executionBinding: SessionTurnExecutionBinding
  readonly maxSteps?: number
  readonly childPriority?: number
}

export interface MaterializeTeamDeliveryReceipt {
  readonly delivery: TeamDeliveryRecord
  readonly dispatchJob: SchedulerJobRecord
  readonly submission: SubmitSessionTurnReceipt
  readonly created: boolean
}

export interface FailTeamDeliveryMaterializationRequest {
  readonly deliveryId: string
  readonly dispatchJobId: string
  readonly workerId: string
  readonly leaseToken: string
  readonly error: JsonValue
}

export interface FailTeamDeliveryMaterializationReceipt {
  readonly delivery: TeamDeliveryRecord
  readonly dispatchJob: SchedulerJobRecord
}

export interface ProjectTeamDeliveryOutcomeRequest {
  readonly deliveryId: string
  readonly outcomeJobId: string
  readonly workerId: string
  readonly leaseToken: string
}

export interface ProjectTeamDeliveryOutcomeReceipt {
  readonly delivery: TeamDeliveryRecord
  readonly outcomeJob: SchedulerJobRecord
  readonly childTurn: SessionTurnRecord
  readonly childAssistantMessage?: SessionMessageRecord
  readonly replyMessage?: TeamMessageRecord
  readonly created: boolean
}

export interface PutTeamConversationRequest {
  readonly id?: string
  readonly principalId: PrincipalId
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

export interface PutTeamParticipantRequest {
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

export interface ListTeamParticipantsRequest {
  readonly conversationId: string
  readonly state?: TeamParticipantState
}

export interface AdmitTeamMessageRequest {
  readonly id?: string
  readonly conversationId: string
  readonly authorParticipantId: string
  readonly parentMessageId?: string
  readonly kind?: TeamMessageKind
  readonly targets: readonly TeamTarget[]
  readonly content: readonly MessagePart[]
  readonly metadata?: JsonValue
  readonly idempotencyKey: string
}

export interface ListTeamMessagesRequest {
  readonly conversationId: string
  readonly state?: TeamMessageState
  readonly afterCreatedAt?: number
  readonly afterMessageId?: string
  readonly limit?: number
}

export interface RouteTeamDeliveryRequest {
  readonly id?: string
  readonly targetParticipantId: string
  readonly role: TeamDeliveryRole
  readonly trigger: TeamDeliveryTrigger
  readonly budgetGrantId?: string
}

export interface RouteTeamMessageRequest {
  readonly id?: string
  readonly messageId: string
  readonly expectedRevision: number
  readonly expectedLeadParticipantId?: string
  readonly mode: TeamConversationMode
  readonly outcome: TeamRoutingOutcome
  readonly actorPrincipalId: PrincipalId
  readonly reason: string
  readonly metadata?: JsonValue
  readonly idempotencyKey: string
  readonly deliveries: readonly RouteTeamDeliveryRequest[]
}

export interface ListTeamDeliveriesRequest {
  readonly conversationId?: string
  readonly messageId?: string
  readonly routingDecisionId?: string
  readonly state?: TeamDeliveryState
  readonly limit?: number
}

export interface ListTeamRoutingDecisionsRequest {
  readonly conversationId?: string
  readonly messageId?: string
  readonly limit?: number
}

export interface ListTeamDiscussionRoundsRequest {
  readonly conversationId: string
  readonly state?: TeamDiscussionRoundState
  readonly afterCreatedAt?: number
  readonly afterRoundId?: string
  readonly limit?: number
}

export interface GetTeamDelegationOperationRequest {
  readonly operationId: string
}

export interface GetTeamDelegationOperationByToolExecutionRequest {
  readonly toolExecutionId: string
}

export interface ListTeamDelegationTasksRequest {
  readonly operationId: string
}

export interface TeamConversationPageCursor {
  readonly createdAt: number
  readonly messageId: string
}

export interface ReadTeamConversationPageRequest {
  readonly conversationId: string
  readonly beforeCreatedAt?: number
  readonly beforeMessageId?: string
  readonly limit?: number
}

export interface TeamConversationPage {
  readonly conversation: TeamConversationRecord
  readonly participants: readonly TeamParticipantRecord[]
  readonly messages: readonly TeamMessageRecord[]
  readonly routingDecisions: readonly TeamRoutingDecisionRecord[]
  readonly rounds: readonly TeamDiscussionRoundRecord[]
  readonly deliveries: readonly TeamDeliveryRecord[]
  readonly observedAt: number
  readonly nextCursor?: TeamConversationPageCursor
}

export interface UpdateTeamConversationStateRequest {
  readonly conversationId: string
  readonly state: TeamConversationState
}

export interface SetTeamConversationLeadRequest {
  readonly conversationId: string
  readonly expectedLeadParticipantId?: string
  readonly leadParticipantId?: string
}

export interface UpdateTeamParticipantStateRequest {
  readonly participantId: string
  readonly state: TeamParticipantState
}
