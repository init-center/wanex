import type { JsonValue } from "@wanex/protocol"
import type {
  MediaGenerationMaterializedOutput,
  MediaGenerationProviderOutput,
  MediaGenerationSubmitResult
} from "./types.js"

export type ImageAdapterFetch = (
  input: string,
  init?: RequestInit
) => Promise<Response>

export const MAX_IMAGE_OUTPUT_COUNT = 16
export const MAX_IMAGE_REMOTE_URL_LENGTH = 8_192

export async function readBoundedResponse(
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

export function inputDataUrl(
  bytes: Uint8Array,
  mediaType: string | undefined
): string {
  const normalized = mediaType?.trim().toLowerCase() || "image/png"
  if (!/^image\/(?:png|jpeg|jpg|webp|gif|heic|heif|avif)$/.test(normalized)) {
    throw new Error(`unsupported image input media type: ${normalized}`)
  }
  const canonicalType = normalized === "image/jpg" ? "image/jpeg" : normalized
  return `data:${canonicalType};base64,${Buffer.from(bytes).toString("base64")}`
}

export function safeRemoteUrl(value: string, label: string): string {
  if (value.length > MAX_IMAGE_REMOTE_URL_LENGTH) {
    throw new Error(`${label} output URL is too long`)
  }
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${label} output URL is invalid`)
  }
  if (
    url.protocol !== "https:" ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    unsafeHostname(url.hostname)
  ) {
    throw new Error(`${label} output URL is unsafe`)
  }
  return url.toString()
}

export function assertSafeBaseUrl(value: string, label: string): void {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${label} baseUrl is invalid`)
  }
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    throw new Error(`${label} baseUrl is unsafe`)
  }
}

export async function materializeImageReference(
  reference: { readonly url: string; readonly label?: string; readonly metadata?: JsonValue; readonly width?: number; readonly height?: number },
  request: { readonly signal: AbortSignal },
  fetch: ImageAdapterFetch,
  maxBytes: number,
  label: string
): Promise<MediaGenerationMaterializedOutput> {
  const url = safeRemoteUrl(reference.url, label)
  const response = await fetch(url, {
    method: "GET",
    signal: request.signal,
    redirect: "error"
  })
  if (!response.ok) {
    throw new Error(
      `${label} output download failed: ${response.status} ${response.statusText}`.trim()
    )
  }
  const mediaType = normalizedImageMediaType(response.headers.get("content-type"), label)
  const bytes = await readBoundedResponse(response, maxBytes, request.signal, `${label} output`)
  return {
    bytes,
    kind: "image",
    mediaType,
    ...(reference.label === undefined ? {} : { label: reference.label }),
    ...(reference.metadata === undefined ? {} : { metadata: reference.metadata }),
    ...(reference.width === undefined ? {} : { width: reference.width }),
    ...(reference.height === undefined ? {} : { height: reference.height })
  }
}

export function parseBase64ImageOutput(
  value: unknown,
  index: number,
  label: string,
  mediaType = "image/png"
): MediaGenerationProviderOutput {
  const data = requiredString(value, `${label} output ${index} base64`)
  validateBase64(data, `${label} output ${index}`)
  return {
    kindOfOutput: "base64",
    data,
    kind: "image",
    mediaType
  }
}

export function parseRemoteImageOutput(
  value: unknown,
  index: number,
  label: string
): MediaGenerationProviderOutput {
  const url = safeRemoteUrl(
    requiredString(value, `${label} output ${index} URL`),
    label
  )
  return {
    kindOfOutput: "remote_url",
    provider: label,
    url,
    kind: "image"
  }
}

export function rejected(
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

export function rejectedHttp(
  response: Response,
  bytes: Uint8Array,
  label: string
): Extract<MediaGenerationSubmitResult, { status: "rejected" }> {
  const detail = Buffer.from(bytes).toString("utf8").trim()
  return {
    status: "rejected",
    error: {
      type: "provider_rejection",
      statusCode: response.status,
      message: `${label} request failed: ${response.status} ${response.statusText}${detail.length === 0 ? "" : ` ${detail}`}`.trim()
    }
  }
}

export function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as Readonly<Record<string, unknown>>
}

export function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`)
  }
  return value
}

export function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null) return undefined
  return requiredString(value, label)
}

export function normalizedImageMediaType(value: string | null, label: string): string {
  const mediaType = value?.split(";", 1)[0]?.trim().toLowerCase()
  if (mediaType === undefined || !mediaType.startsWith("image/")) {
    throw new Error(`${label} output content-type must be image/*`)
  }
  return mediaType
}

export function positiveBound(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer`)
  }
  return value
}

export function validateBase64(value: string, label: string): void {
  if (
    value.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) {
    throw new Error(`${label} contains invalid base64`)
  }
  const bytes = Buffer.from(value, "base64")
  if (bytes.byteLength === 0 || bytes.toString("base64") !== value) {
    throw new Error(`${label} contains non-canonical or empty base64`)
  }
}

function unsafeHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "")
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.startsWith("[")
  ) return true
  const parts = normalized.split(".")
  if (parts.length !== 4 || !parts.every((part) => /^\d{1,3}$/.test(part))) return false
  const octets = parts.map(Number)
  if (octets.some((part) => part < 0 || part > 255)) return true
  const [first, second] = octets as [number, number, number, number]
  return first === 0 || first === 10 || first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) || first >= 224
}

export function globalImageFetch(input: string, init?: RequestInit): Promise<Response> {
  if (globalThis.fetch === undefined) throw new Error("global fetch is not available")
  return globalThis.fetch(input, init)
}
