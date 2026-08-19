import type {
  ScheduleDefinition,
  ScheduleDefinitionReadResult,
  ScheduleDefinitionSummary,
  ScheduleInvalidatedEvent,
  ScheduleListReadModel,
  ScheduleMutationResult,
  ScheduleStatus
} from "../../schedule/model.js"
import { isNonNegativeSafeInteger, isPositiveSafeInteger, isRecord } from "./common.js"

export function isScheduleListReadModel(
  value: unknown
): value is ScheduleListReadModel {
  return exactRecord(value, ["kind", "availability", "schedules", "nextCursor"]) &&
    value.kind === "product.schedule-list" &&
    isScheduleAvailability(value.availability) &&
    Array.isArray(value.schedules) &&
    value.schedules.every(isScheduleDefinitionSummary) &&
    optionalString(value.nextCursor)
}

export function isScheduleDefinitionReadResult(
  value: unknown
): value is ScheduleDefinitionReadResult {
  if (!isRecord(value)) return false
  if (value.kind === "product.schedule.found") {
    return exactRecord(value, ["kind", "definition", "status"]) &&
      isScheduleDefinition(value.definition) &&
      isScheduleStatus(value.status) &&
      value.status.scheduleId === value.definition.scheduleId &&
      value.status.definitionRevision === value.definition.revision
  }
  if (value.kind === "product.schedule.missing") {
    return exactRecord(value, ["kind", "scheduleId"]) && nonEmptyString(value.scheduleId)
  }
  return value.kind === "product.schedule.unavailable" &&
    exactRecord(value, ["kind", "availability"]) &&
    isScheduleAvailability(value.availability)
}

export function isScheduleMutationResult(value: unknown): value is ScheduleMutationResult {
  if (!isRecord(value)) return false
  if (value.kind === "product.schedule.applied") {
    if (value.operation === "remove") {
      return exactRecord(value, ["kind", "operation", "scheduleId", "revision"]) &&
        nonEmptyString(value.scheduleId) && isPositiveSafeInteger(value.revision)
    }
    return exactRecord(value, ["kind", "operation", "definition"]) &&
      (value.operation === "create" || value.operation === "replace" ||
        value.operation === "set_enabled") && isScheduleDefinition(value.definition)
  }
  if (value.kind === "product.schedule.conflict") {
    return exactRecord(value, [
      "kind",
      "operation",
      "reason",
      "scheduleId",
      "expectedRevision",
      "current",
      "message"
    ]) &&
      ["create", "replace", "set_enabled", "remove"].includes(String(value.operation)) &&
      ["not_found", "revision_conflict", "idempotency_conflict"].includes(String(value.reason)) &&
      optionalString(value.scheduleId) &&
      optionalPositiveInteger(value.expectedRevision) &&
      optionalDefinition(value.current) &&
      typeof value.message === "string"
  }
  if (value.kind === "product.schedule.rejected") {
    return exactRecord(value, ["kind", "operation", "reason", "message"]) &&
      ["create", "replace", "set_enabled", "remove"].includes(String(value.operation)) &&
      ["not_configured", "invalid_definition", "storage_failed", "disposed"].includes(String(value.reason)) &&
      typeof value.message === "string"
  }
  return false
}

export function isScheduleInvalidatedEvent(
  value: unknown
): value is ScheduleInvalidatedEvent {
  return exactRecord(value, ["kind", "sequence", "at", "revision"]) &&
    value.kind === "product.schedule.invalidated" &&
    isPositiveSafeInteger(value.sequence) &&
    isNonNegativeSafeInteger(value.at) &&
    isPositiveSafeInteger(value.revision)
}

function isScheduleDefinitionSummary(value: unknown): value is ScheduleDefinitionSummary {
  return exactRecord(value, [
    "kind",
    "scheduleId",
    "title",
    "enabled",
    "trigger",
    "revision",
    "updatedAt",
    "status"
  ]) &&
    value.kind === "product.schedule-summary" &&
    nonEmptyString(value.scheduleId) &&
    optionalString(value.title) &&
    typeof value.enabled === "boolean" &&
    isScheduleTrigger(value.trigger) &&
    isPositiveSafeInteger(value.revision) &&
    isNonNegativeSafeInteger(value.updatedAt) &&
    isScheduleStatus(value.status) &&
    value.status.scheduleId === value.scheduleId &&
    value.status.definitionRevision === value.revision
}

