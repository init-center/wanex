import type {
  SchedulerJobState,
  SessionId
} from "@wanex/protocol"
import type { WanexAppConversationOperationReceipt } from "./types-conversation-operation.js"
import type {
  WanexAppClassifierHint
} from "./types-workflow-envelope.js"

export interface WanexAppScheduleCommands {
  submitScheduledTick(
    request: WanexAppSubmitScheduledTickRequest
  ): Promise<WanexAppScheduledTickResult>
}

export interface WanexAppSubmitScheduledTickRequest {
  readonly scheduleId: string
  readonly tickId: string
  readonly text: string
  readonly sessionId?: SessionId
  readonly principalId?: string
  readonly inputId?: string
  readonly jobId?: string
  readonly idempotencyKey?: string
  readonly jobIdempotencyKey?: string
  readonly nonOverlap?: boolean
  readonly previousJobId?: string
  readonly activeJobScanLimit?: number
  readonly classifier?: WanexAppClassifierHint
}

export type WanexAppScheduledTickResult =
  | WanexAppScheduledTickSubmittedResult
  | WanexAppScheduledTickSkippedResult

export interface WanexAppScheduledTickSubmittedResult {
  readonly status: "submitted"
  readonly scheduleId: string
  readonly tickId: string
  readonly modelEndpointId: string
  readonly receipt: WanexAppConversationOperationReceipt
}

export interface WanexAppScheduledTickSkippedResult {
  readonly status: "skipped"
  readonly reason: "previous_job_active"
  readonly scheduleId: string
  readonly tickId: string
  readonly previousJob: WanexAppScheduleJobSummary
}

export interface WanexAppScheduleJobSummary {
  readonly jobId: string
  readonly state: SchedulerJobState
  readonly kind: "session.turn"
  readonly scheduledAt: number
  readonly updatedAt: number
}
