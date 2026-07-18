import type { ProviderReplayMessage } from "../../provider/index.js"
import type {
  MessagePart,
  SessionInputRecord,
  ToolCallMessagePart
} from "@wanex/protocol"

export function inputToReplayMessage(
  input: SessionInputRecord
): ProviderReplayMessage {
  return {
    role: input.inputType === "system" ? "system" : "user",
    content: input.content as readonly MessagePart[]
  }
}

export function isToolCall(part: MessagePart): part is ToolCallMessagePart {
  return part.type === "tool_call"
}
