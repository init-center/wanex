import type { JsonValue } from "@wanex/protocol"
import type { JsonValue as StorageRpcJsonValue } from "./generated/storage-rpc.js"

export function toRpcJsonValue(value: JsonValue): StorageRpcJsonValue {
  if (Array.isArray(value)) {
    return value.map(toRpcJsonValue)
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, toRpcJsonValue(item)])
    )
  }
  return value
}

export function toRpcJsonValueFromUnknown(value: unknown): StorageRpcJsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("storage RPC JSON numbers must be finite")
    }
    return value
  }
  if (Array.isArray(value)) {
    return value.map(toRpcJsonValueFromUnknown)
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error("storage RPC JSON objects must be plain objects")
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        toRpcJsonValueFromUnknown(item)
      ])
    )
  }
  throw new Error(`value of type ${typeof value} is not storage RPC JSON`)
}

export function isRecord(value: unknown): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function assertArray(
  value: unknown,
  name: string
): asserts value is JsonValue[] {
  if (!Array.isArray(value)) {
    throw new Error(`${name} must be an array`)
  }
}

export function expectBoolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${name} must be a boolean`)
  }
  return value
}

export function expectJsonField(
  record: Record<string, JsonValue>,
  key: string,
  name: string
): JsonValue {
  const value = record[key]
  if (value === undefined) {
    throw new Error(`${name} must be present`)
  }
  return value
}

export function expectString(value: unknown, name: string): string {
  if (typeof value !== "string") {
    throw new Error(`${name} must be a string`)
  }
  return value
}

export function setOptionalString(
  target: Record<string, string>,
  key: string,
  value: unknown,
  name: string
): void {
  if (value === null || value === undefined) {
    return
  }
  target[key] = expectString(value, name)
}

export function expectNumber(value: unknown, name: string): number {
  if (typeof value !== "number") {
    throw new Error(`${name} must be a number`)
  }
  return value
}

export function expectArray(value: unknown, name: string): JsonValue[] {
  if (!Array.isArray(value)) {
    throw new Error(`${name} must be an array`)
  }
  return value
}

export function optionalString(value: unknown, name: string): string | undefined {
  if (value === null || value === undefined) {
    return undefined
  }
  return expectString(value, name)
}

export function expectOptionalStringArray(
  value: unknown,
  name: string
): readonly string[] | undefined {
  if (value === null || value === undefined) {
    return undefined
  }
  const values = expectArray(value, name)
  return values.map((item, index) => expectString(item, `${name}.${index}`))
}

export function optionalNumber(value: unknown, name: string): number | undefined {
  if (value === null || value === undefined) {
    return undefined
  }
  return expectNumber(value, name)
}

export function withOptionalFields<T extends object>(
  record: T,
  fields: Record<string, unknown>
): T {
  const writable = record as Record<string, unknown>
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      writable[key] = value
    }
  }
  return record
}
