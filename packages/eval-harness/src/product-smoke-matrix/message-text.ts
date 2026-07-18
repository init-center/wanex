import type {
  MessagePart,
  SessionMessageRecord,
  TextMessagePart
} from "@wanex/protocol"

export function textFromMessages(
  messages: readonly SessionMessageRecord[]
): string {
  return messages
    .flatMap((message) => message.content)
    .filter((part): part is TextMessagePart => isTextPart(part))
    .map((part) => part.text)
    .join("\n")
}

function isTextPart(part: MessagePart): part is TextMessagePart {
  return part.type === "text"
}
