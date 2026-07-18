import type {
  MessageId,
  ObjectiveRunId,
  PlanProposalId,
  ResourceId,
  RuntimeEventId,
  SessionId,
  SessionInputId,
  SessionRunId
} from "./ids.js"
import type { JsonValue } from "./json.js"
import { WANEX_PROTOCOL_VERSION } from "./version.js"

export interface RuntimeEventScope {
  readonly sessionId?: SessionId
  readonly runId?: SessionRunId
  readonly inputId?: SessionInputId
  readonly messageId?: MessageId
  readonly resourceId?: ResourceId
  readonly planProposalId?: PlanProposalId
  readonly objectiveId?: ObjectiveRunId
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
  | "session.run.submitted"
  | "session.run.claimed"
  | "session.run.interrupt_requested"
  | "session.run.interrupted"
  | "session.run.steer_admitted"
  | "session.run.steer_rejected"
  | "session.ephemeral_query.completed"
  | "session.message.appended"
  | "session.run.completed"
  | "session.run.failed"
  | "session.run.cancelled"

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

export type UiSurfaceEventType = "ui.surface.emitted"

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

export type ObjectiveEventType =
  | "objective.run.created"
  | "objective.run.operation_recorded"
  | "objective.attempt.recorded"
  | "objective.verification.recorded"

export type KnownRuntimeEventType =
  | SessionEventType
  | SchedulerEventType
  | BudgetEventType
  | ResourceEventType
  | ConfigEventType
  | UiSurfaceEventType
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
  | "ui"
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
