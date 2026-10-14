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
  parseRemoteImageOutput,
  positiveBound,
  record,
  readBoundedResponse,
  rejected,
  rejectedHttp,
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
const RESERVED_OPTIONS = new Set(["model", "prompt", "input_references"])

export interface OpenRouterImagesAdapterOptions {
  readonly secretResolver: SecretResolverPort
  readonly fetch?: ImageAdapterFetch
  readonly maxResponseBytes?: number
  readonly maxMaterializedBytes?: number
}

export class OpenRouterImagesAdapter implements MediaGenerationAdapter {
  readonly protocolId = "openrouter-images"
  readonly #secretResolver: SecretResolverPort
  readonly #fetch: ImageAdapterFetch
  readonly #maxResponseBytes: number
  readonly #maxMaterializedBytes: number

  constructor(options: OpenRouterImagesAdapterOptions) {
    this.#secretResolver = options.secretResolver
    this.#fetch = options.fetch ?? globalImageFetch
    this.#maxResponseBytes = positiveBound(options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES, "OpenRouter Images maxResponseBytes")
    this.#maxMaterializedBytes = positiveBound(options.maxMaterializedBytes ?? DEFAULT_MAX_MATERIALIZED_BYTES, "OpenRouter Images maxMaterializedBytes")
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
    let prepared: PreparedOpenRouterRequest
    try { prepared = prepareRequest(request) } catch (error) { return rejected("invalid_request", error) }
    let secret
    try {
      secret = await this.#secretResolver.resolve(prepared.secretRef, { modelEndpointId: prepared.endpointId, signal: request.signal })
    } catch (error) { return rejected("credential_unavailable", error) }
    try {
      let apiKey: string
      try { apiKey = secret.reveal() } catch (error) { return rejected("credential_unavailable", error) }
      const response = await this.#fetch(`${prepared.baseUrl}/images`, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify(prepared.body),
        signal: request.signal,
        redirect: "error"
      })
      try {
        const bytes = await readBoundedResponse(response, this.#maxResponseBytes, request.signal, "OpenRouter Images response")
        if (!response.ok) return rejectedHttp(response, bytes, "OpenRouter Images")
        return { status: "completed", outputs: parseOutputs(bytes, prepared) }
      } catch (error) { return rejected("invalid_provider_response", error) }
    } finally { secret.dispose() }
  }

  async poll(): Promise<MediaGenerationPollResult> {
    throw new Error("OpenRouter Images generation completes synchronously")
  }

  async materialize(reference: MediaGenerationProviderOutputReference, request: MediaGenerationAdapterRequest): Promise<MediaGenerationMaterializedOutput> {
    if (reference.kindOfReference !== "remote_url") throw new Error("OpenRouter Images cannot materialize provider file output")
    return await materializeImageReference(reference, request, this.#fetch, this.#maxMaterializedBytes, "OpenRouter Images")
  }
}

interface PreparedOpenRouterRequest {
  readonly endpointId: string
  readonly providerId: string
  readonly modelId: string
  readonly baseUrl: string
  readonly secretRef: string
  readonly body: Readonly<Record<string, JsonValue>>
}

function prepareRequest(request: MediaGenerationSubmitRequest): PreparedOpenRouterRequest {
  if (request.signal.aborted) throw new Error("OpenRouter Images request is aborted")
  const endpoint = modelEndpointFromExecutionBinding(bindingEndpoint(request))
  if (endpoint.protocol.id !== "openrouter-images") throw new Error(`unsupported media protocol: ${endpoint.protocol.id}`)
  if (request.binding.request.operation !== "image.generate" || request.binding.request.outputModality !== "image") throw new Error("OpenRouter Images supports only image.generate")
  if (request.inputs.length > 0 && !endpoint.model.inputModalities.includes("image")) throw new Error("OpenRouter image model does not accept reference images")
  for (const input of request.inputs) if (input.resource.kind !== "image") throw new Error("OpenRouter references must be images")
  const baseUrl = endpoint.connection.baseUrl?.replace(/\/+$/, "")
  if (baseUrl === undefined) throw new Error("OpenRouter Images endpoint requires baseUrl")
  assertSafeBaseUrl(baseUrl, "OpenRouter Images")
  const secretRef = endpoint.connection.secretRef
  if (secretRef === undefined || secretRef.trim().length === 0) throw new Error("OpenRouter Images endpoint requires secretRef")
  const options = normalizedOptions(validateModelOptionValues(endpoint.model.generationOptions, request.binding.request.options))
  const body: Record<string, JsonValue> = { model: endpoint.model.id, prompt: request.binding.request.prompt, ...options }
  if (request.inputs.length > 0) body.input_references = request.inputs.map((input) => inputDataUrl(input.bytes, input.resource.mediaType))
  return { endpointId: endpoint.id, providerId: endpoint.connection.providerId, modelId: endpoint.model.id, baseUrl, secretRef, body }
}

function parseOutputs(bytes: Uint8Array, prepared: PreparedOpenRouterRequest): readonly MediaGenerationProviderOutput[] {
  const response = record(JSON.parse(Buffer.from(bytes).toString("utf8")), "OpenRouter Images response")
  if (!Array.isArray(response.data) || response.data.length === 0 || response.data.length > MAX_IMAGE_OUTPUT_COUNT) throw new Error("OpenRouter Images response data must contain 1-16 outputs")
  return response.data.map((raw, index) => {
    const output = record(raw, `OpenRouter Images output ${index}`)
    const base64 = optionalString(output.b64_json, `OpenRouter Images output ${index} b64_json`)
    const url = optionalString(output.url, `OpenRouter Images output ${index} URL`)
    if ((base64 === undefined) === (url === undefined)) throw new Error(`OpenRouter Images output ${index} must contain exactly one of b64_json or url`)
    const parsed = base64 === undefined
      ? parseRemoteImageOutput(url, index, "OpenRouter Images")
      : parseBase64ImageOutput(base64, index, "OpenRouter Images", "image/png")
    const revisedPrompt = optionalString(
      output.revised_prompt,
      `OpenRouter Images output ${index} revised_prompt`
    )
    return {
      ...parsed,
      metadata: {
        providerId: prepared.providerId,
        modelId: prepared.modelId,
        ...(revisedPrompt === undefined ? {} : { revisedPrompt })
      }
    }
  })
}

function normalizedOptions(value: JsonValue): Record<string, JsonValue> {
  if (value === null) return {}
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("OpenRouter Images options must be an object")
  const options: Record<string, JsonValue> = {}
  for (const [key, option] of Object.entries(value)) {
    if (RESERVED_OPTIONS.has(key)) throw new Error(`OpenRouter Images option is reserved: ${key}`)
    if (!["size", "aspect_ratio", "resolution", "n", "output_format", "background", "quality"].includes(key)) throw new Error(`OpenRouter Images option is unsupported: ${key}`)
    if (key === "n" && (!Number.isSafeInteger(option) || Number(option) < 1 || Number(option) > MAX_IMAGE_OUTPUT_COUNT)) throw new Error("OpenRouter Images n must be an integer from 1 to 16")
    if (key !== "n" && typeof option !== "string") throw new Error(`OpenRouter Images ${key} must be a string`)
    options[key] = option
  }
  return options
}

function bindingEndpoint(request: MediaGenerationAdapterRequest): ModelEndpointExecutionBinding {
  return { endpointId: request.binding.endpointId, endpointDigest: request.binding.endpointDigest, connection: request.binding.connection, protocol: request.binding.protocol, model: request.binding.model }
}
