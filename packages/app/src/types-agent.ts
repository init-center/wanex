import type {
  RunControlPolicy,
  SchedulerJobState,
  SessionId,
  SessionInputIntent,
  SessionInputOrigin
} from "@wanex/protocol"
import type { WanexAppShellAgentContextSummary } from "./types-context.js"

export interface WanexAppShellAgentCommands {
  runAgentTurn(
    request: WanexAppShellRunAgentTurnRequest
  ): Promise<WanexAppShellRunAgentTurnResult>
}

export interface WanexAppShellRunAgentTurnRequest {
  readonly text: string
  readonly sessionId?: SessionId
  readonly principalId?: string
  readonly inputId?: string
  readonly idempotencyKey?: string
  readonly jobId?: string
  readonly jobIdempotencyKey?: string
  readonly origin?: SessionInputOrigin
  readonly intent?: SessionInputIntent
  readonly runControlPolicy?: Extract<RunControlPolicy, "queue_after_current">
  readonly expectedRunId?: string
}

export interface WanexAppShellRunAgentTurnResult {
  readonly sessionId: SessionId
  readonly assistantText: string
  readonly messageCount: number
  readonly jobStatuses: readonly SchedulerJobState[]
  readonly context?: WanexAppShellAgentContextSummary
}
