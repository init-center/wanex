import type { JsonValue } from "./json.js"
import type { MessagePart } from "./message.js"
import type {
  ModelCapabilityRequirement,
  ModelDescriptor,
  ProviderConnection,
  ProviderProtocolDescriptor,
  ProviderState
} from "./provider.js"
import type { ResourceInputEvidence } from "./resource.js"
import type {
  RunControlPolicy,
  SessionInputIntent,
  SessionInputOrigin
} from "./run-control.js"
import type { SchedulerJobRecord } from "./scheduler.js"
import type {
  MessageId,
  PrincipalId,
  ProviderInvocationId,
  SessionAttemptId,
  SessionId,
  SessionInputId,
  SessionTurnId
} from "./ids.js"

export type SessionInputState =
  | "admitted"
  | "control_pending"
  | "promoted"
  | "completed"
  | "failed"
  | "cancelled"
  | "rejected"

export type SessionTurnState =
  | "queued"
  | "running"
  | "waiting"
  | "cancel_requested"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "interrupted"
  | "recovery_required"

export type SessionAttemptState =
  | "running"
  | "suspended"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "interrupted"
  | "recovery_required"

export interface ModelEndpointExecutionBinding {
  readonly endpointId: string
  readonly endpointDigest: string
  readonly connection: ProviderConnection
  readonly protocol: ProviderProtocolDescriptor
  readonly model: ModelDescriptor
}

export type CapabilityRouteSource = "configured" | "single_candidate"

export interface ModelCapabilityRouteExecutionBinding {
  readonly requirement: ModelCapabilityRequirement
  readonly source: CapabilityRouteSource
  readonly modelEndpoint: ModelEndpointExecutionBinding
}

export interface SessionTurnCompletionBinding {
  readonly maxOutputTokens: number
}

export interface SessionTurnExecutionBinding {
  readonly digest: string
  readonly createdAt: number
  readonly modelEndpoint: ModelEndpointExecutionBinding
  readonly completion: SessionTurnCompletionBinding
  readonly capabilityRoutes: readonly ModelCapabilityRouteExecutionBinding[]
  readonly resources: readonly ResourceInputEvidence[]
  readonly recovery: SessionTurnRecoveryBinding
  readonly contextSnapshot?: JsonValue
  readonly toolSnapshot?: JsonValue
  readonly permissionSnapshot?: JsonValue
  readonly environmentSnapshot?: JsonValue
}

export interface SessionTurnRecoveryBinding {
  readonly providerMaxAttempts: number
  readonly idempotentToolMaxAttempts: number
}

export interface SessionInput {
  readonly id: SessionInputId
  readonly sessionId: SessionId
  readonly principalId: PrincipalId
  readonly idempotencyKey: string
  readonly content: readonly MessagePart[]
  readonly origin?: SessionInputOrigin
  readonly intent?: SessionInputIntent
  readonly state: SessionInputState
  readonly createdAt: number
}

export interface SessionTurnRecord {
  readonly id: SessionTurnId
  readonly sessionId: SessionId
  readonly primaryInputId: SessionInputId
  readonly jobId: string
  readonly state: SessionTurnState
  readonly executionBinding: SessionTurnExecutionBinding
  readonly maxSteps: number
  readonly currentAttemptId?: SessionAttemptId
  readonly regeneratesTurnId?: SessionTurnId
  readonly cancelRequestedAt?: number
  readonly cancelReason?: string
  readonly result?: JsonValue
  readonly error?: JsonValue
  readonly createdAt: number
  readonly updatedAt: number
  readonly finishedAt?: number
}

export interface SessionAttemptRecord {
  readonly id: SessionAttemptId
  readonly sessionId: SessionId
  readonly turnId: SessionTurnId
  readonly inputId: SessionInputId
  readonly jobId: string
  readonly attemptNumber: number
  readonly workerId: string
  readonly leaseToken: string
  readonly state: SessionAttemptState
  readonly error?: JsonValue
  readonly startedAt: number
  readonly updatedAt: number
  readonly finishedAt?: number
}

export type SessionStatus = "active" | "archived"
export type SessionKind = "chat" | "agent"

export interface SessionRecord {
  readonly id: SessionId
  readonly title?: string
  readonly kind: SessionKind
  readonly status: SessionStatus
  readonly revision: number
  readonly createdAt: number
  readonly updatedAt: number
  readonly archivedAt?: number
}

export interface CreateSessionRequest {
  readonly id?: SessionId
  readonly title?: string
  readonly kind?: SessionKind
}

