import type { JsonValue } from "@wanex/protocol"

export function inputRecord(input: JsonValue): Record<string, JsonValue> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("workspace tool input must be an object")
  }
  return input as Record<string, JsonValue>
}

export function requiredString(
  record: Record<string, JsonValue>,
  field: string
): string {
  const value = record[field]
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`workspace tool ${field} must be a non-empty string`)
  }
  return value
}

export function optionalString(
  record: Record<string, JsonValue>,
  field: string
): string | undefined {
  const value = record[field]
  if (value === undefined) return undefined
  if (typeof value !== "string") {
    throw new Error(`workspace tool ${field} must be a string`)
  }
  return value
}

export function optionalPositiveInteger(
  record: Record<string, JsonValue>,
  field: string
): number | undefined {
  const value = record[field]
  if (value === undefined) return undefined
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new Error(`workspace tool ${field} must be a positive integer`)
  }
  return value as number
}

export function stringArray(
  record: Record<string, JsonValue>,
  field: string
): string[] {
  const value = record[field]
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`workspace tool ${field} must be a string array`)
  }
  return value as string[]
}
