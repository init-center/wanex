import type { JsonValue } from "@wanex/protocol"
import { isJsonValue } from "./internal-validation.js"
import { WANEX_PLUGIN_HOST_PROTOCOL } from "./types.js"
import type { PluginHostResponseMessage } from "./types.js"

export function parsePluginHostResponseMessage(
  stdout: string
): PluginHostResponseMessage {
  const line = stdout
    .split(/\r?\n/u)
    .map((entry) => entry.trim())
    .find((entry) => entry.length > 0)
  if (line === undefined) {
    throw new Error("plugin subprocess did not return a response")
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    throw new Error("plugin subprocess returned invalid JSON")
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("plugin subprocess response must be an object")
  }
  const record = parsed as Record<string, unknown>
  if (record.protocol !== WANEX_PLUGIN_HOST_PROTOCOL) {
    throw new Error("plugin subprocess response protocol mismatch")
  }
  if (record.type === "result") {
    if (record.result !== undefined && !isJsonValue(record.result)) {
      throw new Error("plugin subprocess result must be JSON-safe")
    }
    return {
      protocol: WANEX_PLUGIN_HOST_PROTOCOL,
      type: "result",
      ...(record.result === undefined ? {} : { result: record.result as JsonValue })
    }
  }
  if (record.type === "error") {
    if (
      record.error === null ||
      typeof record.error !== "object" ||
      Array.isArray(record.error)
    ) {
      throw new Error("plugin subprocess error response must include an object")
    }
    const error = record.error as Record<string, unknown>
    if (typeof error.message !== "string" || error.message.length === 0) {
      throw new Error("plugin subprocess error message must be a non-empty string")
    }
    if (error.code !== undefined && typeof error.code !== "string") {
      throw new Error("plugin subprocess error code must be a string")
    }
    return {
      protocol: WANEX_PLUGIN_HOST_PROTOCOL,
      type: "error",
      error: {
        message: error.message,
        ...(error.code === undefined ? {} : { code: error.code })
      }
    }
  }
  throw new Error("plugin subprocess response type must be result or error")
}
