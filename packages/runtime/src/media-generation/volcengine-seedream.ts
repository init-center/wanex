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
const RESERVED_OPTIONS = new Set(["model", "prompt", "image"])

export interface VolcengineSeedreamAdapterOptions {
  readonly secretResolver: SecretResolverPort
  readonly fetch?: ImageAdapterFetch
  readonly maxResponseBytes?: number
  readonly maxMaterializedBytes?: number
}

export class VolcengineSeedreamAdapter implements MediaGenerationAdapter {
  readonly protocolId = "volcengine-seedream"
  readonly #secretResolver: SecretResolverPort
  readonly #fetch: ImageAdapterFetch
  readonly #maxResponseBytes: number
  readonly #maxMaterializedBytes: number

  constructor(options: VolcengineSeedreamAdapterOptions) {
    this.#secretResolver = options.secretResolver
    this.#fetch = options.fetch ?? globalImageFetch
    this.#maxResponseBytes = positiveBound(options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES, "Seedream maxResponseBytes")
    this.#maxMaterializedBytes = positiveBound(options.maxMaterializedBytes ?? DEFAULT_MAX_MATERIALIZED_BYTES, "Seedream maxMaterializedBytes")
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
    let prepared: PreparedSeedreamRequest
    try { prepared = prepareRequest(request) } catch (error) { return rejected("invalid_request", error) }
    let secret
    try {
      secret = await this.#secretResolver.resolve(prepared.secretRef, { modelEndpointId: prepared.endpointId, signal: request.signal })
    } catch (error) { return rejected("credential_unavailable", error) }
    try {
      let apiKey: string
      try { apiKey = secret.reveal() } catch (error) { return rejected("credential_unavailable", error) }
      const response = await this.#fetch(`${prepared.baseUrl}/images/generations`, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify(prepared.body),
        signal: request.signal,
        redirect: "error"
      })
      try {
        const bytes = await readBoundedResponse(response, this.#maxResponseBytes, request.signal, "Seedream response")
        if (!response.ok) return rejectedHttp(response, bytes, "Seedream")
        return { status: "completed", outputs: parseOutputs(bytes, prepared) }
      } catch (error) { return rejected("invalid_provider_response", error) }
    } finally { secret.dispose() }
  }

  async poll(): Promise<MediaGenerationPollResult> {
    throw new Error("Seedream image generation completes synchronously")
  }

  async materialize(reference: MediaGenerationProviderOutputReference, request: MediaGenerationAdapterRequest): Promise<MediaGenerationMaterializedOutput> {
    if (reference.kindOfReference !== "remote_url") throw new Error("Seedream cannot materialize provider file output")
    return await materializeImageReference(reference, request, this.#fetch, this.#maxMaterializedBytes, "Seedream")
  }
}

interface PreparedSeedreamRequest {
  readonly endpointId: string
  readonly providerId: string
  readonly modelId: string
  readonly baseUrl: string
  readonly secretRef: string
  readonly body: Readonly<Record<string, JsonValue>>
}

function prepareRequest(request: MediaGenerationSubmitRequest): PreparedSeedreamRequest {
  if (request.signal.aborted) throw new Error("Seedream request is aborted")
  const endpoint = modelEndpointFromExecutionBinding(bindingEndpoint(request))
  if (endpoint.protocol.id !== "volcengine-seedream") throw new Error(`unsupported media protocol: ${endpoint.protocol.id}`)
  if (request.binding.request.operation !== "image.generate" || request.binding.request.outputModality !== "image") throw new Error("Seedream supports only image.generate")
  if (request.inputs.length > 0 && !endpoint.model.inputModalities.includes("image")) throw new Error("Seedream model does not accept reference images")
  for (const input of request.inputs) if (input.resource.kind !== "image") throw new Error("Seedream references must be images")
  const baseUrl = endpoint.connection.baseUrl?.replace(/\/+$/, "")
  if (baseUrl === undefined) throw new Error("Seedream endpoint requires baseUrl")
  assertSafeBaseUrl(baseUrl, "Seedream")
  const secretRef = endpoint.connection.secretRef
  if (secretRef === undefined || secretRef.trim().length === 0) throw new Error("Seedream endpoint requires secretRef")
  const options = normalizedOptions(validateModelOptionValues(endpoint.model.generationOptions, request.binding.request.options))
  const body: Record<string, JsonValue> = { model: endpoint.model.id, prompt: request.binding.request.prompt, ...options }
  if (request.inputs.length === 1) body.image = inputDataUrl(request.inputs[0]!.bytes, request.inputs[0]!.resource.mediaType)
  if (request.inputs.length > 1) body.image = request.inputs.map((input) => inputDataUrl(input.bytes, input.resource.mediaType))
  return { endpointId: endpoint.id, providerId: endpoint.connection.providerId, modelId: endpoint.model.id, baseUrl, secretRef, body }
}

function parseOutputs(bytes: Uint8Array, prepared: PreparedSeedreamRequest): readonly MediaGenerationProviderOutput[] {
  const response = record(JSON.parse(Buffer.from(bytes).toString("utf8")), "Seedream response")
  if (!Array.isArray(response.data) || response.data.length === 0 || response.data.length > MAX_IMAGE_OUTPUT_COUNT) throw new Error("Seedream response data must contain 1-16 outputs")
  return response.data.map((raw, index) => {
    const output = record(raw, `Seedream output ${index}`)
    const url = optionalString(output.url, `Seedream output ${index} URL`)
    if (url === undefined) throw new Error(`Seedream output ${index} has no URL`)
    return { ...parseRemoteImageOutput(url, index, "Seedream"), metadata: { providerId: prepared.providerId, modelId: prepared.modelId } }
  })
}

function normalizedOptions(value: JsonValue): Record<string, JsonValue> {
  if (value === null) return {}
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("Seedream options must be an object")
  const options: Record<string, JsonValue> = {}
  for (const [key, option] of Object.entries(value)) {
    if (RESERVED_OPTIONS.has(key)) throw new Error(`Seedream option is reserved: ${key}`)
    if (!["size", "watermark"].includes(key)) throw new Error(`Seedream option is unsupported: ${key}`)
    if (key === "size" && (typeof option !== "string" || !["1K", "1.5K", "2K", "3K", "4K", "auto"].includes(option))) throw new Error("Seedream size is unsupported")
    if (key === "watermark" && typeof option !== "boolean") throw new Error("Seedream watermark must be boolean")
    options[key] = option
  }
  return options
}

function bindingEndpoint(request: MediaGenerationAdapterRequest): ModelEndpointExecutionBinding {
  return { endpointId: request.binding.endpointId, endpointDigest: request.binding.endpointDigest, connection: request.binding.connection, protocol: request.binding.protocol, model: request.binding.model }
}
