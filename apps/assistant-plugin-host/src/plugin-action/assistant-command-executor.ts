import type { JsonValue, PrincipalId, RetryPolicy } from "@wanex/protocol"
import type { AppExtensionCommandExecutor } from "@wanex/extension"
import { invokePluginActionHandler } from "./adapter.js"
import { parsePluginActionHandlerRef } from "./handler-ref.js"
import type { SubmitPluginActionPort } from "./types.js"

export interface CreatePluginActionAssistantCommandExecutorOptions {
  readonly port: SubmitPluginActionPort
  readonly principalId: PrincipalId
  readonly submission?: {
    readonly maxAttempts?: number
    readonly retryPolicy?: RetryPolicy
    readonly priority?: number
  }
}

export function createPluginActionAssistantCommandExecutor(
  options: CreatePluginActionAssistantCommandExecutorOptions
): AppExtensionCommandExecutor {
  return {
    supports(handlerRef) {
      return parsePluginActionHandlerRef(handlerRef) !== undefined
    },
    preview(request) {
      const payload = request.input === undefined ? null : request.input
      return isJsonValue(payload)
        ? { ok: true }
        : {
            ok: false,
            message: "plugin action command input must be a JSON value"
          }
    },
    async execute(request) {
      const payload = request.input === undefined ? null : request.input
      if (!isJsonValue(payload)) {
        throw new Error("plugin action command input must be a JSON value")
      }
      const submission = await invokePluginActionHandler(options.port, {
        handlerRef: request.handlerRef,
        principalId: options.principalId,
        payload,
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
        kind: "submitted",
        value: {
          kind: "plugin-action.submitted",
          jobId: submission.job.id
        }
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
