import type { JsonValue } from "./json.js"
import type { SessionAttemptId, ToolExecutionAttemptId } from "./ids.js"

export type ToolExecutionState =
  | "running"
  | "retry_ready"
  | "denied"
  | "approval_required"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "recovery_required"

export interface ToolExecutionRecord {
  readonly id: string
  readonly sessionId: string
  readonly turnId: string
  readonly inputId: string
  readonly sourceMessageId: string
  readonly principalId: string
  readonly toolCallId: string
  readonly toolName: string
  readonly input: JsonValue
  readonly descriptor: JsonValue
  readonly permission: JsonValue
  readonly state: ToolExecutionState
  readonly currentInvocationAttemptId?: ToolExecutionAttemptId
  readonly attemptCount: number
  readonly idempotencyKey: string
  readonly result?: JsonValue
  readonly isError?: boolean
  readonly error?: JsonValue
  readonly createdAt: number
  readonly finishedAt?: number
  readonly updatedAt: number
}

export type ToolExecutionAttemptState =
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "interrupted"
  | "recovery_required"

export interface ToolExecutionAttemptRecord {
  readonly id: ToolExecutionAttemptId
  readonly executionId: string
  readonly sessionAttemptId: SessionAttemptId
  readonly jobId: string
  readonly workerId: string
  readonly attemptNumber: number
  readonly state: ToolExecutionAttemptState
  readonly error?: JsonValue
  readonly startedAt: number
  readonly updatedAt: number
  readonly finishedAt?: number
}

export interface BeginToolExecutionRequest {
  readonly sessionId: string
  readonly turnId: string
  readonly attemptId: string
  readonly inputId: string
  readonly sourceMessageId: string
  readonly jobId: string
  readonly workerId: string
  readonly leaseToken: string
  readonly principalId: string
  readonly toolCallId: string
  readonly toolName: string
  readonly input: JsonValue
  readonly descriptor: JsonValue
  readonly permission: JsonValue
  readonly state: "running" | "denied" | "approval_required"
  readonly idempotencyKey: string
}

export interface BeginToolExecutionReceipt {
  readonly execution: ToolExecutionRecord
  readonly invocationAttempt?: ToolExecutionAttemptRecord
  readonly created: boolean
}

export interface FinishToolExecutionRequest {
  readonly sessionId: string
  readonly turnId: string
  readonly sessionAttemptId: SessionAttemptId
  readonly inputId: string
  readonly jobId: string
  readonly workerId: string
  readonly leaseToken: string
  readonly executionId: string
  readonly invocationAttemptId: ToolExecutionAttemptId
  readonly state: "succeeded" | "failed" | "cancelled"
  readonly result?: JsonValue
  readonly isError?: boolean
  readonly error?: JsonValue
}

export interface ListToolExecutionAttemptsRequest {
  readonly executionId: string
}

export interface ListToolExecutionsRequest {
  readonly sessionId?: string
  readonly turnId?: string
  readonly attemptId?: string
  readonly state?: ToolExecutionState
  readonly limit?: number
}
