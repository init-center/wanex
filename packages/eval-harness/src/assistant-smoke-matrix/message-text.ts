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

export function assistantTextFromMessages(
  messages: readonly SessionMessageRecord[],
  turnId: string
): string {
  return textFromMessages(
    messages.filter(
      (message) => message.turnId === turnId && message.role === "assistant"
    )
  )
}

function isTextPart(part: MessagePart): part is TextMessagePart {
  return part.type === "text"
}
