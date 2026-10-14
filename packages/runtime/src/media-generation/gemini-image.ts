import { validateModelOptionValues } from "@wanex/protocol"
import type {
  JsonValue,
  MediaGenerationProviderOutputReference,
  ModelEndpoint,
  ModelEndpointExecutionBinding
} from "@wanex/protocol"
import type { SecretResolverPort } from "../secrets/index.js"
import { modelEndpointFromExecutionBinding } from "../provider/index.js"
import {
  assertSafeBaseUrl,
  globalImageFetch,
  inputDataUrl,
  materializeImageReference,
  MAX_IMAGE_OUTPUT_COUNT,
  optionalString,
  parseBase64ImageOutput,
  positiveBound,
  record,
  readBoundedResponse,
  rejected,
  rejectedHttp,
  safeRemoteUrl,
  type ImageAdapterFetch
} from "./image-adapter-helpers.js"
import type {
  MediaGenerationAdapter,
  MediaGenerationAdapterRequest,
  MediaGenerationMaterializedOutput,
  MediaGenerationPollResult,
  MediaGenerationProviderOutput,
  MediaGenerationSubmitRequest,
  MediaGenerationSubmitResult
} from "./types.js"

const DEFAULT_MAX_RESPONSE_BYTES = 32 * 1024 * 1024
const DEFAULT_MAX_MATERIALIZED_BYTES = 100 * 1024 * 1024
const RESERVED_OPTIONS = new Set(["model", "input", "response_format"])
const IMAGE_SIZES = new Set(["0.5K", "1K", "2K", "4K"])
const ASPECT_RATIOS = new Set([
  "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"
])
const THINKING_LEVELS = new Set(["minimal", "medium", "high"])

export interface GeminiImageAdapterOptions {
  readonly secretResolver: SecretResolverPort
  readonly fetch?: ImageAdapterFetch
  readonly maxResponseBytes?: number
  readonly maxMaterializedBytes?: number
}

export class GeminiImageAdapter implements MediaGenerationAdapter {
  readonly protocolId = "gemini-image"
  readonly #secretResolver: SecretResolverPort
  readonly #fetch: ImageAdapterFetch
  readonly #maxResponseBytes: number
  readonly #maxMaterializedBytes: number

  constructor(options: GeminiImageAdapterOptions) {
    this.#secretResolver = options.secretResolver
    this.#fetch = options.fetch ?? globalImageFetch
    this.#maxResponseBytes = positiveBound(options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES, "Gemini image maxResponseBytes")
    this.#maxMaterializedBytes = positiveBound(options.maxMaterializedBytes ?? DEFAULT_MAX_MATERIALIZED_BYTES, "Gemini image maxMaterializedBytes")
  }

  canExecute(modelEndpoint: ModelEndpoint): boolean {
    return modelEndpoint.protocol.id === this.protocolId &&
      modelEndpoint.connection.baseUrl !== undefined &&
      modelEndpoint.connection.secretRef !== undefined &&
      modelEndpoint.model.operations.includes("image.generate") &&
      modelEndpoint.model.inputModalities.includes("text") &&
      modelEndpoint.model.outputModalities.includes("image")
  }

  async submit(request: MediaGenerationSubmitRequest): Promise<MediaGenerationSubmitResult> {
    let prepared: PreparedGeminiRequest
    try {
      prepared = prepareRequest(request)
    } catch (error) {
      return rejected("invalid_request", error)
    }
    let secret
    try {
      secret = await this.#secretResolver.resolve(prepared.secretRef, {
        modelEndpointId: prepared.endpointId,
        signal: request.signal
      })
    } catch (error) {
      return rejected("credential_unavailable", error)
    }
    try {
      let apiKey: string
      try { apiKey = secret.reveal() } catch (error) { return rejected("credential_unavailable", error) }
      const response = await this.#fetch(`${prepared.baseUrl}/interactions`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(prepared.body),
        signal: request.signal,
        redirect: "error"
      })
      try {
        const bytes = await readBoundedResponse(response, this.#maxResponseBytes, request.signal, "Gemini image response")
        if (!response.ok) return rejectedHttp(response, bytes, "Gemini image")
        return { status: "completed", outputs: parseOutputs(bytes, prepared) }
      } catch (error) {
        return rejected("invalid_provider_response", error)
      }
    } finally {
      secret.dispose()
    }
  }

  async poll(): Promise<MediaGenerationPollResult> {
    throw new Error("Gemini image generation completes synchronously")
  }

  async materialize(reference: MediaGenerationProviderOutputReference, request: MediaGenerationAdapterRequest): Promise<MediaGenerationMaterializedOutput> {
    if (reference.kindOfReference !== "remote_url") throw new Error("Gemini image cannot materialize provider file output")
    return await materializeImageReference(reference, request, this.#fetch, this.#maxMaterializedBytes, "Gemini image")
  }
}

interface PreparedGeminiRequest {
  readonly endpointId: string
  readonly providerId: string
  readonly modelId: string
  readonly baseUrl: string
  readonly secretRef: string
  readonly body: Readonly<Record<string, JsonValue>>
}

