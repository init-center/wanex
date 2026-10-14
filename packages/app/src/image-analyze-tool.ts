import type {
  JsonValue,
  ModelCapabilityRouteExecutionBinding,
  ResourceInputEvidence
} from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"
import {
  consumeTextProviderStream,
  modelEndpointFromExecutionBinding,
  providerFromModelEndpoint
} from "@wanex/runtime/provider"
import { prepareProviderImage } from "@wanex/runtime/resources"
import type { SecretResolverPort } from "@wanex/runtime/secrets"
import {
  createToolRuntimeBinding,
  type ToolDefinition
} from "@wanex/runtime/tools"

const MAX_QUESTION_LENGTH = 4_096
const MAX_ANALYZE_IMAGES = 8
const MAX_OUTPUT_TOKENS = 2_048
const SESSION_MESSAGE_PAGE = 200

export const WANEX_APP_IMAGE_ANALYZE_TOOL_NAME = "image_analyze"

type ImageAnalyzeStore = Pick<
  CoreStore,
  "getResource" | "readResourceContent" | "prepareImageResource" | "listSessionMessages"
>

/**
 * Asks the frozen image-understanding endpoint a specific question about images
 * in this conversation. The automatic description is generic; this recovers the
 * detail it drops. Answers depend on the question, so they are not cached.
 *
 * It is built from the image-understanding route the Turn froze, and it sends an
 * image only when a canonical message of the same Session contains that exact
 * resource.
 */
export function createWanexAppImageAnalyzeTool(options: {
  readonly storage: ImageAnalyzeStore
  readonly route: ModelCapabilityRouteExecutionBinding
  readonly secretResolver?: SecretResolverPort
}): ToolDefinition {
  return {
    name: WANEX_APP_IMAGE_ANALYZE_TOOL_NAME,
    description:
      "Ask a vision model a specific question about images from this conversation. " +
      "Use it when an image is only available to you as a description and you need a detail the description lacks. " +
      "Name each image by the resource id shown next to it, such as res_123 from [image res_123].",
    inputSchema: {
      type: "object",
      properties: {
        question: {
          type: "string",
          minLength: 1,
          maxLength: MAX_QUESTION_LENGTH
        },
        images: {
          type: "array",
          items: { type: "string", minLength: 1 },
          minItems: 1,
          maxItems: MAX_ANALYZE_IMAGES,
          uniqueItems: true
        }
      },
      required: ["question", "images"],
      additionalProperties: false
    },
    risk: "external",
    idempotent: true,
    concurrency: "parallel_safe",
    resultMode: "immediate",
    annotations: {
      title: "Analyze image",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    runtimeBinding: createToolRuntimeBinding({
      implementationId: "wanex.app.image-analyze",
      implementationRevision: "1",
      configuration: {
        maxQuestionLength: MAX_QUESTION_LENGTH,
        maxImages: MAX_ANALYZE_IMAGES,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        endpointDigest: options.route.modelEndpoint.endpointDigest
      }
    }),
    presentCall(input) {
      const count = Array.isArray((input as { images?: unknown }).images)
        ? (input as { images: unknown[] }).images.length
        : 0
      return {
        summary: "Analyze image",
        details: [
          { label: "Capability", value: "Image understanding" },
          { label: "Images", value: String(count) }
        ]
      }
    },
    async invoke(invocation) {
      const input = normalizeImageAnalyzeInput(invocation.input)
      const route = options.route
      const resources: ResourceInputEvidence[] = []
      for (const resourceId of input.images) {
        const { type: _type, ...evidence } = await invocation.resources.reference(resourceId)
        if (evidence.kind !== "image") {
          throw new Error(`image_analyze input is not an image: ${resourceId}`)
        }
        resources.push(evidence)
      }
      await requireSessionVisibleImages(options.storage, invocation.sessionId, resources)
      const provider = await providerFromModelEndpoint(
        modelEndpointFromExecutionBinding(route.modelEndpoint),
        options.secretResolver
      )
      const content = [
        { type: "text" as const, id: "image_analyze_question", text: input.question }
      ] as Array<
        | { readonly type: "text"; readonly id: string; readonly text: string }
        | (ResourceInputEvidence & {
            readonly type: "resource"
            readonly id: string
            readonly bytes: Uint8Array
          })
      >
      for (const [index, resource] of resources.entries()) {
        content.push({
          type: "text",
          id: `image_analyze_label_${index}`,
          text: `[image ${resource.resourceId}]`
        })
        content.push({
          type: "resource",
          id: `image_analyze_image_${index}`,
          ...await prepareProviderImage(options.storage, resource, "normalize")
        })
      }
      const response = await consumeTextProviderStream({
        provider,
        request: {
          outputModalities: ["text"],
          messages: [{ role: "user", content }],
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          ...(invocation.signal === undefined ? {} : { signal: invocation.signal })
        }
      })
      const answer = response.parts
        .flatMap((part) => part.type === "text" ? [part.text] : [])
        .join("")
        .trim()
      if (answer.length === 0) {
        throw new Error("image understanding endpoint returned no answer")
      }
      return {
        outcome: "succeeded",
        toolCallId: invocation.toolCallId,
        content: [{
          type: "text",
          text: `Answer from ${route.modelEndpoint.model.id}:\n${answer}`
        }]
      }
    }
  }
}

function normalizeImageAnalyzeInput(value: JsonValue): {
  readonly question: string
  readonly images: readonly string[]
} {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("image_analyze input must be an object")
  }
  const record = value as Readonly<Record<string, JsonValue>>
  if (typeof record.question !== "string") {
    throw new Error("image_analyze question must be a string")
  }
  const question = record.question.trim()
  if (question.length === 0 || question.length > MAX_QUESTION_LENGTH) {
    throw new Error(
      `image_analyze question must contain 1 to ${MAX_QUESTION_LENGTH} characters`
    )
  }
  const images = record.images
  if (
    !Array.isArray(images) ||
    images.length === 0 ||
    images.length > MAX_ANALYZE_IMAGES ||
    images.some((image) => typeof image !== "string" || image.length === 0) ||
    new Set(images).size !== images.length
  ) {
    throw new Error(
      `image_analyze images must be 1 to ${MAX_ANALYZE_IMAGES} distinct resource ids`
    )
  }
  return { question, images: images as readonly string[] }
}

