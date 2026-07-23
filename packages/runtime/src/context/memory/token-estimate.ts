import type { MessagePart } from "@wanex/protocol"

export interface ContextTokenEstimator {
  estimatePartTokens(part: MessagePart): number
  estimatePartsTokens(parts: readonly MessagePart[]): number
}

export const DEFAULT_CONTEXT_TOKEN_ESTIMATOR: ContextTokenEstimator = {
  estimatePartTokens,
  estimatePartsTokens
}

export function estimatePartsTokens(parts: readonly MessagePart[]): number {
  return parts.reduce((sum, part) => sum + estimatePartTokens(part), 0)
}

export function estimatePartTokens(part: MessagePart): number {
  switch (part.type) {
    case "text":
    case "reasoning":
      return estimateTextTokens(part.text ?? "")
    case "tool_result":
      return estimateTextTokens(JSON.stringify(part.result))
    case "tool_call":
      return estimateTextTokens(`${part.toolName} ${JSON.stringify(part.input)}`)
    case "resource":
      return 16
  }
}

function estimateTextTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4))
}
