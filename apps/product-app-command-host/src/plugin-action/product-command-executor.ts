import type { JsonValue, PrincipalId, RetryPolicy } from "@wanex/protocol"
import type { AppExtensionCommandExecutor } from "@wanex/extension"
import { invokePluginActionHandler } from "./adapter.js"
import { parsePluginActionHandlerRef } from "./handler-ref.js"
import type { SubmitPluginActionPort } from "./types.js"

export interface CreatePluginActionProductCommandExecutorOptions {
  readonly port: SubmitPluginActionPort
  readonly principalId: PrincipalId
  readonly submission?: {
    readonly maxAttempts?: number
    readonly retryPolicy?: RetryPolicy
    readonly priority?: number
  }
}

export function createPluginActionProductCommandExecutor(
  options: CreatePluginActionProductCommandExecutorOptions
): AppExtensionCommandExecutor {
  return {
    supports(handlerRef) {
      return parsePluginActionHandlerRef(handlerRef) !== undefined
    },
    preview(request) {
      return isJsonValue(request.input)
        ? { ok: true }
        : {
            ok: false,
            message: "plugin action command input must be a JSON value"
          }
    },
    async execute(request) {
      if (!isJsonValue(request.input)) {
        throw new Error("plugin action command input must be a JSON value")
      }
      const submission = await invokePluginActionHandler(options.port, {
        handlerRef: request.handlerRef,
        principalId: options.principalId,
        payload: request.input,
        ...(options.submission?.maxAttempts === undefined
          ? {}
          : { maxAttempts: options.submission.maxAttempts }),
        ...(options.submission?.retryPolicy === undefined
          ? {}
          : { retryPolicy: options.submission.retryPolicy }),
        ...(options.submission?.priority === undefined
          ? {}
          : { priority: options.submission.priority })
      })
      return {
        kind: "plugin-action.submitted",
        jobId: submission.job.id
      }
    }
  }
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true
  }
  if (typeof value === "number") {
    return Number.isFinite(value)
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue)
  }
  if (typeof value !== "object" || value === undefined) {
    return false
  }
  return Object.values(value as Record<string, unknown>).every(isJsonValue)
}
