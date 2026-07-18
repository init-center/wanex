import type {
  MessagePart,
  SessionId,
  TextMessagePart,
  ToolResultMessagePart
} from "@wanex/protocol"
import type {
  ContextMemoryPolicy,
  ContextReplacementTier
} from "./types.js"

export function tierForPart(
  part: MessagePart,
  policy: ContextMemoryPolicy
): ContextReplacementTier | null {
  const textLength = compactableTextLength(part)
  if (textLength === null) {
    return null
  }
  if (textLength >= policy.placeholderTextOverChars) {
    return "tier2_placeholder"
  }
  if (textLength >= policy.snipTextOverChars) {
    return "tier1_snip"
  }
  return null
}

export function buildReplacementPart(
  part: MessagePart,
  tier: ContextReplacementTier,
  policy: ContextMemoryPolicy
): MessagePart {
  if (tier === "tier1_snip" && part.type === "text") {
    return {
      ...part,
      text: snipText(part.text, policy),
      providerMetadata: {
        ...part.providerMetadata,
        wanexContextReplacementTier: tier,
        originalChars: part.text.length
      }
    }
  }
  if (tier === "tier1_snip" && part.type === "reasoning") {
    return {
      ...part,
      text: snipText(part.text ?? "", policy),
      providerMetadata: {
        ...part.providerMetadata,
        wanexContextReplacementTier: tier,
        originalChars: part.text?.length ?? 0
      }
    }
  }
  if (tier === "tier1_snip" && part.type === "tool_result") {
    return compactToolResult(part, policy, tier)
  }
  if (part.type === "tool_result") {
    return compactToolResult(part, policy, tier)
  }
  return placeholderTextPart(part, tier)
}

export function replacementKey(request: {
  readonly sessionId: SessionId
  readonly policyVersion: string
  readonly messageId?: string
  readonly partId: string
}): string {
  return [
    request.sessionId,
    request.policyVersion,
    request.messageId ?? "input",
    request.partId
  ].join(":")
}

export function stableId(value: string): string {
  let hash = 0x811c9dc5
  for (const char of value) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

function compactableTextLength(part: MessagePart): number | null {
  switch (part.type) {
    case "text":
    case "reasoning":
      return part.text?.length ?? 0
    case "tool_result":
      return JSON.stringify(part.result).length
    case "tool_call":
    case "resource":
    case "ui_surface":
      return null
  }
}

function compactToolResult(
  part: ToolResultMessagePart,
  policy: ContextMemoryPolicy,
  tier: ContextReplacementTier
): ToolResultMessagePart {
  const serialized = JSON.stringify(part.result)
  return {
    ...part,
    result: {
      compacted: true,
      tier,
      originalChars: serialized.length,
      preview:
        tier === "tier1_snip"
          ? snipText(serialized, policy)
          : `[compacted ${serialized.length} chars]`
    },
    providerMetadata: {
      ...part.providerMetadata,
      wanexContextReplacementTier: tier,
      originalChars: serialized.length
    }
  }
}

function placeholderTextPart(
  part: TextMessagePart | MessagePart,
  tier: ContextReplacementTier
): TextMessagePart {
  const originalChars =
    part.type === "text" || part.type === "reasoning"
      ? (part.text?.length ?? 0)
      : compactableTextLength(part) ?? 0
  return {
    type: "text",
    id: part.id,
    text: `[compacted ${originalChars} chars]`,
    ...(part.visibility === undefined ? {} : { visibility: part.visibility }),
    providerMetadata: {
      ...part.providerMetadata,
      wanexContextReplacementTier: tier,
      originalChars
    }
  }
}

function snipText(text: string, policy: ContextMemoryPolicy): string {
  if (text.length <= policy.snipHeadChars + policy.snipTailChars) {
    return text
  }
  const omitted = text.length - policy.snipHeadChars - policy.snipTailChars
  return `${text.slice(0, policy.snipHeadChars)}\n[snipped ${omitted} chars]\n${text.slice(-policy.snipTailChars)}`
}
