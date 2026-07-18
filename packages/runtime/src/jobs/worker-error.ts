import type { JsonValue } from "@wanex/protocol"
import { WORKER_TIMEOUT_ERROR_NAME } from "./timeout.js"

export function workerFailurePayload(error: Error): JsonValue {
  return withOptionalErrorFields(
    {
      type: error.name === WORKER_TIMEOUT_ERROR_NAME ? "timeout" : "worker.error",
      message: error.message
    },
    {
      name: error.name,
      result: errorResult(error)
    }
  )
}

export function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error
  }
  return new Error(String(error))
}

function errorResult(error: Error): JsonValue | undefined {
  const maybe = error as Error & { readonly result?: unknown }
  return isJsonValue(maybe.result) ? maybe.result : undefined
}

function withOptionalErrorFields(
  base: Record<string, JsonValue>,
  optional: Record<string, JsonValue | undefined>
): JsonValue {
  return {
    ...base,
    ...Object.fromEntries(
      Object.entries(optional).filter((entry): entry is [string, JsonValue] => {
        return entry[1] !== undefined
      })
    )
  }
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
  if (typeof value === "object") {
    return Object.values(value).every(isJsonValue)
  }
  return false
}
