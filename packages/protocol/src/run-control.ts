import type {
  PrincipalId,
  SessionAttemptId,
  SessionId,
  SessionInputId,
  SessionTurnId
} from "./ids.js"
import type { JsonValue } from "./json.js"
import type { MessagePart } from "./message.js"

export type SessionInputOriginKind =
  | "interactive"
  | "scheduler"
  | "connector"
  | "agent"
  | "system"
  | (string & {})

export interface SessionInputOrigin {
  readonly kind: SessionInputOriginKind
  readonly sourceRef?: string
  readonly parentRef?: string
  readonly metadata?: Readonly<Record<string, JsonValue>>
}

export type SessionInputIntent =
  | "normal"
  | "follow_up"
  | "steer"
  | "interrupt"

export type RunControlPolicy =
  | "queue_after_current"
  | "abort_current_then_run"
  | "steer_at_safe_point"

export interface SessionTurnControlTarget {
  readonly expectedTurnId?: SessionTurnId
  readonly expectedAttemptId?: SessionAttemptId
  readonly expectedInputId?: SessionInputId
}

export interface SessionTurnControlOptions {
  readonly intent?: SessionInputIntent
  readonly policy?: RunControlPolicy
  readonly target?: SessionTurnControlTarget
}

export interface SteerSessionTurnRequest {
  readonly sessionId: SessionId
  readonly principalId: PrincipalId
  readonly expectedTurnId: SessionTurnId
  readonly expectedAttemptId: SessionAttemptId
  readonly idempotencyKey: string
  readonly content: readonly MessagePart[]
  readonly origin?: SessionInputOrigin
  readonly metadata?: Readonly<Record<string, JsonValue>>
}

export interface SteerSessionTurnReceipt {
  readonly sessionId: SessionId
  readonly turnId: SessionTurnId
  readonly attemptId: SessionAttemptId
  readonly durability: "local-durable"
  readonly status: "accepted"
  readonly acceptedAt?: number
}

export interface InterruptSessionTurnRequest {
  readonly sessionId: SessionId
  readonly turnId: SessionTurnId
  readonly attemptId: SessionAttemptId
  readonly reason: string
  readonly principalId?: PrincipalId
  readonly idempotencyKey?: string
  readonly origin?: SessionInputOrigin
  readonly metadata?: Readonly<Record<string, JsonValue>>
}

export interface InterruptSessionTurnReceipt {
  readonly sessionId: SessionId
  readonly turnId: SessionTurnId
  readonly attemptId: SessionAttemptId
  readonly durability: "local-durable"
  readonly status: "interrupt_requested" | "not_running"
  readonly acceptedAt?: number
}

export type SessionTurnControlKind = "interrupt" | "steer"

export type SessionTurnControlStatus =
  | "pending"
  | "applied"
  | "rejected"
  | "cancelled"

export interface SessionTurnControlRecord {
  readonly id: string
  readonly sessionId: SessionId
  readonly turnId: SessionTurnId
  readonly attemptId: SessionAttemptId
  readonly inputId?: SessionInputId
  readonly principalId?: PrincipalId
  readonly idempotencyKey: string
  readonly kind: SessionTurnControlKind
  readonly status: SessionTurnControlStatus
  readonly content?: readonly MessagePart[]
  readonly reason?: string
  readonly origin?: SessionInputOrigin
  readonly metadata?: Readonly<Record<string, JsonValue>>
  readonly createdAt: number
  readonly updatedAt: number
  readonly appliedAt?: number
}

export type SessionTurnControlApplyEffect =
  | "interrupt_requested_cancel"
  | "steer_promoted_input"
  | "already_resolved"

export interface ApplySessionTurnControlRequest {
  readonly sessionId: SessionId
  readonly turnId: SessionTurnId
  readonly attemptId: SessionAttemptId
  readonly controlId: string
  readonly jobId: string
  readonly workerId: string
  readonly leaseToken: string
}

export interface ApplySessionTurnControlReceipt {
  readonly control: SessionTurnControlRecord
  readonly effect: SessionTurnControlApplyEffect
}

export interface ListSessionTurnControlsRequest {
  readonly sessionId: SessionId
  readonly turnId?: SessionTurnId
  readonly attemptId?: SessionAttemptId
  readonly kind?: SessionTurnControlKind
  readonly status?: SessionTurnControlStatus
  readonly limit?: number
}

export type EphemeralQueryToolPolicy = "none"
export type EphemeralQueryMemoryPolicy = "exclude"
export type EphemeralQueryPersistence = "none"

export interface EphemeralQueryRequest {
  readonly sessionId?: SessionId
  readonly principalId?: PrincipalId
  readonly contextSnapshotId?: string
  readonly question: readonly MessagePart[]
  readonly providerProfileId?: string
  readonly origin?: SessionInputOrigin
  readonly toolPolicy?: EphemeralQueryToolPolicy
  readonly memoryPolicy?: EphemeralQueryMemoryPolicy
  readonly persistence?: EphemeralQueryPersistence
  readonly maxOutputTokens?: number
  readonly metadata?: Readonly<Record<string, JsonValue>>
}

export interface EphemeralQueryResult {
  readonly output: readonly MessagePart[]
  readonly telemetry?: Readonly<Record<string, JsonValue>>
}
