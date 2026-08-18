import type { JsonValue } from "@wanex/protocol"
import type {
  ConfigCompareAndApplyResult,
  ConfigConditionConflict,
  ConfigEntryRecord
} from "./types-runtime-core.js"
import {
  assertArray,
  expectBoolean,
  expectNumber,
  expectString,
  isRecord,
  toRpcJsonValueFromUnknown
} from "./codec-common.js"

export function fromRpcConfigEntry(value: unknown): ConfigEntryRecord {
  if (!isRecord(value)) {
    throw new Error("config entry must be an object")
  }
  const revision = positiveInteger(value.revision, "config entry revision")
  const updatedAt = expectNumber(value.updated_at, "config entry updated_at")
  return {
    key: expectString(value.key, "config entry key"),
    value: toRpcJsonValueFromUnknown(value.value) as JsonValue,
    revision,
    updatedAt
  }
}

export function fromRpcConfigCompareAndApplyResult(
  value: unknown
): ConfigCompareAndApplyResult {
  if (!isRecord(value)) {
    throw new Error("config compare-and-apply result must be an object")
  }
  const applied = expectBoolean(value.applied, "config compare-and-apply applied")
  assertArray(value.entries, "config compare-and-apply entries")
  assertArray(value.conflicts, "config compare-and-apply conflicts")
  const entries = value.entries.map(fromRpcConfigEntry)
  const conflicts = value.conflicts.map(fromRpcConfigConditionConflict)
  if (applied) {
    if (conflicts.length > 0) {
      throw new Error("applied config compare-and-apply result cannot contain conflicts")
    }
    return { kind: "applied", entries }
  }
  if (entries.length > 0 || conflicts.length === 0) {
    throw new Error("conflicted config compare-and-apply result has invalid evidence")
  }
  return { kind: "conflict", conflicts }
}

function fromRpcConfigConditionConflict(
  value: unknown
): ConfigConditionConflict {
  if (!isRecord(value)) {
    throw new Error("config condition conflict must be an object")
  }
  return {
    key: expectString(value.key, "config condition conflict key"),
    expectedRevision:
      value.expected_revision === null
        ? null
        : positiveInteger(
            value.expected_revision,
            "config condition expected revision"
          ),
    current: value.current === null ? null : fromRpcConfigEntry(value.current)
  }
}

function positiveInteger(value: unknown, label: string): number {
  const parsed = expectNumber(value, label)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive safe integer`)
  }
  return parsed
}
