import type { PrincipalId } from "./ids.js"
import type { JsonValue } from "./json.js"
import type {
  RetryPolicy,
  SchedulerJobRecord
} from "./scheduler.js"
import type { WorkspaceTaskAccess } from "./workspace-task.js"

export type ChannelBindingState = "active" | "revoked"

export type ChannelInboundEventState =
  | "received"
  | "projected"
  | "ignored"
  | "failed"

export type ChannelDeliveryState =
  | "pending"
  | "sent"
  | "failed"
  | "cancelled"

export interface ChannelBindingRecord {
  readonly id: string
  readonly connectorId: string
  readonly channelKind: string
  readonly channelId: string
  readonly externalIdentityId: string
  readonly principalId: PrincipalId
  readonly displayName?: string
  readonly state: ChannelBindingState
  readonly metadata?: JsonValue
  readonly createdAt: number
  readonly updatedAt: number
  readonly revokedAt?: number
}

export interface PutChannelBindingRequest {
  readonly id?: string
  readonly connectorId: string
  readonly channelKind: string
  readonly channelId: string
  readonly externalIdentityId: string
  readonly principalId: PrincipalId
  readonly displayName?: string
  readonly metadata?: JsonValue
  readonly idempotencyKey?: string
}

export interface ListChannelBindingsRequest {
  readonly connectorId?: string
  readonly channelKind?: string
  readonly channelId?: string
  readonly principalId?: PrincipalId
  readonly externalIdentityId?: string
  readonly state?: ChannelBindingState
  readonly limit?: number
}

export interface RevokeChannelBindingRequest {
  readonly bindingId: string
}

export interface ChannelInboundEventRecord {
  readonly id: string
  readonly connectorId: string
  readonly channelKind: string
  readonly channelId: string
  readonly externalEventId: string
  readonly externalThreadId?: string
  readonly senderExternalIdentityId: string
  readonly principalId?: PrincipalId
  readonly payload: JsonValue
  readonly state: ChannelInboundEventState
  readonly metadata?: JsonValue
  readonly receivedAt: number
  readonly createdAt: number
  readonly updatedAt: number
}

export interface IngestChannelInboundEventRequest {
  readonly id?: string
  readonly connectorId: string
  readonly channelKind: string
  readonly channelId: string
  readonly externalEventId: string
  readonly externalThreadId?: string
  readonly senderExternalIdentityId: string
  readonly principalId?: PrincipalId
  readonly payload: JsonValue
  readonly metadata?: JsonValue
  readonly receivedAt?: number
  readonly idempotencyKey?: string
}

export interface ListChannelInboundEventsRequest {
  readonly connectorId?: string
  readonly channelKind?: string
  readonly channelId?: string
  readonly state?: ChannelInboundEventState
  readonly afterReceivedAt?: number
  readonly limit?: number
}

export interface UpdateChannelInboundEventStateRequest {
  readonly eventId: string
  readonly state: ChannelInboundEventState
  readonly metadata?: JsonValue
}

export interface ChannelDeliveryRecord {
  readonly id: string
  readonly connectorId: string
  readonly channelKind: string
  readonly channelId: string
  readonly targetExternalIdentityId?: string
  readonly externalThreadId?: string
  readonly principalId: PrincipalId
  readonly payload: JsonValue
  readonly state: ChannelDeliveryState
  readonly metadata?: JsonValue
  readonly schedulerJobId?: string
  readonly createdAt: number
  readonly updatedAt: number
  readonly finishedAt?: number
}

export interface SubmitChannelDeliveryRequest {
  readonly id?: string
  readonly connectorId: string
  readonly channelKind: string
  readonly channelId: string
  readonly targetExternalIdentityId?: string
  readonly externalThreadId?: string
  readonly principalId: PrincipalId
  readonly payload: JsonValue
  readonly metadata?: JsonValue
  readonly jobId?: string
  readonly idempotencyKey?: string
  readonly scheduledAt?: number
  readonly notBefore?: number
  readonly priority?: number
  readonly maxAttempts?: number
  readonly retryPolicy?: RetryPolicy
  readonly budgetGrantId?: string
}

