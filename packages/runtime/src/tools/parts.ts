import type { JsonValue, ToolResultMessagePart } from "@wanex/protocol"

export function toolResultPart(
  toolCallId: string,
  result: JsonValue,
  isError: boolean
): ToolResultMessagePart {
  return {
    type: "tool_result",
    id: `tool_result_${toolCallId}`,
    toolCallId,
    result,
    isError
  }
}
