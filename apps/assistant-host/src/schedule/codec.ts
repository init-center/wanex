import type { JsonValue } from "@wanex/protocol"
import type {
  ScheduleDefinition,
  ScheduleDefinitionSpec,
  ScheduleMisfirePolicy,
  ScheduleModelPolicy,
  ScheduleSessionPolicy,
  ScheduleTrigger,
} from "@wanex/assistant/schedule"
import type { ConfigEntryRecord } from "@wanex/storage"
import {
  deriveLocalScheduleExecutionIdentity,
  localScheduleDefinitionKey,
  localScheduleOccurrenceKey,
  localSchedulePendingKey,
} from "./identity.js"
import type {
  LocalScheduleDefinitionRecord,
  LocalScheduleExecutionIdentity,
  LocalScheduleOccurrence,
  LocalScheduleOccurrenceDelivery,
  LocalScheduleOccurrenceRecord,
  LocalSchedulePendingEntry,
  LocalSchedulePendingRecord,
} from "./model.js"

export function encodeLocalScheduleDefinitionRecord(
  record: LocalScheduleDefinitionRecord
): JsonValue {
  return {
    kind: record.kind,
    scheduleId: record.scheduleId,
    idempotencyDigest: record.idempotencyDigest,
    definition: encodeDefinitionSpec(record.definition),
    createdAt: record.createdAt,
  }
}

export function decodeLocalScheduleDefinitionEntry(
  entry: ConfigEntryRecord
): {
  readonly record: LocalScheduleDefinitionRecord
  readonly definition: ScheduleDefinition
} {
  const value = exactRecord(entry.value, "Schedule definition record", [
    "createdAt",
    "definition",
    "idempotencyDigest",
    "kind",
    "scheduleId",
  ])
  if (value.kind !== "local.schedule-definition") {
    throw new Error("Schedule definition record kind is invalid")
  }
  const scheduleId = requiredString(value.scheduleId, "Schedule ID")
  if (entry.key !== localScheduleDefinitionKey(scheduleId)) {
    throw new Error("Schedule definition key does not match its record")
  }
  const record: LocalScheduleDefinitionRecord = {
    kind: "local.schedule-definition",
    scheduleId,
    idempotencyDigest: sha256(value.idempotencyDigest, "Schedule idempotency digest"),
    definition: decodeDefinitionSpec(value.definition),
    createdAt: nonNegativeInteger(value.createdAt, "Schedule createdAt"),
  }
  return {
    record,
    definition: {
      kind: "assistant.schedule-definition",
      scheduleId,
      ...record.definition,
      revision: positiveInteger(entry.revision, "Schedule revision"),
      createdAt: record.createdAt,
      updatedAt: nonNegativeInteger(entry.updatedAt, "Schedule updatedAt"),
    },
  }
}

export function encodeLocalScheduleOccurrenceRecord(
  record: LocalScheduleOccurrenceRecord
): JsonValue {
  return {
    kind: record.kind,
    scheduleId: record.scheduleId,
    definitionRevision: record.definitionRevision,
    occurrenceAt: record.occurrenceAt,
    definition: encodeDefinitionSpec(record.definition),
    execution: encodeExecutionIdentity(record.execution),
    claimedAt: record.claimedAt,
    delivery: encodeOccurrenceDelivery(record.delivery),
  }
}

export function decodeLocalScheduleOccurrenceEntry(
  entry: ConfigEntryRecord
): LocalScheduleOccurrence {
  const value = exactRecord(entry.value, "Schedule occurrence record", [
    "claimedAt",
    "definition",
    "definitionRevision",
    "delivery",
    "execution",
    "kind",
    "occurrenceAt",
    "scheduleId",
  ])
  if (value.kind !== "local.schedule-occurrence") {
    throw new Error("Schedule occurrence record kind is invalid")
  }
  const record: LocalScheduleOccurrenceRecord = {
    kind: "local.schedule-occurrence",
    scheduleId: requiredString(value.scheduleId, "Schedule occurrence ID"),
    definitionRevision: positiveInteger(
      value.definitionRevision,
      "Schedule occurrence definition revision"
    ),
    occurrenceAt: nonNegativeInteger(
      value.occurrenceAt,
      "Schedule occurrence time"
    ),
    definition: decodeDefinitionSpec(value.definition),
    execution: decodeExecutionIdentity(value.execution),
    claimedAt: nonNegativeInteger(value.claimedAt, "Schedule claim time"),
    delivery: decodeOccurrenceDelivery(value.delivery),
  }
  if (entry.key !== localScheduleOccurrenceKey(record)) {
    throw new Error("Schedule occurrence key does not match its record")
  }
  const expectedExecution = deriveLocalScheduleExecutionIdentity(record)
  if (!executionIdentitiesEqual(record.execution, expectedExecution)) {
    throw new Error("Schedule occurrence execution identity is invalid")
  }
  return {
    record,
    revision: positiveInteger(entry.revision, "Schedule occurrence revision"),
    updatedAt: nonNegativeInteger(entry.updatedAt, "Schedule occurrence updatedAt"),
  }
}

