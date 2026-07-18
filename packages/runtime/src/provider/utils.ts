import type { JsonValue } from "@wanex/protocol"

export function expectRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

export function expectString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string`)
  }
  return value
}

export function optionalString(value: unknown, label: string): string | undefined {
  return value === undefined || value === null ? undefined : expectString(value, label)
}

export function optionalNumber(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null) {
    return undefined
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`)
  }
  return value
}

export function jsonMetadata(
  record: Record<string, unknown>,
  known: readonly string[]
): Readonly<Record<string, JsonValue>> | undefined {
  const entries = Object.entries(record).filter(
    ([key, value]) => !known.includes(key) && isJsonValue(value)
  ) as Array<[string, JsonValue]>
  return entries.length === 0 ? undefined : Object.fromEntries(entries)
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue)
  }
  return (
    typeof value === "object" &&
    value !== null &&
    Object.values(value).every(isJsonValue)
  )
}
