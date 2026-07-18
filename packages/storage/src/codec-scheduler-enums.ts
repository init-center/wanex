import type {
  SchedulerJobKind,
  SchedulerJobRecord,
  SchedulerJobState
} from "@wanex/protocol"
import {
  expectString,
  isRecord,
  optionalNumber,
  withOptionalFields
} from "./codec-common.js"

export function expectRetryPolicy(
  value: unknown,
  name: string
): SchedulerJobRecord["retryPolicy"] {
  if (!isRecord(value)) {
    throw new Error(`${name} must be an object`)
  }
  const strategy = expectString(value.strategy, `${name}.strategy`)
  if (
    strategy !== "none" &&
    strategy !== "fixed" &&
    strategy !== "exponential"
  ) {
    throw new Error(`invalid retry strategy: ${strategy}`)
  }
  return withOptionalFields(
    { strategy },
    {
      initialDelayMs: optionalNumber(
        value.initial_delay_ms,
        `${name}.initial_delay_ms`
      ),
      maxDelayMs: optionalNumber(value.max_delay_ms, `${name}.max_delay_ms`)
    }
  )
}

export function expectSchedulerJobKind(value: unknown): SchedulerJobKind {
  const kind = expectString(value, "job.kind")
  if (
    kind !== "session.run" &&
    kind !== "workspace.task" &&
    kind !== "team.delivery" &&
    kind !== "team.round.close" &&
    kind !== "plugin.action" &&
    kind !== "channel.delivery" &&
    kind !== "tool.deferred_result" &&
    kind !== "gateway.delivery" &&
    kind !== "memory.compaction" &&
    kind !== "resource.cleanup" &&
    kind !== "budget.grant_expire" &&
    kind !== "provider.retry" &&
    kind !== "config.sync"
  ) {
    throw new Error(`invalid scheduler job kind: ${kind}`)
  }
  return kind
}

export function expectSchedulerJobState(value: unknown): SchedulerJobState {
  const state = expectString(value, "job.state")
  if (
    state !== "pending" &&
    state !== "ready" &&
    state !== "running" &&
    state !== "succeeded" &&
    state !== "retry_scheduled" &&
    state !== "failed" &&
    state !== "cancelled"
  ) {
    throw new Error(`invalid scheduler job state: ${state}`)
  }
  return state
}