export function encodeLocalSchedulePendingRecord(
  record: LocalSchedulePendingRecord
): JsonValue {
  return {
    kind: record.kind,
    scheduleId: record.scheduleId,
    occurrenceKey: record.occurrenceKey,
  }
}

export function decodeLocalSchedulePendingEntry(
  entry: ConfigEntryRecord
): LocalSchedulePendingEntry {
  const value = exactRecord(entry.value, "Schedule pending record", [
    "kind",
    "occurrenceKey",
    "scheduleId",
  ])
  if (value.kind !== "local.schedule-pending") {
    throw new Error("Schedule pending record kind is invalid")
  }
  const scheduleId = requiredString(value.scheduleId, "Schedule pending ID")
  const occurrenceKey = requiredString(
    value.occurrenceKey,
    "Schedule pending occurrence key"
  )
  if (entry.key !== localSchedulePendingKey(scheduleId)) {
    throw new Error("Schedule pending key does not match its record")
  }
  if (!occurrenceKey.startsWith(`schedule.occurrence.${scheduleId}.`)) {
    throw new Error("Schedule pending occurrence is outside its namespace")
  }
  return {
    record: {
      kind: "local.schedule-pending",
      scheduleId,
      occurrenceKey,
    },
    revision: positiveInteger(entry.revision, "Schedule pending revision"),
    updatedAt: nonNegativeInteger(entry.updatedAt, "Schedule pending updatedAt"),
  }
}

export function localScheduleDefinitionSpecsEqual(
  left: ScheduleDefinitionSpec,
  right: ScheduleDefinitionSpec
): boolean {
  return JSON.stringify(encodeDefinitionSpec(left)) === JSON.stringify(encodeDefinitionSpec(right))
}

function encodeDefinitionSpec(spec: ScheduleDefinitionSpec): JsonValue {
  return {
    title: spec.title ?? null,
    prompt: spec.prompt,
    enabled: spec.enabled,
    trigger: encodeTrigger(spec.trigger),
    sessionPolicy: encodeSessionPolicy(spec.sessionPolicy),
    modelPolicy: encodeModelPolicy(spec.modelPolicy),
    overlapPolicy: spec.overlapPolicy,
    misfirePolicy: spec.misfirePolicy,
  }
}

function encodeExecutionIdentity(
  identity: LocalScheduleExecutionIdentity
): JsonValue {
  return {
    tickId: identity.tickId,
    sessionId: identity.sessionId,
    inputId: identity.inputId,
    turnId: identity.turnId,
    jobId: identity.jobId,
    idempotencyKey: identity.idempotencyKey,
    jobIdempotencyKey: identity.jobIdempotencyKey,
  }
}

function decodeExecutionIdentity(value: unknown): LocalScheduleExecutionIdentity {
  const record = exactRecord(value, "Schedule execution identity", [
    "idempotencyKey",
    "inputId",
    "jobId",
    "jobIdempotencyKey",
    "sessionId",
    "tickId",
    "turnId",
  ])
  return {
    tickId: requiredString(record.tickId, "Schedule tick ID"),
    sessionId: requiredString(record.sessionId, "Schedule execution Session ID"),
    inputId: requiredString(record.inputId, "Schedule execution input ID"),
    turnId: requiredString(record.turnId, "Schedule execution Turn ID"),
    jobId: requiredString(record.jobId, "Schedule execution Job ID"),
    idempotencyKey: requiredString(
      record.idempotencyKey,
      "Schedule execution idempotency key"
    ),
    jobIdempotencyKey: requiredString(
      record.jobIdempotencyKey,
      "Schedule execution Job idempotency key"
    ),
  }
}

