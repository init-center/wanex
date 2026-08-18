import type {
  JsonValue,
  MediaGenerationProviderOutputReference,
  ModelEndpoint,
  ModelEndpointExecutionBinding
} from "@wanex/protocol"
import type { SecretResolverPort } from "../secrets/index.js"
import { modelEndpointFromExecutionBinding } from "../provider/index.js"
import type {
  MediaGenerationAdapter,
  MediaGenerationAdapterRequest,
  MediaGenerationMaterializedOutput,
  MediaGenerationPollResult,
  MediaGenerationProviderOutput,
  MediaGenerationSubmitResult
} from "./types.js"

const DEFAULT_MAX_RESPONSE_BYTES = 32 * 1024 * 1024
const DEFAULT_MAX_MATERIALIZED_BYTES = 100 * 1024 * 1024
const MAX_OUTPUT_COUNT = 16
const MAX_REMOTE_URL_LENGTH = 8_192
const RESERVED_OPTION_KEYS = new Set(["model", "prompt"])

export interface OpenAIImagesAdapterOptions {
  readonly secretResolver: SecretResolverPort
  readonly fetch?: OpenAIImagesFetch
  readonly maxResponseBytes?: number
  readonly maxMaterializedBytes?: number
}

export interface OpenAIImagesFetch {
  (input: string, init?: RequestInit): Promise<Response>
}

export class OpenAIImagesAdapter implements MediaGenerationAdapter {
  readonly protocolId = "openai-images"
  readonly #secretResolver: SecretResolverPort
  readonly #fetch: OpenAIImagesFetch
  readonly #maxResponseBytes: number
  readonly #maxMaterializedBytes: number

  constructor(options: OpenAIImagesAdapterOptions) {
    this.#secretResolver = options.secretResolver
    this.#fetch = options.fetch ?? globalOpenAIImagesFetch
    this.#maxResponseBytes = positiveBound(
      options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
      "OpenAI Images maxResponseBytes"
    )
    this.#maxMaterializedBytes = positiveBound(
      options.maxMaterializedBytes ?? DEFAULT_MAX_MATERIALIZED_BYTES,
      "OpenAI Images maxMaterializedBytes"
    )
  }

  canExecute(modelEndpoint: ModelEndpoint): boolean {
    return (
      modelEndpoint.protocol.id === this.protocolId &&
      modelEndpoint.connection.baseUrl !== undefined &&
      modelEndpoint.connection.secretRef !== undefined &&
      modelEndpoint.model.operations.includes("image.generate") &&
      modelEndpoint.model.inputModalities.includes("text") &&
      modelEndpoint.model.outputModalities.includes("image")
    )
  }

  async submit(
    request: MediaGenerationAdapterRequest
  ): Promise<MediaGenerationSubmitResult> {
    let prepared: PreparedOpenAIImagesRequest
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
      try {
        apiKey = secret.reveal()
      } catch (error) {
        return rejected("credential_unavailable", error)
      }
      const response = await this.#fetch(
        `${prepared.baseUrl}/images/generations`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json"
          },
          body: JSON.stringify(prepared.body),
          signal: request.signal,
          redirect: "error"
        }
      )
      try {
        const bytes = await readBoundedResponse(
          response,
          this.#maxResponseBytes,
          request.signal,
          "OpenAI Images response"
        )
        if (!response.ok) {
          return rejectedHttp(response, bytes)
        }
        return {
          status: "completed",
          outputs: parseOutputs(bytes, prepared)
        }
      } catch (error) {
        return rejected("invalid_provider_response", error)
      }
    } finally {
      secret.dispose()
    }
  }

  async poll(): Promise<MediaGenerationPollResult> {
    throw new Error("OpenAI Images generation completes synchronously")
  }

  async materialize(
    reference: MediaGenerationProviderOutputReference,
    request: MediaGenerationAdapterRequest
  ): Promise<MediaGenerationMaterializedOutput> {
    if (reference.kindOfReference !== "remote_url") {
      throw new Error("OpenAI Images cannot materialize provider file output")
    }
    const url = safeRemoteUrl(reference.url)
    const response = await this.#fetch(url, {
      method: "GET",
      signal: request.signal,
      redirect: "error"
    })
    if (!response.ok) {
      throw new Error(
        `OpenAI Images output download failed: ${response.status} ${response.statusText}`.trim()
      )
    }
    const mediaType = normalizedImageMediaType(
      response.headers.get("content-type")
    )
    const bytes = await readBoundedResponse(
      response,
      this.#maxMaterializedBytes,
      request.signal,
      "OpenAI Images output"
    )
    return {
      bytes,
      kind: "image",
      mediaType,
      ...(reference.label === undefined ? {} : { label: reference.label }),
      ...(reference.metadata === undefined
        ? {}
        : { metadata: reference.metadata }),
      ...(reference.width === undefined ? {} : { width: reference.width }),
      ...(reference.height === undefined ? {} : { height: reference.height })
    }
  }
}

