import type {
  JsonValue,
  ModelCapabilityRequirement
} from "@wanex/protocol"
import {
  prepareMediaGenerationOperationBinding
} from "@wanex/runtime/media-generation"
import {
  findModelCapabilityRouteExecutionBinding
} from "@wanex/runtime/provider"
import {
  createToolRuntimeBinding,
  type ToolDefinition
} from "@wanex/runtime/tools"

const MAX_PROMPT_LENGTH = 32_768
const MAX_OPTIONS_BYTES = 16 * 1024

export const WANEX_APP_IMAGE_GENERATION_REQUIREMENT = {
  operation: "image.generate",
  inputModalities: ["text"],
  outputModalities: ["image"],
  features: []
} as const satisfies ModelCapabilityRequirement

export function createWanexAppImageGenerationTool(): ToolDefinition {
  return {
    name: "image_generate",
    description: "Generate an image from a text prompt.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          minLength: 1,
          maxLength: MAX_PROMPT_LENGTH
        },
        options: {
          type: "object",
          maxProperties: 32
        }
      },
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
      implementationRevision: "1",
      configuration: {
        maxPromptLength: MAX_PROMPT_LENGTH,
        maxOptionsBytes: MAX_OPTIONS_BYTES
      }
    }),
    presentCall() {
      return {
        summary: "Generate image",
        details: [{ label: "Capability", value: "Image generation" }]
      }
    },
    async invoke(invocation) {
      const input = normalizeImageGenerationInput(invocation.input)
      const route = findModelCapabilityRouteExecutionBinding(
        invocation.capabilityRoutes ?? [],
        WANEX_APP_IMAGE_GENERATION_REQUIREMENT
      )
      if (route === undefined) {
        throw new Error(
          "image_generate invocation has no frozen image generation route"
        )
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
            ...(input.options === undefined
              ? {}
              : { options: input.options })
          })
        }
      }
    }
  }
}

function normalizeImageGenerationInput(value: JsonValue): {
  readonly prompt: string
  readonly options?: JsonValue
} {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("image_generate input must be an object")
  }
  const record = value as Readonly<Record<string, JsonValue>>
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
  const options = record.options
  if (options === undefined) return { prompt }
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("image_generate options must be an object")
  }
  if (Buffer.byteLength(JSON.stringify(options), "utf8") > MAX_OPTIONS_BYTES) {
    throw new Error(
      `image_generate options exceed ${MAX_OPTIONS_BYTES} bytes`
    )
  }
  return { prompt, options }
}
