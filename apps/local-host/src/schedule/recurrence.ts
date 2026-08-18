import { Cron } from "croner"
import type {
  ScheduleDefinition,
  ScheduleDefinitionSpec,
  ScheduleTrigger,
} from "@wanex/product/schedule"

export const DEFAULT_SCHEDULE_MISFIRE_GRACE_MS = 5_000

const CRON_MODE = "5-or-6-parts" as const
const MAX_DATE_MS = 8_640_000_000_000_000

export type LocalScheduleDueOccurrence =
  | {
      readonly kind: "dispatch"
      readonly occurrenceAt: number
      readonly timing: "on_time" | "misfire"
    }
  | {
      readonly kind: "skip"
      readonly occurrenceAt: number
      readonly reason: "misfire"
    }

export interface LocalScheduleRecurrencePlan {
  readonly due?: LocalScheduleDueOccurrence
  readonly nextAt?: number
}

export function validateLocalScheduleDefinitionSpec(
  definition: ScheduleDefinitionSpec
): void {
  validateLocalScheduleTrigger(definition.trigger)
}

export function validateLocalScheduleTrigger(trigger: ScheduleTrigger): void {
  if (trigger.kind !== "cron") return
  createCron(trigger).nextRun(new Date(0))
}

export function planLocalScheduleRecurrence(request: {
  readonly definition: ScheduleDefinition
  readonly now: number
  readonly misfireGraceMs?: number
}): LocalScheduleRecurrencePlan {
  const now = nonNegativeSafeInteger(request.now, "Schedule planning time")
  const misfireGraceMs = nonNegativeSafeInteger(
    request.misfireGraceMs ?? DEFAULT_SCHEDULE_MISFIRE_GRACE_MS,
    "Schedule misfire grace"
  )
  if (!request.definition.enabled) return {}

  const latest = latestOccurrenceAtOrBefore(request.definition.trigger, now)
  const eligibleLatest =
    latest !== null && occurrenceIsActive(request.definition, latest)
      ? latest
      : null
  const next = nextOccurrenceAfter(request.definition.trigger, now)
  const due =
    eligibleLatest === null
      ? undefined
      : dueOccurrence(request.definition, eligibleLatest, now, misfireGraceMs)
  return {
    ...(due === undefined ? {} : { due }),
    ...(next === null ? {} : { nextAt: next }),
  }
}

export function latestOccurrenceAtOrBefore(
  trigger: ScheduleTrigger,
  at: number
): number | null {
  const reference = nonNegativeSafeInteger(at, "Schedule occurrence reference")
  if (trigger.kind === "once") return trigger.at <= reference ? trigger.at : null
  if (trigger.kind === "interval") {
    if (reference < trigger.anchorAt) return null
    const steps = Math.floor(
      (reference - trigger.anchorAt) / trigger.intervalMs
    )
    return safeOccurrence(trigger.anchorAt, steps, trigger.intervalMs)
  }

  const cron = createCron(trigger)
  const nextSecondBoundary =
    Math.floor(reference / 1_000) * 1_000 + 1_000
  if (nextSecondBoundary > MAX_DATE_MS) return null
  return cron.previousRuns(1, new Date(nextSecondBoundary))[0]?.getTime() ?? null
}

export function nextOccurrenceAfter(
  trigger: ScheduleTrigger,
  after: number
): number | null {
  const reference = nonNegativeSafeInteger(after, "Schedule occurrence reference")
  if (trigger.kind === "once") return trigger.at > reference ? trigger.at : null
  if (trigger.kind === "interval") {
    if (reference < trigger.anchorAt) return trigger.anchorAt
    const steps = Math.floor(
      (reference - trigger.anchorAt) / trigger.intervalMs
    ) + 1
    return safeOccurrence(trigger.anchorAt, steps, trigger.intervalMs)
  }
  if (reference > MAX_DATE_MS) return null
  return createCron(trigger).nextRun(new Date(reference))?.getTime() ?? null
}

function occurrenceIsActive(
  definition: ScheduleDefinition,
  occurrenceAt: number
): boolean {
  return definition.trigger.kind === "once" || occurrenceAt >= definition.updatedAt
}

function dueOccurrence(
  definition: ScheduleDefinition,
  occurrenceAt: number,
  now: number,
  misfireGraceMs: number
): LocalScheduleDueOccurrence {
  const misfired = now - occurrenceAt > misfireGraceMs
  if (!misfired) {
    return { kind: "dispatch", occurrenceAt, timing: "on_time" }
  }
  return definition.misfirePolicy === "fire_once"
    ? { kind: "dispatch", occurrenceAt, timing: "misfire" }
    : { kind: "skip", occurrenceAt, reason: "misfire" }
}

function createCron(trigger: Extract<ScheduleTrigger, { kind: "cron" }>): Cron {
  return new Cron(trigger.expression, {
    timezone: trigger.timeZone,
    paused: true,
    mode: CRON_MODE,
  })
}

function safeOccurrence(
  anchorAt: number,
  steps: number,
  intervalMs: number
): number | null {
  const value = anchorAt + steps * intervalMs
  return Number.isSafeInteger(value) ? value : null
}

function nonNegativeSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`)
  }
  return value
}