function encodeOccurrenceDelivery(
  delivery: LocalScheduleOccurrenceDelivery
): JsonValue {
  if (delivery.state === "pending") {
    return {
      state: "pending",
      attempts: delivery.attempts,
      nextAttemptAt: delivery.nextAttemptAt,
      lastFailure: delivery.lastFailure ?? null,
    }
  }
  if (delivery.state === "submitted") {
    return { ...delivery }
  }
  return {
    state: "skipped",
    reason: delivery.reason,
    settledAt: delivery.settledAt,
    previousJobId: delivery.previousJobId ?? null,
  }
}

function decodeOccurrenceDelivery(value: unknown): LocalScheduleOccurrenceDelivery {
  const record = recordValue(value, "Schedule occurrence delivery")
  if (record.state === "pending") {
    exactKeys(record, "Schedule pending delivery", [
      "attempts",
      "lastFailure",
      "nextAttemptAt",
      "state",
    ])
    const lastFailure = decodeLastFailure(record.lastFailure)
    return {
      state: "pending",
      attempts: nonNegativeInteger(record.attempts, "Schedule delivery attempts"),
      nextAttemptAt: nonNegativeInteger(
        record.nextAttemptAt,
        "Schedule delivery next attempt"
      ),
      ...(lastFailure === undefined ? {} : { lastFailure }),
    }
  }
  if (record.state === "submitted") {
    exactKeys(record, "Schedule submitted delivery", [
      "inputId",
      "jobId",
      "sessionId",
      "settledAt",
      "state",
      "submittedAt",
      "turnId",
    ])
    return {
      state: "submitted",
      settledAt: nonNegativeInteger(record.settledAt, "Schedule settledAt"),
      sessionId: requiredString(record.sessionId, "Schedule submitted Session ID"),
      inputId: requiredString(record.inputId, "Schedule submitted input ID"),
      turnId: requiredString(record.turnId, "Schedule submitted Turn ID"),
      jobId: requiredString(record.jobId, "Schedule submitted Job ID"),
      submittedAt: nonNegativeInteger(record.submittedAt, "Schedule submittedAt"),
    }
  }
  if (record.state === "skipped") {
    exactKeys(record, "Schedule skipped delivery", [
      "previousJobId",
      "reason",
      "settledAt",
      "state",
    ])
    if (
      record.reason !== "misfire" &&
      record.reason !== "previous_job_active" &&
      record.reason !== "superseded"
    ) {
      throw new Error("Schedule skipped reason is invalid")
    }
    const previousJobId = optionalString(
      record.previousJobId,
      "Schedule previous Job ID"
    )
    return {
      state: "skipped",
      reason: record.reason,
      settledAt: nonNegativeInteger(record.settledAt, "Schedule settledAt"),
      ...(previousJobId === undefined ? {} : { previousJobId }),
    }
  }
  throw new Error("Schedule occurrence delivery state is invalid")
}

function decodeLastFailure(value: unknown):
  | { readonly kind: "submission_failed"; readonly at: number }
  | undefined {
  if (value === null) return undefined
  const record = exactRecord(value, "Schedule delivery failure", ["at", "kind"])
  if (record.kind !== "submission_failed") {
    throw new Error("Schedule delivery failure kind is invalid")
  }
  return {
    kind: "submission_failed",
    at: nonNegativeInteger(record.at, "Schedule delivery failure time"),
  }
}

function executionIdentitiesEqual(
  left: LocalScheduleExecutionIdentity,
  right: LocalScheduleExecutionIdentity
): boolean {
  return JSON.stringify(encodeExecutionIdentity(left)) ===
    JSON.stringify(encodeExecutionIdentity(right))
}

function decodeDefinitionSpec(value: unknown): ScheduleDefinitionSpec {
  const record = exactRecord(value, "Schedule definition", [
    "enabled",
    "misfirePolicy",
    "modelPolicy",
    "overlapPolicy",
    "prompt",
    "sessionPolicy",
    "title",
    "trigger",
  ])
  if (typeof record.enabled !== "boolean") {
    throw new Error("Schedule definition enabled is invalid")
  }
  if (record.overlapPolicy !== "skip_if_running") {
    throw new Error("Schedule overlap policy is invalid")
  }
  const title = optionalString(record.title, "Schedule title")
  return {
    ...(title === undefined ? {} : { title }),
    prompt: requiredString(record.prompt, "Schedule prompt"),
    enabled: record.enabled,
    trigger: decodeTrigger(record.trigger),
    sessionPolicy: decodeSessionPolicy(record.sessionPolicy),
    modelPolicy: decodeModelPolicy(record.modelPolicy),
    overlapPolicy: "skip_if_running",
    misfirePolicy: decodeMisfirePolicy(record.misfirePolicy),
  }
}

