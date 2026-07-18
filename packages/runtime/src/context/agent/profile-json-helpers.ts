import type { JsonValue } from "@wanex/protocol"

export function expectRecord(
  value: JsonValue,
  label: string
): Readonly<Record<string, JsonValue | undefined>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as Readonly<Record<string, JsonValue | undefined>>
}

export function expectString(
  value: JsonValue | undefined,
  label: string
): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`)
  }
  return value
}

export function expectBoolean(value: JsonValue, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean`)
  }
  return value
}

export function expectPositiveInteger(value: JsonValue, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`)
  }
  return value
}

export function expectStringArray(
  value: JsonValue,
  label: string
): readonly string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`)
  }
  if (value.length === 0) {
    throw new Error(`${label} must not be empty`)
  }
  return value.map((item) => expectString(item, label))
}
