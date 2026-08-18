import { createHash } from "node:crypto"
import type {
  JsonValue,
  ToolResultContentPart,
  ToolResultMessagePart
} from "@wanex/protocol"

const MAX_PARTS = 64
const MAX_PART_BYTES = 262_144
const MAX_INLINE_BYTES = 1_048_576

export function toolResultPart(
  toolCallId: string,
  content: readonly ToolResultContentPart[],
  isError: boolean
): ToolResultMessagePart {
  const normalized = normalizeToolResultContent(content)
  return {
    type: "tool_result",
    id: `tool_result_${toolCallId}`,
    toolCallId,
    content: normalized,
    contentDigest: toolResultContentDigest(normalized),
    isError
  }
}

export function jsonToolResultContent(value: JsonValue): readonly ToolResultContentPart[] {
  return [{ type: "json", value }]
}

export function normalizeToolResultContent(
  content: readonly ToolResultContentPart[]
): readonly ToolResultContentPart[] {
  if (content.length === 0 || content.length > MAX_PARTS) {
    throw new Error(`tool result content must contain 1 to ${MAX_PARTS} parts`)
  }
  const resources = new Set<string>()
  let inlineBytes = 0
  const normalized = content.map((part): ToolResultContentPart => {
    if (part.type === "text") {
      const size = Buffer.byteLength(part.text)
      if (size === 0 || size > MAX_PART_BYTES) {
        throw new Error("tool result text part has an invalid UTF-8 size")
      }
      inlineBytes += size
      return Object.freeze({ type: part.type, text: part.text })
    }
    if (part.type === "json") {
      const value = cloneJson(part.value)
      const size = Buffer.byteLength(stableJson(value))
      if (size > MAX_PART_BYTES) {
        throw new Error(`tool result JSON part exceeds ${MAX_PART_BYTES} bytes`)
      }
      inlineBytes += size
      return Object.freeze({ type: part.type, value })
    }
    validateResourcePart(part)
    if (resources.has(part.resourceId)) {
      throw new Error(`tool result resource is duplicated: ${part.resourceId}`)
    }
    resources.add(part.resourceId)
    return Object.freeze({
      type: part.type,
      resourceId: part.resourceId,
      sha256: part.sha256,
      sizeBytes: part.sizeBytes,
      kind: part.kind,
      ...(part.mediaType === undefined ? {} : { mediaType: part.mediaType })
    })
  })
  if (inlineBytes > MAX_INLINE_BYTES) {
    throw new Error(`tool result inline content exceeds ${MAX_INLINE_BYTES} bytes`)
  }
  return Object.freeze(normalized)
}

export function toolResultContentDigest(
  content: readonly ToolResultContentPart[]
): string {
  return createHash("sha256").update(stableJson(content)).digest("hex")
}

function validateResourcePart(
  part: Extract<ToolResultContentPart, { type: "resource" }>
): void {
  if (part.resourceId.length === 0 || !/^[0-9a-f]{64}$/.test(part.sha256)) {
    throw new Error("tool result resource identity is invalid")
  }
  if (!Number.isSafeInteger(part.sizeBytes) || part.sizeBytes <= 0) {
    throw new Error("tool result resource size must be a positive safe integer")
  }
  if (part.mediaType !== undefined && part.mediaType.length === 0) {
    throw new Error("tool result resource mediaType must not be empty")
  }
}

function cloneJson(value: JsonValue): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`)
    .join(",")}}`
}
