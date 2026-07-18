import type {
  SchedulerJobState,
  SessionId
} from "@wanex/protocol"
import type {
  WanexAppShellClassifierHint
} from "./types-workflow-envelope.js"

export interface WanexAppShellScheduleCommands {
  submitScheduledTick(
    request: WanexAppShellSubmitScheduledTickRequest
  ): Promise<WanexAppShellScheduledTickResult>
}

export interface WanexAppShellSubmitScheduledTickRequest {
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
  readonly classifier?: WanexAppShellClassifierHint
}

export type WanexAppShellScheduledTickResult =
  | WanexAppShellScheduledTickSubmittedResult
  | WanexAppShellScheduledTickSkippedResult

export interface WanexAppShellScheduledTickSubmittedResult {
  readonly status: "submitted"
  readonly scheduleId: string
  readonly tickId: string
  readonly sessionId: SessionId
  readonly inputId?: string
  readonly jobId?: string
  readonly providerProfileId: string
  readonly assistantText: string
  readonly jobStatuses: readonly SchedulerJobState[]
}

export interface WanexAppShellScheduledTickSkippedResult {
  readonly status: "skipped"
  readonly reason: "previous_job_active"
  readonly scheduleId: string
  readonly tickId: string
  readonly previousJob: WanexAppShellScheduleJobSummary
}

export interface WanexAppShellScheduleJobSummary {
  readonly jobId: string
  readonly state: SchedulerJobState
  readonly kind: "session.run"
  readonly scheduledAt: number
  readonly updatedAt: number
}
