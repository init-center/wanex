import type { JsonValue, RuntimeEvent } from "@wanex/protocol"
import type {
  ConfigReloadCandidateResult,
  ConfigReloadError,
  ConfigReloadResult
} from "./hot-reload-types.js"

export function normalizeConfigReloadResult(options: {
  readonly key: string
  readonly subscriptionId: string
  readonly generation: number
  readonly committed: boolean
  readonly event?: RuntimeEvent
  readonly result: ConfigReloadCandidateResult
}): ConfigReloadResult {
  return {
    key: options.key,
    subscriptionId: options.subscriptionId,
    reloaded: options.result.reloaded,
    generation: options.generation,
    committed: options.committed,
    at: Date.now(),
    ...(options.event === undefined ? {} : { eventId: options.event.id }),
    ...(options.result.reason === undefined
      ? {}
      : { reason: options.result.reason }),
    ...(options.result.detail === undefined
      ? {}
      : { detail: sanitizeJson(options.result.detail) })
  }
}

export function normalizeConfigReloadError(options: {
  readonly key: string
  readonly subscriptionId: string
  readonly stage: ConfigReloadError["stage"]
  readonly event?: RuntimeEvent
  readonly error: unknown
}): ConfigReloadError {
  const error =
    options.error instanceof Error
      ? options.error
      : new Error(String(options.error))
  return {
    key: options.key,
    subscriptionId: options.subscriptionId,
    stage: options.stage,
    error: {
      name: error.name,
      message: error.message
    },
    at: Date.now(),
    ...(options.event === undefined ? {} : { eventId: options.event.id })
  }
}

function sanitizeJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJson(item))
  }
  if (value !== null && typeof value === "object") {
    const sanitized: Record<string, JsonValue> = {}
    for (const [key, nested] of Object.entries(value)) {
      if (key === "apiKey" || key === "secret" || key === "token") {
        sanitized[key] = "***"
      } else {
        sanitized[key] = sanitizeJson(nested)
      }
    }
    return sanitized
  }
  return value
}
