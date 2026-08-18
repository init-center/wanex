import type {
  ExecutionReferenceReadResult,
  ReadExecutionReferenceRequest
} from "@wanex/product/surface"

export type ExecutionActivityState =
  | "empty"
  | "submitted"
  | "running"
  | "waiting"
  | "retrying"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "missing"
  | "unsupported"
  | "unavailable"

export interface ExecutionActivityViewModel {
  readonly kind: "web.execution-activity"
  readonly state: ExecutionActivityState
  readonly message: string
  readonly reference?: ReadExecutionReferenceRequest
  readonly jobKind?: string
  readonly schedulerState?: string
  readonly attempt?: number
  readonly maxAttempts?: number
  readonly scheduledAt?: number
  readonly notBefore?: number
  readonly createdAt?: number
  readonly updatedAt?: number
  readonly finishedAt?: number
  readonly failureCategory?: string
  readonly refreshedAt?: number
}

export type ExecutionReferenceRequest =
  ReadExecutionReferenceRequest
export type ExecutionActivitySource =
  ExecutionReferenceReadResult