interface PreparedOpenAIImagesRequest {
  readonly endpointId: string
  readonly providerId: string
  readonly modelId: string
  readonly baseUrl: string
  readonly secretRef: string
  readonly body: Readonly<Record<string, JsonValue>>
  readonly outputMediaType: string
}

function prepareRequest(
  request: MediaGenerationAdapterRequest
): PreparedOpenAIImagesRequest {
  if (request.signal.aborted) {
    throw new Error("OpenAI Images request is aborted")
  }
  const endpoint = modelEndpointFromExecutionBinding(bindingEndpoint(request))
  if (endpoint.protocol.id !== "openai-images") {
    throw new Error(`unsupported media protocol: ${endpoint.protocol.id}`)
  }
  if (
    request.binding.request.operation !== "image.generate" ||
    request.binding.request.outputModality !== "image"
  ) {
    throw new Error("OpenAI Images supports only image.generate")
  }
  if (request.binding.request.inputResources.length > 0) {
    throw new Error("OpenAI Images generation does not accept input resources")
  }
  const baseUrl = requiredConnectionField(endpoint.connection.baseUrl, "baseUrl")
  assertSafeBaseUrl(baseUrl)
  const secretRef = requiredConnectionField(
    endpoint.connection.secretRef,
    "secretRef"
  )
  const options = normalizedOptions(request.binding.request.options)
  const outputFormat = options.output_format
  return {
    endpointId: endpoint.id,
    providerId: endpoint.connection.providerId,
    modelId: endpoint.model.id,
    baseUrl: baseUrl.replace(/\/+$/, ""),
    secretRef,
    body: Object.fromEntries([
      ["model", endpoint.model.id],
      ["prompt", request.binding.request.prompt],
      ...Object.entries(options)
    ]),
    outputMediaType:
      outputFormat === "jpeg"
        ? "image/jpeg"
        : outputFormat === "webp"
          ? "image/webp"
          : "image/png"
  }
}

function bindingEndpoint(
  request: MediaGenerationAdapterRequest
): ModelEndpointExecutionBinding {
  return {
    endpointId: request.binding.endpointId,
    endpointDigest: request.binding.endpointDigest,
    connection: request.binding.connection,
    protocol: request.binding.protocol,
    model: request.binding.model
  }
}

function normalizedOptions(value: JsonValue): Record<string, JsonValue> {
  if (value === null) return {}
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("OpenAI Images options must be an object")
  }
  const options: Record<string, JsonValue> = {}
  for (const [key, option] of Object.entries(value)) {
    if (RESERVED_OPTION_KEYS.has(key)) {
      throw new Error(`OpenAI Images option is reserved: ${key}`)
    }
    options[key] = option
  }
  return options
}

function parseOutputs(
  bytes: Uint8Array,
  prepared: PreparedOpenAIImagesRequest
): readonly MediaGenerationProviderOutput[] {
  if (bytes.byteLength === 0) {
    throw new Error("OpenAI Images response body is empty")
  }
  const parsed = JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown
  const response = record(parsed, "OpenAI Images response")
  if (!Array.isArray(response.data)) {
    throw new Error("OpenAI Images response data must be an array")
  }
  if (response.data.length === 0 || response.data.length > MAX_OUTPUT_COUNT) {
    throw new Error(
      `OpenAI Images response data must contain 1-${MAX_OUTPUT_COUNT} outputs`
    )
  }
  const created = optionalFiniteNumber(response.created)
  const usage = isJsonValue(response.usage) ? response.usage : undefined
  return response.data.map((raw, index) => {
    const output = record(raw, `OpenAI Images output ${index}`)
    const revisedPrompt = optionalNonEmptyString(output.revised_prompt)
    const metadata: JsonValue = {
      providerId: prepared.providerId,
      modelId: prepared.modelId,
      ...(created === undefined ? {} : { created }),
      ...(revisedPrompt === undefined ? {} : { revisedPrompt }),
      ...(usage === undefined ? {} : { usage })
    }
    const base64 = optionalNonEmptyString(output.b64_json)
    const url = optionalNonEmptyString(output.url)
    if ((base64 === undefined) === (url === undefined)) {
      throw new Error(
        `OpenAI Images output ${index} must contain exactly one of b64_json or url`
      )
    }
    if (base64 !== undefined) {
      validateBase64(base64, index)
      return {
        kindOfOutput: "base64" as const,
        data: base64,
        kind: "image" as const,
        mediaType: prepared.outputMediaType,
        metadata
      }
    }
    return {
      kindOfOutput: "remote_url" as const,
      provider: prepared.providerId,
      url: safeRemoteUrl(url!),
      kind: "image" as const,
      metadata
    }
  })
}

