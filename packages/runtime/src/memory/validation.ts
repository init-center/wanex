import type { JsonValue } from "@wanex/protocol"

export function isRecord(value: unknown): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function expectNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`)
  }
  return value
}

export function expectFiniteInteger(value: unknown, label: string): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value)
  ) {
    throw new Error(`${label} must be a finite integer`)
  }
  return value
}
