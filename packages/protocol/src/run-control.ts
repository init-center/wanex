import type {
  PrincipalId,
  SessionId,
  SessionInputId,
  SessionRunId
} from "./ids.js"
import type { JsonValue } from "./json.js"
import type { MessagePart } from "./message.js"

export type SessionInputOriginKind =
  | "interactive"
  | "scheduler"
  | "connector"
  | "agent"
  | "system"
  | "objective"
  | "plan"

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

export interface RunControlTarget {
  readonly expectedRunId?: SessionRunId
  readonly expectedInputId?: SessionInputId
}

export interface SessionRunControlOptions {
  readonly intent?: SessionInputIntent
  readonly policy?: RunControlPolicy
  readonly target?: RunControlTarget
}

export interface SteerSessionRunRequest {
  readonly sessionId: SessionId
  readonly principalId: PrincipalId
  readonly expectedRunId: SessionRunId
  readonly idempotencyKey: string
  readonly content: readonly MessagePart[]
  readonly origin?: SessionInputOrigin
  readonly providerProfileId?: string
  readonly metadata?: Readonly<Record<string, JsonValue>>
}

export interface SteerSessionRunReceipt {
  readonly sessionId: SessionId
  readonly runId: SessionRunId
  readonly durability: "local-durable"
  readonly status: "accepted"
  readonly acceptedAt?: number
}

export interface InterruptSessionRunRequest {
  readonly sessionId: SessionId
  readonly runId: SessionRunId
  readonly reason: string
  readonly principalId?: PrincipalId
  readonly idempotencyKey?: string
  readonly origin?: SessionInputOrigin
  readonly metadata?: Readonly<Record<string, JsonValue>>
}

export interface InterruptSessionRunReceipt {
  readonly sessionId: SessionId
  readonly runId: SessionRunId
  readonly durability: "local-durable"
  readonly status: "interrupt_requested" | "not_running"
  readonly acceptedAt?: number
}

export type SessionRunControlKind = "interrupt" | "steer"

export type SessionRunControlStatus =
  | "pending"
  | "applied"
  | "rejected"
  | "cancelled"

export interface SessionRunControlRecord {
  readonly id: string
  readonly sessionId: SessionId
  readonly runId: SessionRunId
  readonly inputId?: SessionInputId
  readonly principalId?: PrincipalId
  readonly idempotencyKey: string
  readonly kind: SessionRunControlKind
  readonly status: SessionRunControlStatus
  readonly content?: readonly MessagePart[]
  readonly reason?: string
  readonly origin?: SessionInputOrigin
  readonly providerProfileId?: string
  readonly metadata?: Readonly<Record<string, JsonValue>>
  readonly createdAt: number
  readonly updatedAt: number
  readonly appliedAt?: number
}

export type SessionRunControlApplyEffect =
  | "interrupt_cancelled_run"
  | "steer_completed_input"
  | "already_resolved"

export interface ApplySessionRunControlRequest {
  readonly sessionId: SessionId
  readonly runId: SessionRunId
  readonly controlId: string
  readonly runnerId: string
  readonly leaseToken: string
}

export interface ApplySessionRunControlReceipt {
  readonly control: SessionRunControlRecord
  readonly effect: SessionRunControlApplyEffect
}

export interface ListSessionRunControlsRequest {
  readonly sessionId: SessionId
  readonly runId?: SessionRunId
  readonly kind?: SessionRunControlKind
  readonly status?: SessionRunControlStatus
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