function encodeTrigger(trigger: ScheduleTrigger): JsonValue {
  if (trigger.kind === "once") return { kind: "once", at: trigger.at }
  if (trigger.kind === "interval") {
    return {
      kind: "interval",
      anchorAt: trigger.anchorAt,
      intervalMs: trigger.intervalMs,
    }
  }
  return {
    kind: "cron",
    expression: trigger.expression,
    timeZone: trigger.timeZone,
  }
}

function decodeTrigger(value: unknown): ScheduleTrigger {
  const record = recordValue(value, "Schedule trigger")
  if (record.kind === "once") {
    exactKeys(record, "Schedule once trigger", ["at", "kind"])
    return {
      kind: "once",
      at: nonNegativeInteger(record.at, "Schedule once time"),
    }
  }
  if (record.kind === "interval") {
    exactKeys(record, "Schedule interval trigger", ["anchorAt", "intervalMs", "kind"])
    const intervalMs = positiveInteger(record.intervalMs, "Schedule interval")
    if (intervalMs < 1_000) throw new Error("Schedule interval is below one second")
    return {
      kind: "interval",
      anchorAt: nonNegativeInteger(record.anchorAt, "Schedule interval anchor"),
      intervalMs,
    }
  }
  if (record.kind === "cron") {
    exactKeys(record, "Schedule cron trigger", ["expression", "kind", "timeZone"])
    return {
      kind: "cron",
      expression: requiredString(record.expression, "Schedule cron expression"),
      timeZone: requiredString(record.timeZone, "Schedule timeZone"),
    }
  }
  throw new Error("Schedule trigger kind is invalid")
}

function encodeSessionPolicy(policy: ScheduleSessionPolicy): JsonValue {
  return policy.kind === "isolated"
    ? { kind: "isolated" }
    : { kind: "reuse", sessionId: policy.sessionId }
}

function decodeSessionPolicy(value: unknown): ScheduleSessionPolicy {
  const record = recordValue(value, "Schedule session policy")
  if (record.kind === "isolated") {
    exactKeys(record, "Schedule isolated session policy", ["kind"])
    return { kind: "isolated" }
  }
  if (record.kind === "reuse") {
    exactKeys(record, "Schedule reused session policy", ["kind", "sessionId"])
    return {
      kind: "reuse",
      sessionId: requiredString(record.sessionId, "Schedule session ID"),
    }
  }
  throw new Error("Schedule session policy kind is invalid")
}

function encodeModelPolicy(policy: ScheduleModelPolicy): JsonValue {
  return policy.kind === "active"
    ? { kind: "active" }
    : { kind: "pinned", endpointId: policy.endpointId }
}

function decodeModelPolicy(value: unknown): ScheduleModelPolicy {
  const record = recordValue(value, "Schedule model policy")
  if (record.kind === "active") {
    exactKeys(record, "Schedule active model policy", ["kind"])
    return { kind: "active" }
  }
  if (record.kind === "pinned") {
    exactKeys(record, "Schedule pinned model policy", ["endpointId", "kind"])
    return {
      kind: "pinned",
      endpointId: requiredString(record.endpointId, "Schedule endpoint ID"),
    }
  }
  throw new Error("Schedule model policy kind is invalid")
}

function decodeMisfirePolicy(value: unknown): ScheduleMisfirePolicy {
  if (value === "fire_once" || value === "skip") return value
  throw new Error("Schedule misfire policy is invalid")
}

function exactRecord(
  value: unknown,
  label: string,
  keys: readonly string[]
): Record<string, unknown> {
  const record = recordValue(value, label)
  exactKeys(record, label, keys)
  return record
}

function recordValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function exactKeys(
  value: Record<string, unknown>,
  label: string,
  keys: readonly string[]
): void {
  if (Object.keys(value).sort().join(",") !== [...keys].sort().join(",")) {
    throw new Error(`${label} fields are invalid`)
  }
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`)
  }
  return value
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === null) return undefined
  return requiredString(value, label)
}

function sha256(value: unknown, label: string): string {
  const digest = requiredString(value, label)
  if (!/^[a-f0-9]{64}$/u.test(digest)) throw new Error(`${label} is invalid`)
  return digest
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new Error(`${label} must be a positive safe integer`)
  }
  return value as number
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a non-negative safe integer`)
  }
  return value as number
}
