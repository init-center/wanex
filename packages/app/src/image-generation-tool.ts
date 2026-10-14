import type {
  JsonValue,
  ModelOptionDescriptor,
  ModelCapabilityRequirement
} from "@wanex/protocol"
import { normalizeModelOptions, validateModelOptionValues } from "@wanex/protocol"
import { prepareMediaGenerationOperationBinding, findModelCapabilityRouteExecutionBinding } from "@wanex/runtime/provider"
import {
  createToolRuntimeBinding,
  type ToolDefinition
} from "@wanex/runtime/tools"

const MAX_PROMPT_LENGTH = 32_768
const MAX_OPTIONS_BYTES = 16 * 1024
const MAX_REFERENCE_IMAGES = 16

export const WANEX_APP_IMAGE_GENERATION_REQUIREMENT = {
  operation: "image.generate",
  inputModalities: ["text"],
  outputModalities: ["image"],
  features: []
} as const satisfies ModelCapabilityRequirement

export interface ImageGenerationToolOptions {
  readonly acceptsReferenceImages?: boolean
  readonly generationOptions?: readonly ModelOptionDescriptor[]
}

export function createWanexAppImageGenerationTool(
  options: ImageGenerationToolOptions = {}
): ToolDefinition {
  const acceptsReferenceImages = options.acceptsReferenceImages === true
  const generationOptions = normalizeModelOptions(options.generationOptions ?? [])
  const properties = {
    prompt: {
      type: "string",
      minLength: 1,
      maxLength: MAX_PROMPT_LENGTH
    },
    ...(acceptsReferenceImages
      ? {
          images: {
            type: "array",
            items: { type: "string", minLength: 1 },
            minItems: 1,
            maxItems: MAX_REFERENCE_IMAGES,
            uniqueItems: true
          }
        }
      : {}),
    ...(generationOptions.length === 0 ? {} : {
      options: {
        type: "object",
        properties: Object.fromEntries(generationOptions.map(({ name, description, ...schema }) => [name, { ...schema, description }])),
        additionalProperties: false,
        maxProperties: generationOptions.length
      }
    })
  }
  return {
    name: "image_generate",
    description: acceptsReferenceImages
      ? "Generate an image from a text prompt, optionally guided by reference images from this conversation."
      : "Generate an image from a text prompt.",
    inputSchema: {
      type: "object",
      properties,
      required: ["prompt"],
      additionalProperties: false
    },
    risk: "external",
    idempotent: true,
    concurrency: "exclusive",
    resultMode: "deferred",
    requiredCapabilities: [WANEX_APP_IMAGE_GENERATION_REQUIREMENT],
    annotations: {
      title: "Generate image",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    },
    runtimeBinding: createToolRuntimeBinding({
      implementationId: "wanex.app.image-generate",
      implementationRevision: "3",
      configuration: {
        maxPromptLength: MAX_PROMPT_LENGTH,
        maxOptionsBytes: MAX_OPTIONS_BYTES,
        acceptsReferenceImages,
        generationOptions: generationOptions.map((option) => ({ ...option, ...(option.type === "string" ? { enum: [...option.enum] } : {}) }))
      }
    }),
    presentCall(input) {
      const images = (input as { images?: unknown }).images
      return {
        summary: "Generate image",
        details: [
          { label: "Capability", value: "Image generation" },
          ...(Array.isArray(images)
            ? [{ label: "Reference images", value: String(images.length) }]
            : [])
        ]
      }
    },
    async invoke(invocation) {
      const input = normalizeImageGenerationInput(
        invocation.input,
        acceptsReferenceImages
      )
      if (generationOptions.length === 0 && input.options !== undefined) {
        throw new Error("image_generate does not expose model options")
      }
      const route = findModelCapabilityRouteExecutionBinding(
        invocation.capabilityRoutes ?? [],
        WANEX_APP_IMAGE_GENERATION_REQUIREMENT
      )
      if (route === undefined) {
        throw new Error(
          "image_generate invocation has no frozen image generation route"
        )
      }
      if (JSON.stringify(generationOptions) !== JSON.stringify(normalizeModelOptions(route.modelEndpoint.model.generationOptions ?? []))) {
        throw new Error("image_generate tool options do not match the frozen route")
      }
      validateModelOptionValues(generationOptions, input.options ?? null)
      const inputResources = []
      for (const resourceId of input.images ?? []) {
        const { type: _type, ...evidence } =
          await invocation.resources.reference(resourceId)
        if (evidence.kind !== "image") {
          throw new Error(`image_generate input is not an image: ${resourceId}`)
        }
        inputResources.push(evidence)
      }
      return {
        outcome: "deferred",
        toolCallId: invocation.toolCallId,
        operation: {
          kind: "media_generation",
          binding: prepareMediaGenerationOperationBinding({
            operation: "image.generate",
            modelEndpoint: route.modelEndpoint,
            prompt: input.prompt,
            outputModality: "image",
            ...(inputResources.length === 0 ? {} : { inputResources }),
            ...(input.options === undefined ? {} : { options: input.options })
          })
        }
      }
    }
  }
}

function normalizeImageGenerationInput(
  value: JsonValue,
  acceptsReferenceImages: boolean
): {
  readonly prompt: string
  readonly images?: readonly string[]
  readonly options?: JsonValue
} {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("image_generate input must be an object")
  }
  const record = value as Readonly<Record<string, JsonValue>>
  if (Object.keys(record).some((key) => !["prompt", "images", "options"].includes(key))) {
    throw new Error("image_generate input contains unknown fields")
  }
  const promptValue = record.prompt
  if (typeof promptValue !== "string") {
    throw new Error("image_generate prompt must be a string")
  }
  const prompt = promptValue.trim()
  if (prompt.length === 0) {
    throw new Error("image_generate prompt must not be empty")
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    throw new Error(
      `image_generate prompt exceeds ${MAX_PROMPT_LENGTH} characters`
    )
  }
  const imagesValue = record.images
  if (imagesValue !== undefined) {
    if (!acceptsReferenceImages) {
      throw new Error("image_generate does not accept reference images")
    }
    if (
      !Array.isArray(imagesValue) ||
      imagesValue.length === 0 ||
      imagesValue.length > MAX_REFERENCE_IMAGES ||
      imagesValue.some(
        (image) => typeof image !== "string" || image.length === 0
      ) ||
      new Set(imagesValue).size !== imagesValue.length
    ) {
      throw new Error(
        `image_generate images must be 1 to ${MAX_REFERENCE_IMAGES} distinct resource ids`
      )
    }
  }
  const options = record.options
  if (options === undefined) {
    return {
      prompt,
      ...(imagesValue === undefined
        ? {}
        : { images: imagesValue as readonly string[] })
    }
  }
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("image_generate options must be an object")
  }
  if (Buffer.byteLength(JSON.stringify(options), "utf8") > MAX_OPTIONS_BYTES) {
    throw new Error(`image_generate options exceed ${MAX_OPTIONS_BYTES} bytes`)
  }
  return {
    prompt,
    ...(imagesValue === undefined
      ? {}
      : { images: imagesValue as readonly string[] }),
    options
  }
}
