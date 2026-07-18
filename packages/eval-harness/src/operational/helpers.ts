import { assert, isRecord } from "../scenario-utils.js"

export function expectRecord(value: unknown): Record<string, unknown> {
  assert(isRecord(value), "expected record")
  return value
}

export function expectArray(value: unknown): unknown[] {
  assert(Array.isArray(value), "expected array")
  return value
}

export function expectString(value: unknown): string {
  assert(typeof value === "string", "expected string")
  return value
}

export function expectStringArray(value: unknown): string[] {
  return expectArray(value).map(expectString)
}

export function payloadSessionId(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return undefined
  }
  const value = (payload as { readonly sessionId?: unknown }).sessionId
  return typeof value === "string" ? value : undefined
}
