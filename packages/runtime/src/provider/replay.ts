import type {
  JsonValue,
  MessagePart,
  ResourceMessagePart,
  TextMessagePart,
  ToolCallMessagePart,
  ToolResultContentPart,
  ToolResultResourceContentPart
} from "@wanex/protocol"
import type {
  PreparedProviderResourcePart,
  PreparedProviderToolResultResourcePart
} from "./types.js"

const MAX_PROJECTED_TOOL_RESULT_BYTES = 1_100_000

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

export function requirePreparedToolResultResource(
  part: ToolResultResourceContentPart
): PreparedProviderToolResultResourcePart & { readonly bytes: Uint8Array } {
  if (!("bytes" in part) || !(part.bytes instanceof Uint8Array)) {
    throw new Error(`provider tool-result resource bytes are missing: ${part.resourceId}`)
  }
  return part as PreparedProviderToolResultResourcePart & {
    readonly bytes: Uint8Array
  }
}

export function projectedToolResultText(
  content: readonly ToolResultContentPart[]
): string {
  const projected = content.map((part) => {
    if (part.type === "text") return { type: part.type, text: part.text }
    if (part.type === "json") return { type: part.type, value: part.value }
    return toolResultResourceDescriptor(part)
  })
  const text = canonicalJson(projected)
  if (Buffer.byteLength(text) > MAX_PROJECTED_TOOL_RESULT_BYTES) {
    throw new Error("projected provider tool result exceeds its byte limit")
  }
  return text
}

export function toolResultResourceDescriptor(
  part: ToolResultResourceContentPart
) {
  return {
    type: "resource" as const,
    resourceId: part.resourceId,
    kind: part.kind,
    ...(part.mediaType === undefined ? {} : { mediaType: part.mediaType }),
    sizeBytes: part.sizeBytes,
    sha256: part.sha256
  }
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) =>
      `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`
    )
    .join(",")}}`
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
