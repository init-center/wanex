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
  SessionEventType
} from "./event-types.js"

const sessionEventTypes: Readonly<Record<SessionEventType, true>> = {
  "session.created": true,
  "session.input.admitted": true,
  "session.turn.submitted": true,
  "session.turn.attempt_started": true,
  "session.turn.interrupt_requested": true,
  "session.turn.steer_accepted": true,
  "session.turn.control_applied": true,
  "session.turn.cancel_requested": true,
  "session.turn.interrupted": true,
  "session.turn.recovery_required": true,
  "session.ephemeral_query.completed": true,
  "session.message.appended": true,
  "session.turn.succeeded": true,
  "session.turn.failed": true,
  "session.turn.cancelled": true
}

const schedulerEventTypes: Readonly<Record<SchedulerEventType, true>> = {
  "scheduler.job.enqueued": true,
  "scheduler.job.claimed": true,
  "scheduler.job.heartbeat": true,
  "scheduler.job.succeeded": true,
  "scheduler.job.retry_scheduled": true,
  "scheduler.job.failed": true,
  "scheduler.job.cancelled": true
}

const budgetEventTypes: Readonly<Record<BudgetEventType, true>> = {
  "budget.grant.denied": true,
  "budget.grant.reserved": true,
  "budget.grant.committed": true,
  "budget.grant.released": true
}

const resourceEventTypes: Readonly<Record<ResourceEventType, true>> = {
  "resource.ticket.cleanup": true
}

const configEventTypes: Readonly<Record<ConfigEventType, true>> = {
  "config.updated": true
}

const contextEventTypes: Readonly<Record<ContextEventType, true>> = {
  "context.compaction.planned": true,
  "context.compaction.applied": true,
  "context.compaction.skipped": true,
  "context.epoch.created": true,
  "context.epoch.activated": true,
  "context.epoch.superseded": true
}

const planEventTypes: Readonly<Record<PlanEventType, true>> = {
  "plan.proposal.created": true,
  "plan.proposal.operation_recorded": true
}

const objectiveEventTypes: Readonly<Record<ObjectiveEventType, true>> = {
  "objective.run.created": true,
  "objective.run.operation_recorded": true,
  "objective.attempt.recorded": true,
  "objective.verification.recorded": true
}

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
  return hasEventType(sessionEventTypes, type)
}

export function isSchedulerEventType(
  type: RuntimeEventType
): type is SchedulerEventType {
  return hasEventType(schedulerEventTypes, type)
}

export function isBudgetEventType(
  type: RuntimeEventType
): type is BudgetEventType {
  return hasEventType(budgetEventTypes, type)
}

export function isResourceEventType(
  type: RuntimeEventType
): type is ResourceEventType {
  return hasEventType(resourceEventTypes, type)
}

export function isConfigEventType(
  type: RuntimeEventType
): type is ConfigEventType {
  return hasEventType(configEventTypes, type)
}

export function isContextEventType(
  type: RuntimeEventType
): type is ContextEventType {
  return hasEventType(contextEventTypes, type)
}

export function isPlanEventType(
  type: RuntimeEventType
): type is PlanEventType {
  return hasEventType(planEventTypes, type)
}

export function isObjectiveEventType(
  type: RuntimeEventType
): type is ObjectiveEventType {
  return hasEventType(objectiveEventTypes, type)
}

export function eventHasFamily(
  event: RuntimeEvent,
  family: EventFamily
): boolean {
  return eventFamily(event.type) === family
}

function hasEventType<T extends string>(
  eventTypes: Readonly<Record<T, true>>,
  type: string
): type is T {
  return Object.hasOwn(eventTypes, type)
}
