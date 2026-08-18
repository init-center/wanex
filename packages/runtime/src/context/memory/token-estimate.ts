import type { MessagePart } from "@wanex/protocol"
import type { ProviderReplayMessage } from "../../provider/index.js"

export interface ContextTokenEstimator {
  estimatePartTokens(part: MessagePart): number
  estimatePartsTokens(parts: readonly MessagePart[]): number
  estimateMessagesTokens(messages: readonly ProviderReplayMessage[]): number
}

export const DEFAULT_CONTEXT_TOKEN_ESTIMATOR: ContextTokenEstimator = {
  estimatePartTokens,
  estimatePartsTokens,
  estimateMessagesTokens
}

export function estimatePartsTokens(parts: readonly MessagePart[]): number {
  return parts.reduce((sum, part) => sum + estimatePartTokens(part), 0)
}

export function estimateMessagesTokens(
  messages: readonly ProviderReplayMessage[]
): number {
  return messages.reduce(
    (sum, message) => sum + 4 + estimatePartsTokens(message.content),
    0
  )
}

export function estimatePartTokens(part: MessagePart): number {
  switch (part.type) {
    case "text":
    case "reasoning":
      return estimateTextTokens(part.text ?? "")
    case "tool_result":
      return part.content.reduce(
        (sum, item) =>
          sum + (item.type === "resource"
            ? 16
            : estimateTextTokens(
                item.type === "text" ? item.text : JSON.stringify(item.value)
              )),
        0
      )
    case "tool_call":
      return estimateTextTokens(`${part.toolName} ${JSON.stringify(part.input)}`)
    case "resource":
      return 16
  }
}

function estimateTextTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4))
}
