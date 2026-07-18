import type {
  SchedulerJobKind,
  SchedulerJobState
} from "@wanex/protocol"

export interface WanexAppShellExecutionReferenceCommands {
  readExecutionReference(
    request: WanexAppShellReadExecutionReferenceRequest
  ): Promise<WanexAppShellExecutionReferenceReadResult>
}

export interface WanexAppShellReadExecutionReferenceRequest {
  readonly kind: string
  readonly id: string
}

export type WanexAppShellExecutionReferenceReadResult =
  | WanexAppShellExecutionReferenceFoundResult
  | WanexAppShellExecutionReferenceMissingResult
  | WanexAppShellExecutionReferenceUnsupportedResult

export interface WanexAppShellExecutionReferenceFoundResult {
  readonly kind: "found"
  readonly reference: WanexAppShellExecutionReference
  readonly activity: WanexAppShellJobExecutionActivityReadModel
}

export interface WanexAppShellExecutionReferenceMissingResult {
  readonly kind: "missing"
  readonly reference: WanexAppShellExecutionReference
}

export interface WanexAppShellExecutionReferenceUnsupportedResult {
  readonly kind: "unsupported"
  readonly reference: WanexAppShellExecutionReference
}

export interface WanexAppShellExecutionReference {
  readonly kind: string
  readonly id: string
}

export interface WanexAppShellJobExecutionActivityReadModel {
  readonly kind: "app-shell.execution.job"
  readonly jobKind: SchedulerJobKind
  readonly state: SchedulerJobState
  readonly attempt: number
  readonly maxAttempts: number
  readonly scheduledAt: number
  readonly notBefore?: number
  readonly createdAt: number
  readonly updatedAt: number
  readonly finishedAt?: number
  readonly failureCategory?: WanexAppShellExecutionFailureCategory
}

export type WanexAppShellExecutionFailureCategory =
  | "retry_pending"
  | "terminal_failure"
  | "cancelled"
