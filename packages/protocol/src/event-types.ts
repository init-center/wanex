import type {
  MessageId,
  ObjectiveId,
  PlanProposalId,
  ResourceId,
  RuntimeEventId,
  SessionId,
  SessionAttemptId,
  SessionInputId,
  SessionTurnId
} from "./ids.js"
import type { JsonValue } from "./json.js"
import { WANEX_PROTOCOL_VERSION } from "./version.js"

export interface RuntimeEventScope {
  readonly sessionId?: SessionId
  readonly turnId?: SessionTurnId
  readonly attemptId?: SessionAttemptId
  readonly inputId?: SessionInputId
  readonly messageId?: MessageId
  readonly resourceId?: ResourceId
  readonly planProposalId?: PlanProposalId
  readonly objectiveId?: ObjectiveId
}

export interface RuntimeEvent {
  readonly id: RuntimeEventId
  readonly protocolVersion: typeof WANEX_PROTOCOL_VERSION
  readonly type: RuntimeEventType
  readonly scope: RuntimeEventScope
  readonly payload: JsonValue
  readonly occurredAt: number
}

export type SessionEventType =
  | "session.created"
  | "session.input.admitted"
  | "session.turn.submitted"
  | "session.turn.attempt_started"
  | "session.turn.interrupt_requested"
  | "session.turn.steer_accepted"
  | "session.turn.control_applied"
  | "session.turn.cancel_requested"
  | "session.turn.interrupted"
  | "session.turn.recovery_required"
  | "session.ephemeral_query.completed"
  | "session.message.appended"
  | "session.turn.succeeded"
  | "session.turn.failed"
  | "session.turn.cancelled"

export type SchedulerEventType =
  | "scheduler.job.enqueued"
  | "scheduler.job.claimed"
  | "scheduler.job.heartbeat"
  | "scheduler.job.succeeded"
  | "scheduler.job.retry_scheduled"
  | "scheduler.job.failed"
  | "scheduler.job.cancelled"

export type BudgetEventType =
  | "budget.grant.denied"
  | "budget.grant.reserved"
  | "budget.grant.committed"
  | "budget.grant.released"

export type ResourceEventType = "resource.ticket.cleanup"

export type ConfigEventType = "config.updated"

export type ContextEventType =
  | "context.compaction.planned"
  | "context.compaction.applied"
  | "context.compaction.skipped"
  | "context.epoch.created"
  | "context.epoch.activated"
  | "context.epoch.superseded"

export type PlanEventType =
  | "plan.proposal.created"
  | "plan.proposal.operation_recorded"
  | "plan.proposal.execution_bound"

export type ObjectiveEventType =
  | "objective.created"
  | "objective.state_changed"
  | "objective.attempt.admitted"
  | "objective.attempt.reviewed"
  | "objective.verification.recorded"

export type KnownRuntimeEventType =
  | SessionEventType
  | SchedulerEventType
  | BudgetEventType
  | ResourceEventType
  | ConfigEventType
  | ContextEventType
  | PlanEventType
  | ObjectiveEventType

export type RuntimeEventType = KnownRuntimeEventType | (string & {})

export type EventFamily =
  | "session"
  | "scheduler"
  | "budget"
  | "resource"
  | "config"
  | "context"
  | "plan"
  | "objective"
  | "unknown"

export interface EventCursor {
  readonly occurredAt: number
  readonly eventId: RuntimeEventId
}

export interface CreateRuntimeEventInput {
  readonly id: RuntimeEventId
  readonly type: RuntimeEventType
  readonly scope: RuntimeEventScope
  readonly payload: JsonValue
  readonly occurredAt: number
}

export interface QueryEventsInput {
  readonly scope?: RuntimeEventScope
  readonly after?: EventCursor
  readonly limit?: number
}

export function createRuntimeEvent(
  input: CreateRuntimeEventInput
): RuntimeEvent {
  return {
    ...input,
    protocolVersion: WANEX_PROTOCOL_VERSION
  }
}
