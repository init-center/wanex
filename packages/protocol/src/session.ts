import type { JsonValue } from "./json.js"
import type { MessagePart } from "./message.js"
import type { ProviderState } from "./provider.js"
import type {
  RunControlPolicy,
  SessionInputIntent,
  SessionInputOrigin
} from "./run-control.js"
import type {
  RetryPolicy,
  SchedulerJobRecord
} from "./scheduler.js"
import type {
  MessageId,
  PrincipalId,
  SessionId,
  SessionInputId,
  SessionRunId
} from "./ids.js"

export type SessionInputState =
  | "admitted"
  | "control_pending"
  | "claimed"
  | "completed"
  | "retry_pending"
  | "failed"
  | "cancelled"

export type LegacySessionInputState =
  | "pending"
  | "claimed"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"

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

export type SessionRunState =
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "expired"

export type LegacySessionRunState =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted"

export interface SessionRun {
  readonly id: SessionRunId
  readonly sessionId: SessionId
  readonly inputId: SessionInputId
  readonly state: SessionRunState
  readonly leaseOwner?: string
  readonly leaseExpiresAt?: number
}

export type SessionStatus = "active" | "archived"
export type SessionKind = "chat" | "agent"

export interface SessionRecord {
  readonly id: SessionId
  readonly title?: string
  readonly kind: SessionKind
  readonly status: SessionStatus
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

export interface SubmitSessionRunRequest {
  readonly id?: SessionInputId
  readonly sessionId: SessionId
  readonly principalId: PrincipalId
  readonly idempotencyKey: string
  readonly content: readonly MessagePart[]
  readonly inputType?: "user" | "system"
  readonly origin?: SessionInputOrigin
  readonly intent?: SessionInputIntent
  readonly runControlPolicy?: RunControlPolicy
  readonly expectedRunId?: SessionRunId
  readonly jobId?: string
  readonly jobIdempotencyKey?: string
  readonly mode?: "once" | "to_completion"
  readonly maxSteps?: number
  readonly providerProfileId?: string
  readonly scheduledAt?: number
  readonly notBefore?: number
  readonly priority?: number
  readonly maxAttempts?: number
  readonly retryPolicy?: RetryPolicy
  readonly budgetGrantId?: string
}

export interface SubmitSessionRunReceipt {
  readonly admission: AdmissionReceipt
  readonly job: SchedulerJobRecord
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
  readonly expectedRunId?: SessionRunId
  readonly status: SessionInputState
  readonly createdAt: number
  readonly updatedAt: number
}

export interface SessionMessageRecord {
  readonly id: MessageId
  readonly sessionId: SessionId
  readonly runId?: SessionRunId
  readonly inputId?: SessionInputId
  readonly role: "user" | "assistant" | "tool" | "system"
  readonly status: "completed" | "failed" | "partial"
  readonly content: readonly MessagePart[]
  readonly providerState?: ProviderState
  readonly createdAt: number
  readonly updatedAt: number
}

export interface AppendSessionMessageRequest {
  readonly sessionId: SessionId
  readonly runId: SessionRunId
  readonly inputId: SessionInputId
  readonly runnerId: string
  readonly leaseToken: string
  readonly idempotencyKey: string
  readonly role: "assistant" | "tool" | "system"
  readonly content: readonly MessagePart[]
}

export interface RunnerClaimRequest {
  readonly sessionId: SessionId
  readonly runnerId: string
  readonly leaseMs: number
}

export interface RunnerClaim {
  readonly sessionId: SessionId
  readonly inputId: SessionInputId
  readonly runId: SessionRunId
  readonly runnerId: string
  readonly leaseToken: string
  readonly leaseExpiresAt: number
}

export interface RunnerHeartbeatRequest {
  readonly sessionId: SessionId
  readonly runnerId: string
  readonly leaseToken: string
  readonly leaseMs: number
}

export interface CompleteRunRequest {
  readonly sessionId: SessionId
  readonly runId: SessionRunId
  readonly inputId: SessionInputId
  readonly runnerId: string
  readonly leaseToken: string
  readonly assistantMessage?: readonly MessagePart[]
}

export interface FailRunRequest {
  readonly sessionId: SessionId
  readonly runId: SessionRunId
  readonly inputId: SessionInputId
  readonly runnerId: string
  readonly leaseToken: string
  readonly error: JsonValue
}

export interface ReleaseRunnerRequest {
  readonly sessionId: SessionId
  readonly runnerId: string
  readonly leaseToken: string
}

export interface CancelRunRequest {
  readonly sessionId: SessionId
  readonly runId: SessionRunId
  readonly inputId: SessionInputId
  readonly reason: string
}

export interface ListSessionInputsRequest {
  readonly sessionId: SessionId
}

export interface ListSessionMessagesRequest {
  readonly sessionId: SessionId
}

export function isTerminalSessionInputState(
  state: SessionInputState
): boolean {
  return (
    state === "completed" ||
    state === "failed" ||
    state === "cancelled"
  )
}
