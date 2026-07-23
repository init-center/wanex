import type {
  JsonValue,
  MessagePart,
  ResourceMessagePart,
  TextMessagePart,
  ToolCallMessagePart
} from "@wanex/protocol"
import type { PreparedProviderResourcePart } from "./types.js"

export function textContent(parts: readonly MessagePart[]): string {
  const resource = parts.find((part) => part.type === "resource")
  if (resource !== undefined) {
    throw new Error(`provider adapter did not lower resource input: ${resource.resourceId}`)
  }
  return parts
    .filter((part): part is TextMessagePart => part.type === "text")
    .map((part) => part.text)
    .join("")
}

export function requirePreparedProviderResource(
  part: ResourceMessagePart
): PreparedProviderResourcePart {
  if (!("bytes" in part) || !(part.bytes instanceof Uint8Array)) {
    throw new Error(`provider resource bytes are missing: ${part.resourceId}`)
  }
  return part as PreparedProviderResourcePart
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