/**
 * The same rule the System Service applies to media-generation inputs: a
 * resource may leave for another provider only when this Session has seen it
 * with the same evidence, as a user attachment or a tool result.
 */
async function requireSessionVisibleImages(
  storage: Pick<CoreStore, "listSessionMessages">,
  sessionId: string,
  resources: readonly ResourceInputEvidence[]
): Promise<void> {
  const missing = new Map(resources.map((resource) => [resource.resourceId, resource]))
  let beforeSequence: number | undefined
  while (missing.size > 0) {
    const page = await storage.listSessionMessages({
      sessionId,
      limit: SESSION_MESSAGE_PAGE,
      ...(beforeSequence === undefined ? {} : { beforeSequence })
    })
    if (page.length === 0) break
    for (const message of page) {
      for (const part of message.content) {
        const candidates = part.type === "resource"
          ? [part]
          : part.type === "tool_result"
            ? part.content.flatMap((item) => item.type === "resource" ? [item] : [])
            : []
        for (const candidate of candidates) {
          const expected = missing.get(candidate.resourceId)
          if (expected !== undefined && candidate.sha256 === expected.sha256) {
            missing.delete(candidate.resourceId)
          }
        }
      }
    }
    const oldest = Math.min(...page.map((message) => message.sequence))
    if (page.length < SESSION_MESSAGE_PAGE || oldest === beforeSequence) break
    beforeSequence = oldest
  }
  const [first] = missing.keys()
  if (first !== undefined) {
    throw new Error(`image_analyze image is not part of this conversation: ${first}`)
  }
}
