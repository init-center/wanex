import type {
  ScheduleDefinitionReadResult,
  ScheduleDefinitionSummary,
  ScheduleMutationResult,
  ScheduleStatus,
  ScheduleTrigger,
} from "@wanex/product"
import type {
  Action,
  ScheduleActionOutput,
  ScheduleActionType,
  ScheduleSettingsViewModel,
  Snapshot,
} from "../model.js"
import type { SurfaceEnvelopeLike } from "../actions/model.js"

export function projectScheduleSettings(
  result: Snapshot["scheduleList"],
): ScheduleSettingsViewModel {
  if (!result.ok) {
    return {
      state: "failed",
      schedules: [],
      message: result.error.message,
    }
  }
  return {
    state: result.value.availability.state === "ready"
      ? "ready"
      : "unavailable",
    schedules: result.value.schedules,
    availability: result.value.availability,
    ...(result.value.availability.state === "unavailable"
      ? { message: "Schedules are not configured for this host." }
      : {}),
  }
}

export function formatScheduleTrigger(trigger: ScheduleTrigger): string {
  switch (trigger.kind) {
    case "once":
      return `Once · ${formatDateTime(trigger.at)}`
    case "interval":
      return `Every ${formatDuration(trigger.intervalMs)} · starts ${formatDateTime(trigger.anchorAt)}`
    case "cron":
      return `Cron · ${trigger.expression} · ${trigger.timeZone}`
  }
}

export function formatScheduleNextRun(status: ScheduleStatus): string {
  if (status.state === "disabled") return "Disabled"
  if (status.state === "running") return "Running now"
  if (status.state === "retrying") {
    return status.retryAt === undefined
      ? "Retrying"
      : `Retry at ${formatDateTime(status.retryAt)}`
  }
  if (status.state === "completed") return "Completed"
  return status.nextAt === undefined
    ? "Scheduled"
    : `Next · ${formatDateTime(status.nextAt)}`
}

export function formatScheduleOutcome(
  schedule: ScheduleDefinitionSummary,
): string {
  const outcome = schedule.status.lastOutcome
  if (outcome === undefined) return "No runs yet"
  if (outcome.kind === "submitted") {
    return `Last run · ${formatDateTime(outcome.settledAt)}`
  }
  return `Skipped · ${formatSkipReason(outcome.reason)}`
}

export function formatDateTime(value: number): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return "Unknown time"
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

export function formatDuration(intervalMs: number): string {
  if (intervalMs < 60_000) {
    const seconds = Math.round(intervalMs / 1_000)
    return `${seconds} second${seconds === 1 ? "" : "s"}`
  }
  const minutes = Math.round(intervalMs / 60_000)
  if (minutes > 0 && minutes % (60 * 24) === 0) {
    return `${minutes / (60 * 24)} day${minutes === 60 * 24 ? "" : "s"}`
  }
  if (minutes > 0 && minutes % 60 === 0) {
    return `${minutes / 60} hour${minutes === 60 ? "" : "s"}`
  }
  return `${minutes} minute${minutes === 1 ? "" : "s"}`
}

export function projectScheduleActionOutput(
  action: Action,
  result: SurfaceEnvelopeLike,
): ScheduleActionOutput | undefined {
  if (!isScheduleAction(action) || !result.ok || !isRecord(result.value)) {
    return undefined
  }
  if (action.type === "read-schedule") {
    if (![
      "product.schedule.found",
      "product.schedule.missing",
      "product.schedule.unavailable",
    ].includes(String(result.value.kind))) {
      return undefined
    }
    return {
      kind: "web.schedule-action",
      action: action.type,
      result: result.value as ScheduleDefinitionReadResult,
    }
  }
  if (![
    "product.schedule.applied",
    "product.schedule.conflict",
    "product.schedule.rejected",
  ].includes(String(result.value.kind))) {
    return undefined
  }
  return {
    kind: "web.schedule-action",
    action: action.type,
    result: result.value as unknown as ScheduleMutationResult,
  }
}

export function isScheduleAction(
  action: Action,
): action is Extract<Action, { readonly type: ScheduleActionType }> {
  return action.type === "read-schedule" ||
    action.type === "create-schedule" ||
    action.type === "replace-schedule" ||
    action.type === "set-schedule-enabled" ||
    action.type === "remove-schedule"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function formatSkipReason(reason: string | undefined): string {
  switch (reason) {
    case "previous_job_active":
      return "previous run active"
    case "misfire":
      return "missed window"
    case "superseded":
      return "superseded"
    default:
      return "policy"
  }
}