async function readBoundedResponse(
  response: Response,
  maxBytes: number,
  signal: AbortSignal,
  label: string
): Promise<Uint8Array> {
  const declared = response.headers.get("content-length")
  if (declared !== null) {
    const size = Number(declared)
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new Error(`${label} content-length is invalid`)
    }
    if (size > maxBytes) throw new Error(`${label} exceeds ${maxBytes} bytes`)
  }
  if (response.body === null) return new Uint8Array()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      if (signal.aborted) throw new Error(`${label} read was aborted`)
      const chunk = await reader.read()
      if (chunk.done) break
      total += chunk.value.byteLength
      if (total > maxBytes) {
        await reader.cancel(`${label} exceeds ${maxBytes} bytes`)
        throw new Error(`${label} exceeds ${maxBytes} bytes`)
      }
      chunks.push(chunk.value)
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total)
}

function rejected(
  type: string,
  error: unknown
): Extract<MediaGenerationSubmitResult, { status: "rejected" }> {
  return {
    status: "rejected",
    error: {
      type,
      message: error instanceof Error ? error.message : String(error)
    }
  }
}

function rejectedHttp(
  response: Response,
  bytes: Uint8Array
): Extract<MediaGenerationSubmitResult, { status: "rejected" }> {
  const detail = Buffer.from(bytes).toString("utf8").trim()
  return {
    status: "rejected",
    error: {
      type: "provider_rejection",
      statusCode: response.status,
      message: `OpenAI Images request failed: ${response.status} ${response.statusText}${
        detail.length === 0 ? "" : ` ${detail}`
      }`.trim()
    }
  }
}

function safeRemoteUrl(value: string): string {
  if (value.length > MAX_REMOTE_URL_LENGTH) {
    throw new Error("OpenAI Images output URL is too long")
  }
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error("OpenAI Images output URL is invalid")
  }
  if (
    url.protocol !== "https:" ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    unsafeHostname(url.hostname)
  ) {
    throw new Error("OpenAI Images output URL is unsafe")
  }
  return url.toString()
}

function unsafeHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "")
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.startsWith("[")
  ) {
    return true
  }
  const parts = normalized.split(".")
  if (parts.length !== 4 || !parts.every((part) => /^\d{1,3}$/.test(part))) {
    return false
  }
  const octets = parts.map(Number)
  if (octets.some((part) => part < 0 || part > 255)) return true
  const [first, second] = octets as [number, number, number, number]
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    first >= 224
  )
}

function assertSafeBaseUrl(value: string): void {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error("OpenAI Images baseUrl is invalid")
  }
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    throw new Error("OpenAI Images baseUrl is unsafe")
  }
}

function validateBase64(value: string, index: number): void {
  if (
    value.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value
    )
  ) {
    throw new Error(`OpenAI Images output ${index} contains invalid base64`)
  }
  const bytes = Buffer.from(value, "base64")
  if (bytes.byteLength === 0) {
    throw new Error(`OpenAI Images output ${index} contains empty base64`)
  }
  if (bytes.toString("base64") !== value) {
    throw new Error(`OpenAI Images output ${index} contains non-canonical base64`)
  }
}

function normalizedImageMediaType(value: string | null): string {
  const mediaType = value?.split(";", 1)[0]?.trim().toLowerCase()
  if (mediaType === undefined || !mediaType.startsWith("image/")) {
    throw new Error("OpenAI Images output content-type must be image/*")
  }
  return mediaType
}

function record(
  value: unknown,
  label: string
): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as Readonly<Record<string, unknown>>
}

function optionalNonEmptyString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("OpenAI Images response string must not be empty")
  }
  return value
}

function optionalFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true
  }
  if (typeof value === "number") return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(isJsonValue)
  return (
    typeof value === "object" &&
    value !== null &&
    Object.values(value).every(isJsonValue)
  )
}

function requiredConnectionField(
  value: string | undefined,
  field: string
): string {
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`OpenAI Images endpoint requires ${field}`)
  }
  return value
}

function positiveBound(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer`)
  }
  return value
}

function globalOpenAIImagesFetch(
  input: string,
  init?: RequestInit
): Promise<Response> {
  if (globalThis.fetch === undefined) {
    throw new Error("global fetch is not available")
  }
  return globalThis.fetch(input, init)
}
