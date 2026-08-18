import {
  normalizeToolActivityPresentation,
  type JsonValue,
  type ToolActivityPresentation
} from "@wanex/protocol"
import type { ToolDefinition } from "./types.js"

export function presentToolCall(
  tool: ToolDefinition,
  input: JsonValue
): ToolActivityPresentation | undefined {
  if (tool.presentCall === undefined) return undefined
  return normalizeToolActivityPresentation(
    tool.presentCall(input),
    `tool call presentation ${tool.name}`
  )
}

export function presentToolResult(
  tool: ToolDefinition,
  input: JsonValue,
  result: Parameters<NonNullable<ToolDefinition["presentResult"]>>[0]["result"]
): ToolActivityPresentation | undefined {
  if (tool.presentResult === undefined) return undefined
  try {
    return normalizeToolActivityPresentation(
      tool.presentResult({ input, result }),
      `tool result presentation ${tool.name}`
    )
  } catch {
    // Presentation cannot rewrite an outcome after a Tool side effect ran.
    return undefined
  }
}

export function presentToolFailure(
  tool: ToolDefinition,
  input: JsonValue,
  error: unknown,
  reason: "exception" | "cancelled" | "timed_out"
): ToolActivityPresentation | undefined {
  if (tool.presentFailure === undefined) return undefined
  try {
    return normalizeToolActivityPresentation(
      tool.presentFailure({ input, error, reason }),
      `tool failure presentation ${tool.name}`
    )
  } catch {
    // Invalid evidence stays private and cannot rewrite the real Tool state.
    return undefined
  }
}