function prepareRequest(request: MediaGenerationSubmitRequest): PreparedGeminiRequest {
  if (request.signal.aborted) throw new Error("Gemini image request is aborted")
  const endpoint = modelEndpointFromExecutionBinding(bindingEndpoint(request))
  if (endpoint.protocol.id !== "gemini-image") throw new Error(`unsupported media protocol: ${endpoint.protocol.id}`)
  if (request.binding.request.operation !== "image.generate" || request.binding.request.outputModality !== "image") {
    throw new Error("Gemini image supports only image.generate")
  }
  if (request.inputs.length > 0 && !endpoint.model.inputModalities.includes("image")) {
    throw new Error("Gemini image model does not accept reference images")
  }
  for (const input of request.inputs) {
    if (input.resource.kind !== "image") throw new Error("Gemini image references must be images")
  }
  const baseUrl = endpoint.connection.baseUrl?.replace(/\/+$/, "")
  if (baseUrl === undefined) throw new Error("Gemini image endpoint requires baseUrl")
  assertSafeBaseUrl(baseUrl, "Gemini image")
  const secretRef = endpoint.connection.secretRef
  if (secretRef === undefined || secretRef.trim().length === 0) throw new Error("Gemini image endpoint requires secretRef")
  const options = normalizedOptions(validateModelOptionValues(endpoint.model.generationOptions, request.binding.request.options))
  const input: JsonValue[] = [{ type: "text", text: request.binding.request.prompt }]
  for (const image of request.inputs) {
    const dataUrl = inputDataUrl(image.bytes, image.resource.mediaType)
    input.push({
      type: "image",
      data: dataUrl.slice(dataUrl.indexOf(",") + 1),
      mime_type: image.resource.mediaType ?? "image/png"
    })
  }
  const responseFormat: Record<string, JsonValue> = { type: "image" }
  for (const key of ["aspect_ratio", "image_size"] as const) {
    if (options[key] !== undefined) responseFormat[key] = options[key]
  }
  if (options.output_mime_type !== undefined) responseFormat.mime_type = options.output_mime_type
  const body: Record<string, JsonValue> = { model: endpoint.model.id, input, response_format: responseFormat }
  if (options.thinking_level !== undefined) body.generation_config = { thinking_level: options.thinking_level }
  return { endpointId: endpoint.id, providerId: endpoint.connection.providerId, modelId: endpoint.model.id, baseUrl, secretRef, body }
}

function parseOutputs(bytes: Uint8Array, prepared: PreparedGeminiRequest): readonly MediaGenerationProviderOutput[] {
  const response = record(JSON.parse(Buffer.from(bytes).toString("utf8")), "Gemini image response")
  const candidates: unknown[] = []
  const direct = response.output_image
  if (direct !== undefined) candidates.push(direct)
  if (Array.isArray(response.steps)) {
    for (const step of response.steps) {
      const row = record(step, "Gemini image step")
      if (row.type !== "model_output" || !Array.isArray(row.content)) continue
      candidates.push(...row.content)
    }
  }
  const outputs = candidates.flatMap((candidate) => {
    const item = record(candidate, "Gemini image output")
    if (item.type !== undefined && item.type !== "image") return []
    const data = item.data
    if (typeof data !== "string") return []
    return [parseBase64ImageOutput(data, 0, "Gemini image", optionalString(item.mime_type, "Gemini image mime_type") ?? "image/png")]
  })
  if (outputs.length === 0 || outputs.length > MAX_IMAGE_OUTPUT_COUNT) throw new Error("Gemini image response contains no valid image output")
  return outputs.map((output) => ({ ...output, metadata: { providerId: prepared.providerId, modelId: prepared.modelId } }))
}

function normalizedOptions(value: JsonValue): Record<string, JsonValue> {
  if (value === null) return {}
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("Gemini image options must be an object")
  const options: Record<string, JsonValue> = {}
  for (const [key, option] of Object.entries(value)) {
    if (RESERVED_OPTIONS.has(key)) throw new Error(`Gemini image option is reserved: ${key}`)
    if (!["aspect_ratio", "image_size", "output_mime_type", "thinking_level"].includes(key)) throw new Error(`Gemini image option is unsupported: ${key}`)
    if (key === "aspect_ratio" && (typeof option !== "string" || !ASPECT_RATIOS.has(option))) throw new Error("Gemini image aspect_ratio is unsupported")
    if (key === "image_size" && (typeof option !== "string" || !IMAGE_SIZES.has(option))) throw new Error("Gemini image image_size is unsupported")
    if (key === "output_mime_type" && (option !== "image/png" && option !== "image/jpeg")) throw new Error("Gemini image output_mime_type is unsupported")
    if (key === "thinking_level" && (typeof option !== "string" || !THINKING_LEVELS.has(option))) throw new Error("Gemini image thinking_level is unsupported")
    options[key] = option
  }
  return options
}

function bindingEndpoint(request: MediaGenerationAdapterRequest): ModelEndpointExecutionBinding {
  return { endpointId: request.binding.endpointId, endpointDigest: request.binding.endpointDigest, connection: request.binding.connection, protocol: request.binding.protocol, model: request.binding.model }
}
