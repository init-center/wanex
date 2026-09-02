/**
 * Process-local execution milestones used for bounded diagnostics.
 *
 * These are advisory observations, not durable protocol state. Canonical
 * execution state remains owned by Storage and can always be reconstructed
 * from the persisted Turn, Job, Provider, and Tool records.
 */
export type AgentRuntimeExecutionStage =
  | "worker_claimed"
  | "turn_attempt_started"
  | "input_loaded"
  | "context_resolved"
  | "provider_resolved"
  | "recovery_checkpoint_read"
  | "provider_request_prepared"
  | "provider_invocation_started"
  | "provider_invocation_succeeded"
  | "tool_batch_preflight_started"
  | "tool_batch_preflight_completed"
  | "tool_execution_begin_requested"
  | "tool_execution_begin_completed"
  | "tool_execution_settled"
  | "tool_result_persisted"
  | "turn_settlement_started"
  | "turn_settled"

export interface AgentRuntimeExecutionStageEvent {
  readonly kind: "wanex-runtime.execution-stage"
  readonly stage: AgentRuntimeExecutionStage
  readonly sessionId?: string
  readonly inputId?: string
  readonly turnId?: string
  readonly jobId?: string
  readonly attemptId?: string
  readonly step?: number
  readonly toolCount?: number
}

export type AgentRuntimeExecutionStageObserver = (
  event: AgentRuntimeExecutionStageEvent
) => void

export function notifyAgentRuntimeExecutionStage(
  observer: AgentRuntimeExecutionStageObserver | undefined,
  event: AgentRuntimeExecutionStageEvent
): void {
  if (observer === undefined) return
  try {
    observer(event)
  } catch {
    // Stage observers are advisory and must never change execution semantics.
  }
}
