import { createHash } from "node:crypto"

export const LOCAL_SCHEDULE_DEFINITION_PREFIX = "schedule.definition."
export const LOCAL_SCHEDULE_OCCURRENCE_PREFIX = "schedule.occurrence."

const SCHEDULE_ID_PATTERN = /^schedule_[a-f0-9]{32}$/u
const MAX_CURSOR_LENGTH = 512

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
  return `${LOCAL_SCHEDULE_OCCURRENCE_PREFIX}${request.scheduleId}.${request.definitionRevision}.${request.occurrenceAt}`
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
