import { describe, expect, it } from "vitest"
import type { ScheduleDefinition } from "@wanex/product/schedule"
import {
  latestOccurrenceAtOrBefore,
  nextOccurrenceAfter,
  planLocalScheduleRecurrence,
  validateLocalScheduleTrigger,
} from "../src/schedule/recurrence.js"

describe("Local Schedule recurrence", () => {
  it("calculates fixed intervals from their anchor without drift", () => {
    const trigger = {
      kind: "interval" as const,
      anchorAt: 1_000,
      intervalMs: 2_000,
    }
    expect(latestOccurrenceAtOrBefore(trigger, 999)).toBeNull()
    expect(latestOccurrenceAtOrBefore(trigger, 5_999)).toBe(5_000)
    expect(nextOccurrenceAfter(trigger, 5_000)).toBe(7_000)
    expect(nextOccurrenceAfter(trigger, 5_001)).toBe(7_000)
  })

  it("supports five-field and second-level six-field cron expressions", () => {
    expect(nextOccurrenceAfter({
      kind: "cron",
      expression: "* * * * *",
      timeZone: "UTC",
    }, Date.parse("2026-01-01T00:00:00.000Z"))).toBe(
      Date.parse("2026-01-01T00:01:00.000Z")
    )
    expect(nextOccurrenceAfter({
      kind: "cron",
      expression: "* * * * * *",
      timeZone: "UTC",
    }, Date.parse("2026-01-01T00:00:00.000Z"))).toBe(
      Date.parse("2026-01-01T00:00:01.000Z")
    )
    expect(latestOccurrenceAtOrBefore({
      kind: "cron",
      expression: "* * * * * *",
      timeZone: "UTC",
    }, Date.parse("2026-01-01T00:00:01.999Z"))).toBe(
      Date.parse("2026-01-01T00:00:01.000Z")
    )
  })

  it("uses explicit IANA DST semantics independent of the host time zone", () => {
    const spring = {
      kind: "cron" as const,
      expression: "30 2 * * *",
      timeZone: "America/New_York",
    }
    expect(nextOccurrenceAfter(
      spring,
      Date.parse("2026-03-08T00:00:00.000Z")
    )).toBe(Date.parse("2026-03-08T07:30:00.000Z"))

    const fall = {
      kind: "cron" as const,
      expression: "30 1 * * *",
      timeZone: "America/New_York",
    }
    expect(nextOccurrenceAfter(
      fall,
      Date.parse("2026-11-01T00:00:00.000Z")
    )).toBe(Date.parse("2026-11-01T05:30:00.000Z"))
    expect(nextOccurrenceAfter(
      fall,
      Date.parse("2026-11-01T05:30:00.000Z")
    )).toBe(Date.parse("2026-11-02T06:30:00.000Z"))
  })

  it("does not backfill recurring occurrences before the active revision", () => {
    const now = Date.parse("2026-01-01T12:35:00.000Z")
    const definition = scheduleDefinition({
      updatedAt: now,
      trigger: {
        kind: "cron",
        expression: "0 * * * *",
        timeZone: "UTC",
      },
    })
    expect(planLocalScheduleRecurrence({ definition, now })).toEqual({
      nextAt: Date.parse("2026-01-01T13:00:00.000Z"),
    })
    expect(planLocalScheduleRecurrence({
      definition,
      now: Date.parse("2026-01-01T13:00:00.500Z"),
    })).toEqual({
      due: {
        kind: "dispatch",
        occurrenceAt: Date.parse("2026-01-01T13:00:00.000Z"),
        timing: "on_time",
      },
      nextAt: Date.parse("2026-01-01T14:00:00.000Z"),
    })
  })

  it("applies fire-once and skip misfire policies without backlog replay", () => {
    const now = 20_000
    const fireOnce = scheduleDefinition({
      trigger: { kind: "interval", anchorAt: 1_000, intervalMs: 1_000 },
      updatedAt: 1_000,
      misfirePolicy: "fire_once",
    })
    expect(planLocalScheduleRecurrence({
      definition: fireOnce,
      now,
      misfireGraceMs: 500,
    })).toEqual({
      due: { kind: "dispatch", occurrenceAt: 20_000, timing: "on_time" },
      nextAt: 21_000,
    })
    expect(planLocalScheduleRecurrence({
      definition: { ...fireOnce, trigger: { kind: "once", at: 1_000 } },
      now,
      misfireGraceMs: 500,
    })).toEqual({
      due: { kind: "dispatch", occurrenceAt: 1_000, timing: "misfire" },
    })
    expect(planLocalScheduleRecurrence({
      definition: {
        ...fireOnce,
        trigger: { kind: "once", at: 1_000 },
        misfirePolicy: "skip",
      },
      now,
      misfireGraceMs: 500,
    })).toEqual({
      due: { kind: "skip", occurrenceAt: 1_000, reason: "misfire" },
    })
  })

  it("rejects invalid field counts, expressions, and time zones", () => {
    for (const trigger of [
      { kind: "cron" as const, expression: "* * * *", timeZone: "UTC" },
      { kind: "cron" as const, expression: "* * * * * * *", timeZone: "UTC" },
      { kind: "cron" as const, expression: "not a cron", timeZone: "UTC" },
      { kind: "cron" as const, expression: "* * * * *", timeZone: "Mars/Olympus" },
    ]) {
      expect(() => validateLocalScheduleTrigger(trigger)).toThrow()
    }
  })
})

function scheduleDefinition(
  overrides: Partial<ScheduleDefinition> = {}
): ScheduleDefinition {
  return {
    kind: "product.schedule-definition",
    scheduleId: "schedule_0123456789abcdef0123456789abcdef",
    prompt: "Run the task",
    enabled: true,
    trigger: { kind: "once", at: 1_000 },
    sessionPolicy: { kind: "isolated" },
    modelPolicy: { kind: "active" },
    overlapPolicy: "skip_if_running",
    misfirePolicy: "fire_once",
    revision: 1,
    createdAt: 1_000,
    updatedAt: 1_000,
    ...overrides,
  }
}
