import type {
  BudgetEventType,
  ConfigEventType,
  ContextEventType,
  EventFamily,
  KnownRuntimeEventType,
  ObjectiveEventType,
  PlanEventType,
  ResourceEventType,
  RuntimeEvent,
  RuntimeEventType,
  SchedulerEventType,
  SessionEventType,
  UiSurfaceEventType
} from "./event-types.js"

export function eventFamily(type: RuntimeEventType): EventFamily {
  if (isSessionEventType(type)) {
    return "session"
  }
  if (isSchedulerEventType(type)) {
    return "scheduler"
  }
  if (isBudgetEventType(type)) {
    return "budget"
  }
  if (isResourceEventType(type)) {
    return "resource"
  }
  if (isConfigEventType(type)) {
    return "config"
  }
  if (isUiSurfaceEventType(type)) {
    return "ui"
  }
  if (isContextEventType(type)) {
    return "context"
  }
  if (isPlanEventType(type)) {
    return "plan"
  }
  if (isObjectiveEventType(type)) {
    return "objective"
  }
  return "unknown"
}

export function isKnownRuntimeEventType(
  type: RuntimeEventType
): type is KnownRuntimeEventType {
  return eventFamily(type) !== "unknown"
}

export function isSessionEventType(
  type: RuntimeEventType
): type is SessionEventType {
  return (
    type === "session.created" ||
    type === "session.input.admitted" ||
    type === "session.run.submitted" ||
    type === "session.run.claimed" ||
    type === "session.run.interrupt_requested" ||
    type === "session.run.interrupted" ||
    type === "session.run.steer_admitted" ||
    type === "session.run.steer_rejected" ||
    type === "session.ephemeral_query.completed" ||
    type === "session.message.appended" ||
    type === "session.run.completed" ||
    type === "session.run.failed" ||
    type === "session.run.cancelled"
  )
}

export function isSchedulerEventType(
  type: RuntimeEventType
): type is SchedulerEventType {
  return (
    type === "scheduler.job.enqueued" ||
    type === "scheduler.job.claimed" ||
    type === "scheduler.job.heartbeat" ||
    type === "scheduler.job.succeeded" ||
    type === "scheduler.job.retry_scheduled" ||
    type === "scheduler.job.failed" ||
    type === "scheduler.job.cancelled"
  )
}

export function isBudgetEventType(
  type: RuntimeEventType
): type is BudgetEventType {
  return (
    type === "budget.grant.denied" ||
    type === "budget.grant.reserved" ||
    type === "budget.grant.committed" ||
    type === "budget.grant.released"
  )
}

export function isResourceEventType(
  type: RuntimeEventType
): type is ResourceEventType {
  return type === "resource.ticket.cleanup"
}

export function isConfigEventType(
  type: RuntimeEventType
): type is ConfigEventType {
  return type === "config.updated"
}

export function isUiSurfaceEventType(
  type: RuntimeEventType
): type is UiSurfaceEventType {
  return type === "ui.surface.emitted"
}

export function isContextEventType(
  type: RuntimeEventType
): type is ContextEventType {
  return (
    type === "context.compaction.planned" ||
    type === "context.compaction.applied" ||
    type === "context.compaction.skipped" ||
    type === "context.epoch.created" ||
    type === "context.epoch.activated" ||
    type === "context.epoch.superseded"
  )
}

export function isPlanEventType(
  type: RuntimeEventType
): type is PlanEventType {
  return (
    type === "plan.proposal.created" ||
    type === "plan.proposal.operation_recorded"
  )
}

export function isObjectiveEventType(
  type: RuntimeEventType
): type is ObjectiveEventType {
  return (
    type === "objective.run.created" ||
    type === "objective.run.operation_recorded" ||
    type === "objective.attempt.recorded" ||
    type === "objective.verification.recorded"
  )
}

export function eventHasFamily(
  event: RuntimeEvent,
  family: EventFamily
): boolean {
  return eventFamily(event.type) === family
}
