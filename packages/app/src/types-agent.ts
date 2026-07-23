import type {
  RunControlPolicy,
  SchedulerJobState,
  SessionId,
  SessionInputIntent,
  SessionInputOrigin,
  UserMessageInputPart
} from "@wanex/protocol"
import type { WanexAppAgentContextSummary } from "./types-context.js"

export interface WanexAppAgentCommands {
  runAgentTurn(
    request: WanexAppRunAgentTurnRequest
  ): Promise<WanexAppRunAgentTurnResult>
}

export interface WanexAppRunAgentTurnRequest {
  readonly content: readonly UserMessageInputPart[]
  readonly sessionId?: SessionId
  readonly principalId?: string
  readonly inputId?: string
  readonly idempotencyKey?: string
  readonly jobId?: string
  readonly jobIdempotencyKey?: string
  readonly origin?: SessionInputOrigin
  readonly intent?: SessionInputIntent
  readonly runControlPolicy?: Extract<RunControlPolicy, "queue_after_current">
  readonly expectedTurnId?: string
}

export interface WanexAppRunAgentTurnResult {
  readonly sessionId: SessionId
  readonly assistantText: string
  readonly messageCount: number
  readonly jobStatuses: readonly SchedulerJobState[]
  readonly context?: WanexAppAgentContextSummary
}
