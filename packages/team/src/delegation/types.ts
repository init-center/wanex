import type {
  JsonValue,
  MessagePart,
  SchedulerJobRecord,
  SessionId,
  SessionInputId,
  SessionMessageRecord,
  SessionRecord,
  SubmitSessionTurnReceipt
} from "@wanex/protocol"
import type {
  SubmitUserTurnRequest,
  SubmitUserTurnResult
} from "@wanex/runtime/host"
import type {
  DelegationExecutor,
  DelegationExecutorRunOnceResult,
  DelegationRuntimeHostLike
} from "./executor.js"

export type DelegationTaskStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"

export interface DelegationTask {
  readonly id: string
  readonly prompt: string
  readonly title?: string
  readonly sessionId?: SessionId
  readonly inputId?: SessionInputId
  readonly turnId?: string
  readonly jobId?: string
  readonly principalId?: string
  readonly providerProfileId?: string
  readonly maxSteps?: number
}

export interface DelegationPlan {
  readonly id: string
  readonly title?: string
  readonly principalId?: string
  readonly providerProfileId?: string
  readonly tasks: readonly DelegationTask[]
}

export interface DelegationTaskRuntimeIds {
  readonly delegationId: string
  readonly taskId: string
  readonly sessionId: SessionId
  readonly inputId: SessionInputId
  readonly turnId: string
  readonly jobId: string
  readonly inputIdempotencyKey: string
  readonly jobIdempotencyKey: string
}

export interface DelegationTaskSubmission {
  readonly task: DelegationTask
  readonly ids: DelegationTaskRuntimeIds
  readonly receipt: SubmitSessionTurnReceipt
}

export interface DelegationSubmission {
  readonly delegationId: string
  readonly tasks: readonly DelegationTaskSubmission[]
}

export interface DelegationTaskResult {
  readonly task: DelegationTask
  readonly ids: DelegationTaskRuntimeIds
  readonly status: DelegationTaskStatus
  readonly job?: SchedulerJobRecord
  readonly assistantMessages: readonly SessionMessageRecord[]
  readonly output: readonly MessagePart[]
  readonly error?: JsonValue
}

export interface DelegationSummary {
  readonly delegationId: string
  readonly status: DelegationTaskStatus
  readonly tasks: readonly DelegationTaskResult[]
}

export interface DelegationRunOnceResult extends DelegationSubmission {
  readonly run: DelegationExecutorRunOnceResult
  readonly summary: DelegationSummary
}

export interface DelegationRuntimeOptions {
  readonly executor?: DelegationExecutor
  readonly host?: DelegationRuntimeHostLike
}

export type DelegationSubmitUserTurnRequest = SubmitUserTurnRequest
export type DelegationSubmitUserTurnResult = SubmitUserTurnResult