function isScheduleDefinition(value: unknown): value is ScheduleDefinition {
  return exactRecord(value, [
    "kind",
    "scheduleId",
    "title",
    "prompt",
    "enabled",
    "trigger",
    "sessionPolicy",
    "modelPolicy",
    "overlapPolicy",
    "misfirePolicy",
    "revision",
    "createdAt",
    "updatedAt"
  ]) &&
    value.kind === "product.schedule-definition" &&
    nonEmptyString(value.scheduleId) &&
    optionalString(value.title) &&
    typeof value.prompt === "string" &&
    typeof value.enabled === "boolean" &&
    isScheduleTrigger(value.trigger) &&
    isSessionPolicy(value.sessionPolicy) &&
    isModelPolicy(value.modelPolicy) &&
    value.overlapPolicy === "skip_if_running" &&
    (value.misfirePolicy === "fire_once" || value.misfirePolicy === "skip") &&
    isPositiveSafeInteger(value.revision) &&
    isNonNegativeSafeInteger(value.createdAt) &&
    isNonNegativeSafeInteger(value.updatedAt)
}

function isScheduleStatus(value: unknown): value is ScheduleStatus {
  if (!isRecord(value)) return false
  if (!exactRecord(value, [
    "kind",
    "scheduleId",
    "definitionRevision",
    "state",
    "nextAt",
    "retryAt",
    "lastOutcome"
  ])) return false
  if (value.kind !== "product.schedule-status" || !nonEmptyString(value.scheduleId) ||
    !isPositiveSafeInteger(value.definitionRevision)) return false
  if (!["disabled", "scheduled", "running", "retrying", "completed"].includes(String(value.state))) {
    return false
  }
  if (value.state === "scheduled" && !isNonNegativeSafeInteger(value.nextAt)) return false
  if (value.state === "retrying" && !isNonNegativeSafeInteger(value.retryAt)) return false
  if (value.state !== "scheduled" && value.nextAt !== undefined) return false
  if (value.state !== "retrying" && value.retryAt !== undefined) return false
  if (value.state === "completed" && value.lastOutcome === undefined) return false
  return value.lastOutcome === undefined || isLastOutcome(value.lastOutcome)
}

function isLastOutcome(value: unknown): boolean {
  return exactRecord(value, ["kind", "occurrenceAt", "settledAt", "reason"]) &&
    (value.kind === "submitted" || value.kind === "skipped") &&
    isNonNegativeSafeInteger(value.occurrenceAt) &&
    isNonNegativeSafeInteger(value.settledAt) &&
    (value.kind === "submitted"
      ? value.reason === undefined
      : ["misfire", "previous_job_active", "superseded"].includes(String(value.reason)))
}

function isScheduleTrigger(value: unknown): boolean {
  if (!isRecord(value)) return false
  if (value.kind === "once") {
    return exactRecord(value, ["kind", "at"]) && isNonNegativeSafeInteger(value.at)
  }
  if (value.kind === "interval") {
    return exactRecord(value, ["kind", "anchorAt", "intervalMs"]) &&
      isNonNegativeSafeInteger(value.anchorAt) && isPositiveSafeInteger(value.intervalMs)
  }
  return value.kind === "cron" &&
    exactRecord(value, ["kind", "expression", "timeZone"]) &&
    nonEmptyString(value.expression) && nonEmptyString(value.timeZone)
}

function isSessionPolicy(value: unknown): boolean {
  if (!isRecord(value)) return false
  if (value.kind === "isolated") return exactRecord(value, ["kind"])
  return value.kind === "reuse" && exactRecord(value, ["kind", "sessionId"]) &&
    nonEmptyString(value.sessionId)
}

function isModelPolicy(value: unknown): boolean {
  if (!isRecord(value)) return false
  if (value.kind === "active") return exactRecord(value, ["kind"])
  return value.kind === "pinned" && exactRecord(value, ["kind", "endpointId"]) &&
    nonEmptyString(value.endpointId)
}

function isScheduleAvailability(value: unknown): boolean {
  return exactRecord(value, ["kind", "state", "reason", "capabilities"]) &&
    value.kind === "product.schedule-availability" &&
    ((value.state === "ready" && value.reason === "configured") ||
      (value.state === "unavailable" && value.reason === "not_configured")) &&
    exactRecord(value.capabilities, [
      "canList",
      "canCreate",
      "canEdit",
      "canSetEnabled",
      "canRemove"
    ]) &&
    typeof value.capabilities.canList === "boolean" &&
    typeof value.capabilities.canCreate === "boolean" &&
    typeof value.capabilities.canEdit === "boolean" &&
    typeof value.capabilities.canSetEnabled === "boolean" &&
    typeof value.capabilities.canRemove === "boolean"
}

function optionalDefinition(value: unknown): boolean {
  return value === undefined || isScheduleDefinition(value)
}

function optionalString(value: unknown): boolean {
  return value === undefined || nonEmptyString(value)
}

function optionalPositiveInteger(value: unknown): boolean {
  return value === undefined || isPositiveSafeInteger(value)
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

function exactRecord(
  value: unknown,
  keys: readonly string[]
): value is Record<string, unknown> {
  return isRecord(value) && Object.keys(value).every((key) => keys.includes(key))
}