export interface ChannelDeliverySubmission {
  readonly delivery: ChannelDeliveryRecord
  readonly job: SchedulerJobRecord
}

export interface CompleteChannelDeliveryRequest {
  readonly deliveryId: string
  readonly workerId: string
  readonly leaseToken: string
  readonly result?: JsonValue
  readonly metadata?: JsonValue
}

export interface FailChannelDeliveryRequest {
  readonly deliveryId: string
  readonly workerId: string
  readonly leaseToken: string
  readonly error: JsonValue
  readonly metadata?: JsonValue
}

export interface ChannelDeliveryAcknowledgement {
  readonly delivery: ChannelDeliveryRecord
  readonly job: SchedulerJobRecord
}

export type ChannelProjectionTargetKind =
  | "session.turn"
  | "team.message"
  | "workspace.task"
  | "ignored"

export interface ChannelProjectionRecord {
  readonly id: string
  readonly inboundEventId: string
  readonly targetKind: ChannelProjectionTargetKind
  readonly targetId?: string
  readonly targetJobId?: string
  readonly state: "projected" | "ignored"
  readonly target: JsonValue
  readonly metadata?: JsonValue
  readonly idempotencyKey?: string
  readonly createdAt: number
  readonly updatedAt: number
}

export interface SessionTurnProjectionTarget {
  readonly kind: "session.turn"
  readonly sessionId: string
  readonly principalId: PrincipalId
  readonly content: JsonValue
  readonly inputId?: string
  readonly turnId?: string
  readonly inputType?: string
  readonly executionBinding: import("./session.js").SessionTurnExecutionBinding
  readonly maxSteps?: number
  readonly regeneratesTurnId?: string
  readonly jobId?: string
  readonly scheduledAt?: number
  readonly notBefore?: number
  readonly priority?: number
  readonly budgetGrantId?: string
}

export interface TeamMessageProjectionTarget {
  readonly kind: "team.message"
  readonly conversationId: string
  readonly authorParticipantId: string
  readonly content: JsonValue
  readonly messageId?: string
  readonly parentMessageId?: string
  readonly messageKind?: string
  readonly targets?: readonly import("./team.js").TeamTarget[]
  readonly metadata?: JsonValue
}

export interface WorkspaceTaskProjectionTarget {
  readonly kind: "workspace.task"
  readonly handlerId: string
  readonly principalId: PrincipalId
  readonly access: WorkspaceTaskAccess
  readonly input: JsonValue
  readonly taskId?: string
  readonly workspaceId?: string
  readonly jobId?: string
  readonly agentId?: string
  readonly scheduledAt?: number
  readonly notBefore?: number
  readonly priority?: number
  readonly maxAttempts?: number
  readonly retryPolicy?: RetryPolicy
  readonly budgetGrantId?: string
}

export interface IgnoredProjectionTarget {
  readonly kind: "ignored"
  readonly reason: string
  readonly metadata?: JsonValue
}

export type ChannelProjectionTarget =
  | SessionTurnProjectionTarget
  | TeamMessageProjectionTarget
  | WorkspaceTaskProjectionTarget
  | IgnoredProjectionTarget

export interface ProjectChannelInboundEventRequest {
  readonly id?: string
  readonly inboundEventId: string
  readonly target: ChannelProjectionTarget
  readonly metadata?: JsonValue
  readonly idempotencyKey?: string
}

export interface ListChannelProjectionsRequest {
  readonly inboundEventId?: string
  readonly targetKind?: ChannelProjectionTargetKind
  readonly limit?: number
}

export interface ChannelProjectionReceipt {
  readonly projection: ChannelProjectionRecord
  readonly job?: SchedulerJobRecord
}