export interface ListSessionsRequest {
  readonly kind?: SessionKind
  readonly status?: SessionStatus
  readonly updatedBefore?: number
  readonly updatedAfter?: number
  readonly limit?: number
}

export interface RenameSessionRequest {
  readonly sessionId: SessionId
  readonly title: string
  readonly expectedRevision: number
}

export interface ArchiveSessionRequest {
  readonly sessionId: SessionId
  readonly expectedRevision: number
}

export interface RestoreSessionRequest {
  readonly sessionId: SessionId
  readonly expectedRevision: number
}

export interface AdmitSessionInputRequest {
  readonly id?: SessionInputId
  readonly sessionId: SessionId
  readonly principalId: PrincipalId
  readonly idempotencyKey: string
  readonly content: readonly MessagePart[]
  readonly inputType?: "user" | "system"
  readonly origin?: SessionInputOrigin
  readonly intent?: SessionInputIntent
}

export interface AdmissionReceipt {
  readonly inputId: SessionInputId
  readonly sessionId: SessionId
  readonly durability: "local-durable"
  readonly status: "admitted"
}

export interface SubmitSessionTurnRequest {
  readonly id?: SessionInputId
  readonly turnId?: SessionTurnId
  readonly sessionId: SessionId
  readonly principalId: PrincipalId
  readonly idempotencyKey: string
  readonly content: readonly MessagePart[]
  readonly inputType?: "user" | "system"
  readonly origin?: SessionInputOrigin
  readonly intent?: SessionInputIntent
  readonly runControlPolicy?: RunControlPolicy
  readonly expectedTurnId?: SessionTurnId
  readonly jobId?: string
  readonly jobIdempotencyKey?: string
  readonly executionBinding: SessionTurnExecutionBinding
  readonly maxSteps?: number
  readonly regeneratesTurnId?: SessionTurnId
  readonly scheduledAt?: number
  readonly notBefore?: number
  readonly priority?: number
  readonly budgetGrantId?: string
}

export interface SubmitSessionTurnReceipt {
  readonly admission: AdmissionReceipt
  readonly turn: SessionTurnRecord
  readonly job: SchedulerJobRecord
}

export interface StartSessionTurnAttemptRequest {
  readonly sessionId: SessionId
  readonly turnId: SessionTurnId
  readonly inputId: SessionInputId
  readonly jobId: string
  readonly workerId: string
  readonly leaseToken: string
}

export interface StartSessionTurnAttemptReceipt {
  readonly turn: SessionTurnRecord
  readonly attempt: SessionAttemptRecord
  readonly inputMessage: SessionMessageRecord
}

export type SessionTurnSettlementOutcome =
  | "succeeded"
  | "failed"
  | "cancelled"
  | "interrupted"
  | "recovery_required"

export interface SettleSessionTurnRequest {
  readonly sessionId: SessionId
  readonly turnId: SessionTurnId
  readonly attemptId: SessionAttemptId
  readonly inputId: SessionInputId
  readonly jobId: string
  readonly workerId: string
  readonly leaseToken: string
  readonly outcome: SessionTurnSettlementOutcome
  readonly providerInvocationId?: ProviderInvocationId
  readonly assistantMessage?: readonly MessagePart[]
  readonly providerState?: readonly ProviderState[]
  readonly result?: JsonValue
  readonly error?: JsonValue
  readonly reason?: string
}

export type ProviderInvocationState =
  | "dispatched"
  | "output_observed"
  | "succeeded"
  | "failed_before_output"
  | "ambiguous"

export interface ProviderInvocationRecord {
  readonly id: ProviderInvocationId
  readonly sessionId: SessionId
  readonly turnId: SessionTurnId
  readonly attemptId: SessionAttemptId
  readonly inputId: SessionInputId
  readonly jobId: string
  readonly step: number
  readonly invocationNumber: number
  readonly executionBindingDigest: string
  readonly requestDigest: string
  readonly state: ProviderInvocationState
  readonly outputObserved: boolean
  readonly providerRequestId?: string
  readonly assistantMessageId?: MessageId
  readonly error?: JsonValue
  readonly startedAt: number
  readonly updatedAt: number
  readonly finishedAt?: number
}

export interface BeginProviderInvocationRequest {
  readonly id?: ProviderInvocationId
  readonly sessionId: SessionId
  readonly turnId: SessionTurnId
  readonly attemptId: SessionAttemptId
  readonly inputId: SessionInputId
  readonly jobId: string
  readonly workerId: string
  readonly leaseToken: string
  readonly step: number
  readonly invocationNumber: number
  readonly requestDigest: string
}

