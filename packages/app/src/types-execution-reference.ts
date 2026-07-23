import type {
  SchedulerJobKind,
  SchedulerJobState
} from "@wanex/protocol"

export interface WanexAppExecutionReferenceCommands {
  readExecutionReference(
    request: WanexAppReadExecutionReferenceRequest
  ): Promise<WanexAppExecutionReferenceReadResult>
}

export interface WanexAppReadExecutionReferenceRequest {
  readonly kind: string
  readonly id: string
}

export type WanexAppExecutionReferenceReadResult =
  | WanexAppExecutionReferenceFoundResult
  | WanexAppExecutionReferenceMissingResult
  | WanexAppExecutionReferenceUnsupportedResult

export interface WanexAppExecutionReferenceFoundResult {
  readonly kind: "found"
  readonly reference: WanexAppExecutionReference
  readonly activity: WanexAppJobExecutionActivityReadModel
}

export interface WanexAppExecutionReferenceMissingResult {
  readonly kind: "missing"
  readonly reference: WanexAppExecutionReference
}

export interface WanexAppExecutionReferenceUnsupportedResult {
  readonly kind: "unsupported"
  readonly reference: WanexAppExecutionReference
}

export interface WanexAppExecutionReference {
  readonly kind: string
  readonly id: string
}

export interface WanexAppJobExecutionActivityReadModel {
  readonly kind: "wanex-app.execution.job"
  readonly jobKind: SchedulerJobKind
  readonly state: SchedulerJobState
  readonly attempt: number
  readonly maxAttempts: number
  readonly scheduledAt: number
  readonly notBefore?: number
  readonly createdAt: number
  readonly updatedAt: number
  readonly finishedAt?: number
  readonly failureCategory?: WanexAppExecutionFailureCategory
}

export type WanexAppExecutionFailureCategory =
  | "retry_pending"
  | "terminal_failure"
  | "cancelled"
