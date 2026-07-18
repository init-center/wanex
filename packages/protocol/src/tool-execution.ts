import type { JsonValue } from "./json.js"

export type ToolExecutionState =
  | "running"
  | "denied"
  | "approval_required"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "recovery_required"

export interface ToolExecutionRecord {
  readonly id: string
  readonly sessionId: string
  readonly runId: string
  readonly inputId: string
  readonly principalId: string
  readonly toolCallId: string
  readonly toolName: string
  readonly input: JsonValue
  readonly descriptor: JsonValue
  readonly permission: JsonValue
  readonly state: ToolExecutionState
  readonly attempt: number
  readonly idempotencyKey: string
  readonly result?: JsonValue
  readonly isError?: boolean
  readonly error?: JsonValue
  readonly createdAt: number
  readonly startedAt?: number
  readonly finishedAt?: number
  readonly updatedAt: number
}

export interface BeginToolExecutionRequest {
  readonly sessionId: string
  readonly runId: string
  readonly inputId: string
  readonly principalId: string
  readonly toolCallId: string
  readonly toolName: string
  readonly input: JsonValue
  readonly descriptor: JsonValue
  readonly permission: JsonValue
  readonly idempotencyKey: string
}

export interface BeginToolExecutionReceipt {
  readonly execution: ToolExecutionRecord
  readonly created: boolean
}

export interface FinishToolExecutionRequest {
  readonly executionId: string
  readonly state: "succeeded" | "failed" | "cancelled"
  readonly result?: JsonValue
  readonly isError?: boolean
  readonly error?: JsonValue
}

export interface RecoverToolExecutionRequest {
  readonly executionId: string
  readonly action: "retry" | "require_recovery"
}

export interface ListToolExecutionsRequest {
  readonly sessionId?: string
  readonly runId?: string
  readonly state?: ToolExecutionState
  readonly limit?: number
}
