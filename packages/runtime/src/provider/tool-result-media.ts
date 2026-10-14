import type {
  ModelInputModality,
  ProviderProtocolDescriptor,
  ResourceInputEvidence
} from "@wanex/protocol"

/**
 * How a provider protocol carries a resource returned by a Tool:
 * - `native`: inside the protocol's tool-result block (Anthropic Messages).
 * - `follow_up_user_message`: the tool message stays text, and the bytes follow
 *   in a user message after the tool results (OpenAI Chat Completions, whose
 *   tool messages cannot hold images).
 * - `descriptor`: only the canonical metadata descriptor; no bytes are read.
 */
export type ToolResultResourceDelivery =
  | "native"
  | "follow_up_user_message"
  | "descriptor"

export function toolResultResourceDelivery(
  provider: {
    readonly protocol: ProviderProtocolDescriptor
    readonly inputModalities: readonly ModelInputModality[]
  },
  resource: Pick<ResourceInputEvidence, "kind" | "mediaType">
): ToolResultResourceDelivery {
  const image = resource.kind === "image" && isCommonImageType(resource.mediaType)
  if (image && !provider.inputModalities.includes("image")) return "descriptor"
  switch (provider.protocol.id) {
    case "anthropic-messages": {
      const pdf = resource.kind === "document" &&
        resource.mediaType === "application/pdf" &&
        provider.inputModalities.includes("document")
      return image || pdf ? "native" : "descriptor"
    }
    case "openai-chat-completions":
      return image ? "follow_up_user_message" : "descriptor"
    default:
      return "descriptor"
  }
}

/** Raster formats every supported conversation protocol accepts as image input. */
export function isCommonImageType(mediaType: string | undefined): boolean {
  return mediaType === "image/jpeg" ||
    mediaType === "image/png" ||
    mediaType === "image/gif" ||
    mediaType === "image/webp"
}
