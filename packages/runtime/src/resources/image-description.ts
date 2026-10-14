import { createHash } from "node:crypto"
import type {
  ModelCapabilityRouteExecutionBinding,
  ResourceInputEvidence,
  RuntimeAbortSignal
} from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"
import { consumeTextProviderStream } from "../provider/consume.js"
import type {
  PreparedProviderReplayMessage,
  PreparedProviderReplayPart,
  PreparedProviderToolResultContentPart,
  ProviderAdapter
} from "../provider/types.js"
import { readExactResourceBytes, prepareProviderImage } from "./input.js"

/** Bump when the prompt changes, so cached descriptions are not reused. */
export const IMAGE_DESCRIPTION_PROMPT_VERSION = "1"
const IMAGE_DESCRIPTION_MAX_OUTPUT_TOKENS = 1_024
const IMAGE_DESCRIPTION_PROMPT = [
  "Describe this image for an assistant that cannot see it.",
  "Cover the subject, layout, notable details, colours and any people or objects.",
  "Transcribe all visible text exactly, including code, numbers and labels.",
  "Be factual and complete, and do not speculate beyond what is visible.",
  "Reply with the description only."
].join(" ")

export type ImageDescriptionStore = Pick<
  CoreStore,
  | "getResource"
  | "prepareImageResource"
  | "readResourceContent"
  | "ingestResource"
  | "recordResourceProvenance"
  | "listResourceProvenance"
>

/**
 * Replaces, in the provider projection only, every image the conversation model
 * cannot see with a cached text description from the frozen image-understanding
 * route. The canonical transcript keeps the original image resource.
 */
export interface ImageDescriber {
  describe(
    messages: readonly PreparedProviderReplayMessage[],
    signal?: RuntimeAbortSignal
  ): Promise<PreparedProviderReplayMessage[]>
}

export function createImageDescriber(options: {
  readonly storage: ImageDescriptionStore
  readonly route: ModelCapabilityRouteExecutionBinding
  readonly provider: ProviderAdapter
}): ImageDescriber {
  const endpointDigest = options.route.modelEndpoint.endpointDigest
  const modelId = options.route.modelEndpoint.model.id

  async function description(
    resource: ResourceInputEvidence,
    signal: RuntimeAbortSignal | undefined
  ): Promise<string> {
    const prepared = await prepareProviderImage(options.storage, resource, "normalize")
    const descriptionKey = imageDescriptionKey(prepared.sha256, endpointDigest)
    const [cached] = await options.storage.listResourceProvenance({
      causeKind: "image_description",
      causeId: descriptionKey,
      limit: 1
    })
    if (cached !== undefined) {
      return Buffer.from(
        await readExactResourceBytes(options.storage, cached.resource)
      ).toString("utf8")
    }
    const response = await consumeTextProviderStream({
      provider: options.provider,
      request: {
        outputModalities: ["text"],
        messages: [{
          role: "user",
          content: [
            { type: "text", id: "image_description_prompt", text: IMAGE_DESCRIPTION_PROMPT },
            { type: "resource", id: "image_description_source", ...prepared }
          ]
        }],
        maxOutputTokens: IMAGE_DESCRIPTION_MAX_OUTPUT_TOKENS,
        ...(signal === undefined ? {} : { signal })
      }
    })
    const text = response.parts
      .flatMap((part) => part.type === "text" ? [part.text] : [])
      .join("")
      .trim()
    if (text.length === 0) {
      throw new Error(`image-understanding endpoint returned no description: ${resource.resourceId}`)
    }
    const stored = await options.storage.ingestResource({
      content: Buffer.from(text, "utf8"),
      kind: "document",
      mediaType: "text/plain",
      origin: "model_output",
      label: `Description of ${resource.resourceId}`
    })
    await options.storage.recordResourceProvenance({
      resource: {
        resourceId: stored.id,
        sha256: stored.sha256,
        sizeBytes: stored.sizeBytes,
        kind: stored.kind,
        mediaType: "text/plain"
      },
      cause: {
        kind: "image_description",
        descriptionKey,
        endpointDigest,
        promptVersion: IMAGE_DESCRIPTION_PROMPT_VERSION
      },
      inputResources: [evidenceOf(prepared)]
    })
    return text
  }

  function describedText(resource: ResourceInputEvidence & { readonly originalResource?: ResourceInputEvidence }, text: string): string {
    return `[image ${resource.originalResource?.resourceId ?? resource.resourceId}, described by ${modelId} because this model cannot see images]\n${text}`
  }

  return {
    async describe(messages, signal) {
      const described: PreparedProviderReplayMessage[] = []
      for (const message of messages) {
        const content: PreparedProviderReplayPart[] = []
        for (const part of message.content) {
          if (part.type === "resource" && part.kind === "image") {
            content.push({
              type: "text",
              id: `${part.id}_description`,
              text: describedText(part, await description(part, signal))
            })
            continue
          }
          if (part.type === "tool_result") {
            const toolContent: PreparedProviderToolResultContentPart[] = []
            for (const item of part.content) {
              if (item.type === "resource" && item.kind === "image") {
                toolContent.push({
                  type: "text",
                  text: describedText(item, await description(item, signal))
                })
              } else {
                toolContent.push(item)
              }
            }
            content.push({ ...part, content: toolContent })
            continue
          }
          content.push(part)
        }
        described.push({ role: message.role, content })
      }
      return described
    }
  }
}

export function imageDescriptionKey(sourceSha256: string, endpointDigest: string): string {
  return createHash("sha256")
    .update(`${sourceSha256}\n${endpointDigest}\n${IMAGE_DESCRIPTION_PROMPT_VERSION}`)
    .digest("hex")
}

function evidenceOf(resource: ResourceInputEvidence): ResourceInputEvidence {
  return {
    resourceId: resource.resourceId,
    sha256: resource.sha256,
    sizeBytes: resource.sizeBytes,
    kind: resource.kind,
    ...(resource.mediaType === undefined ? {} : { mediaType: resource.mediaType })
  }
}
