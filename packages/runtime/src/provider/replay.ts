import type {
  JsonValue,
  MessagePart,
  TextMessagePart,
  ToolCallMessagePart
} from "@wanex/protocol"

export function textContent(parts: readonly MessagePart[]): string {
  return parts
    .filter((part): part is TextMessagePart => part.type === "text")
    .map((part) => part.text)
    .join("")
}

export function toolCallsToOpenAI(
  toolCalls: readonly ToolCallMessagePart[]
): readonly JsonValue[] {
  return toolCalls.map((part) => ({
    id: part.toolCallId,
    type: "function",
    function: {
      name: part.toolName,
      arguments: JSON.stringify(part.input)
    }
  }))
}
