import { createHash } from "node:crypto"
import type { ScheduleDefinitionSpec } from "@wanex/product/schedule"
import type { LocalScheduleExecutionIdentity } from "./model.js"

export const LOCAL_SCHEDULE_DEFINITION_PREFIX = "schedule.definition."
export const LOCAL_SCHEDULE_OCCURRENCE_PREFIX = "schedule.occurrence."
export const LOCAL_SCHEDULE_PENDING_PREFIX = "schedule.pending."

const SCHEDULE_ID_PATTERN = /^schedule_[a-f0-9]{32}$/u
const MAX_CURSOR_LENGTH = 512
const INTEGER_KEY_WIDTH = 16

export function deriveLocalScheduleIdentity(idempotencyKey: string): {
  readonly scheduleId: string
  readonly idempotencyDigest: string
} {
  const idempotencyDigest = createHash("sha256")
    .update(idempotencyKey, "utf8")
    .digest("hex")
  return {
    scheduleId: `schedule_${idempotencyDigest.slice(0, 32)}`,
    idempotencyDigest,
  }
}

export function isLocalScheduleId(value: string): boolean {
  return SCHEDULE_ID_PATTERN.test(value)
}

export function localScheduleDefinitionKey(scheduleId: string): string {
  requireLocalScheduleId(scheduleId)
  return `${LOCAL_SCHEDULE_DEFINITION_PREFIX}${scheduleId}`
}

export function localScheduleOccurrenceKey(request: {
  readonly scheduleId: string
  readonly definitionRevision: number
  readonly occurrenceAt: number
}): string {
  requireLocalScheduleId(request.scheduleId)
  requirePositiveInteger(request.definitionRevision, "definition revision")
  requireNonNegativeInteger(request.occurrenceAt, "occurrence time")
  return `${localScheduleOccurrencePrefix(request.scheduleId)}${paddedInteger(request.definitionRevision)}.${paddedInteger(request.occurrenceAt)}`
}

export function localScheduleOccurrencePrefix(scheduleId: string): string {
  requireLocalScheduleId(scheduleId)
  return `${LOCAL_SCHEDULE_OCCURRENCE_PREFIX}${scheduleId}.`
}

export function localSchedulePendingKey(scheduleId: string): string {
  requireLocalScheduleId(scheduleId)
  return `${LOCAL_SCHEDULE_PENDING_PREFIX}${scheduleId}`
}

export function deriveLocalScheduleExecutionIdentity(request: {
  readonly scheduleId: string
  readonly definitionRevision: number
  readonly occurrenceAt: number
  readonly definition: ScheduleDefinitionSpec
}): LocalScheduleExecutionIdentity {
  requireLocalScheduleId(request.scheduleId)
  requirePositiveInteger(request.definitionRevision, "definition revision")
  requireNonNegativeInteger(request.occurrenceAt, "occurrence time")
  const digest = createHash("sha256")
    .update(
      `${request.scheduleId}\0${request.definitionRevision}\0${request.occurrenceAt}`,
      "utf8"
    )
    .digest("hex")
  const suffix = digest.slice(0, 32)
  return {
    tickId: `tick_${suffix}`,
    sessionId:
      request.definition.sessionPolicy.kind === "reuse"
        ? request.definition.sessionPolicy.sessionId
        : `ses_schedule_${request.scheduleId.slice("schedule_".length)}`,
    inputId: `inp_schedule_${suffix}`,
    turnId: `turn_schedule_${suffix}`,
    jobId: `job_schedule_${suffix}`,
    idempotencyKey: `local-schedule-input:${digest}`,
    jobIdempotencyKey: `local-schedule-job:${digest}`,
  }
}

export function encodeLocalScheduleCursor(scheduleId: string): string {
  requireLocalScheduleId(scheduleId)
  return Buffer.from(JSON.stringify({ scheduleId }), "utf8").toString("base64url")
}

export function decodeLocalScheduleCursor(cursor: string | undefined): string | undefined {
  if (cursor === undefined) return undefined
  if (cursor.length === 0 || cursor.length > MAX_CURSOR_LENGTH) {
    throw new Error("Schedule cursor is invalid")
  }
  let value: unknown
  try {
    const bytes = Buffer.from(cursor, "base64url")
    if (bytes.toString("base64url") !== cursor) {
      throw new Error("non-canonical base64url")
    }
    value = JSON.parse(bytes.toString("utf8"))
  } catch {
    throw new Error("Schedule cursor is invalid")
  }
  if (!isRecord(value) || Object.keys(value).join(",") !== "scheduleId") {
    throw new Error("Schedule cursor is invalid")
  }
  if (typeof value.scheduleId !== "string" || !isLocalScheduleId(value.scheduleId)) {
    throw new Error("Schedule cursor is invalid")
  }
  return value.scheduleId
}

function requireLocalScheduleId(scheduleId: string): void {
  if (!isLocalScheduleId(scheduleId)) {
    throw new Error("Local Schedule ID is invalid")
  }
}

function requirePositiveInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive safe integer`)
  }
}

function requireNonNegativeInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative safe integer`)
  }
}

function paddedInteger(value: number): string {
  return String(value).padStart(INTEGER_KEY_WIDTH, "0")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