export interface MarkProviderInvocationOutputRequest {
  readonly sessionId: SessionId
  readonly turnId: SessionTurnId
  readonly attemptId: SessionAttemptId
  readonly inputId: SessionInputId
  readonly jobId: string
  readonly workerId: string
  readonly leaseToken: string
  readonly invocationId: ProviderInvocationId
  readonly providerRequestId?: string
}

export interface FinishProviderInvocationRequest {
  readonly sessionId: SessionId
  readonly turnId: SessionTurnId
  readonly attemptId: SessionAttemptId
  readonly inputId: SessionInputId
  readonly jobId: string
  readonly workerId: string
  readonly leaseToken: string
  readonly invocationId: ProviderInvocationId
  readonly outcome: "succeeded" | "failed_before_output" | "ambiguous"
  readonly assistantMessage?: readonly MessagePart[]
  readonly providerState?: readonly ProviderState[]
  readonly providerRequestId?: string
  readonly error?: JsonValue
}

export interface FinishProviderInvocationReceipt {
  readonly invocation: ProviderInvocationRecord
  readonly assistantMessage?: SessionMessageRecord
}

export interface ListProviderInvocationsRequest {
  readonly turnId: SessionTurnId
}

export interface SettleSessionTurnReceipt {
  readonly turn: SessionTurnRecord
  readonly attempt: SessionAttemptRecord
  readonly job: SchedulerJobRecord
  readonly assistantMessage?: SessionMessageRecord
}

export interface RequestSessionTurnCancelRequest {
  readonly sessionId: SessionId
  readonly turnId: SessionTurnId
  readonly inputId: SessionInputId
  readonly jobId: string
  readonly reason: string
}

export interface RequestSessionTurnCancelReceipt {
  readonly status:
    | "cancelled"
    | "cancel_requested"
    | "already_terminal"
    | "missing"
  readonly turn?: SessionTurnRecord
  readonly job?: SchedulerJobRecord
  readonly cascadeJobIds: readonly string[]
}

export interface SessionInputRecord {
  readonly id: SessionInputId
  readonly sessionId: SessionId
  readonly principalId: PrincipalId
  readonly idempotencyKey: string
  readonly inputType: "user" | "system"
  readonly content: readonly MessagePart[]
  readonly origin?: SessionInputOrigin
  readonly intent?: SessionInputIntent
  readonly runControlPolicy?: RunControlPolicy
  readonly expectedTurnId?: SessionTurnId
  readonly status: SessionInputState
  readonly createdAt: number
  readonly updatedAt: number
}

export interface SessionMessageRecord {
  readonly id: MessageId
  readonly sessionId: SessionId
  readonly sequence: number
  readonly turnId: SessionTurnId
  readonly attemptId?: SessionAttemptId
  readonly inputId?: SessionInputId
  readonly role: "user" | "assistant" | "tool" | "system"
  readonly status: "completed" | "failed" | "partial"
  readonly content: readonly MessagePart[]
  readonly providerState?: readonly ProviderState[]
  readonly executionBindingDigest: string
  readonly createdAt: number
  readonly updatedAt: number
}

export interface AppendSessionMessageRequest {
  readonly sessionId: SessionId
  readonly turnId: SessionTurnId
  readonly attemptId: SessionAttemptId
  readonly inputId: SessionInputId
  readonly jobId: string
  readonly workerId: string
  readonly leaseToken: string
  readonly idempotencyKey: string
  readonly role: "assistant" | "tool" | "system"
  readonly content: readonly MessagePart[]
  readonly providerState?: readonly ProviderState[]
}

export interface ListSessionInputsRequest {
  readonly sessionId: SessionId
  readonly status?: SessionInputState
  readonly limit?: number
}

export interface ListSessionMessagesRequest {
  readonly sessionId: SessionId
  readonly beforeSequence?: number
  readonly limit?: number
  readonly turnIds?: readonly SessionTurnId[]
}

export interface ListSessionTurnsRequest {
  readonly sessionId: SessionId
  readonly state?: SessionTurnState
  readonly turnIds?: readonly SessionTurnId[]
}

export interface ListSessionAttemptsRequest {
  readonly turnId: SessionTurnId
}

export function isTerminalSessionInputState(
  state: SessionInputState
): boolean {
  return (
    state === "completed" ||
    state === "failed" ||
    state === "cancelled" ||
    state === "rejected"
  )
}

export function isTerminalSessionTurnState(
  state: SessionTurnState
): boolean {
  return (
    state === "succeeded" ||
    state === "failed" ||
    state === "cancelled" ||
    state === "interrupted" ||
    state === "recovery_required"
  )
}
