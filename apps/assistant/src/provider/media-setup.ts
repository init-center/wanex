import { createHash } from "node:crypto"
import type { ModelEndpoint } from "@wanex/protocol"
import { imageGenerationOptionCatalog } from "@wanex/runtime/media-generation"
import { resolveImageGenerationInputModalities } from "./setup.js"

export type MediaProviderPresetId =
  | "openai-images"
  | "gemini-image"
  | "volcengine-seedream"
  | "openrouter-images"

export interface MediaProviderSetupInput {
  readonly connectionId?: string
  readonly presetId: MediaProviderPresetId
  readonly modelId: string
  readonly baseUrl?: string
  readonly acceptsReferenceImages?: boolean
  readonly credential?: string
}

export interface ResolvedMediaProviderEndpoint {
  readonly connectionId: string
  readonly endpoint: ModelEndpoint
}

const MEDIA_PROVIDER_DEFAULTS: Record<MediaProviderPresetId, {
  readonly providerId: string
  readonly baseUrl: string
  readonly protocolId: string
}> = {
  "openai-images": {
    providerId: "openai",
    baseUrl: "https://api.openai.com/v1",
    protocolId: "openai-images"
  },
  "gemini-image": {
    providerId: "google",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    protocolId: "gemini-image"
  },
  "volcengine-seedream": {
    providerId: "volcengine",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    protocolId: "volcengine-seedream"
  },
  "openrouter-images": {
    providerId: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1",
    protocolId: "openrouter-images"
  }
}

export function resolveMediaProviderEndpoint(
  request: MediaProviderSetupInput
): ResolvedMediaProviderEndpoint {
  const modelId = required(request.modelId, "media provider modelId")
  const defaults = MEDIA_PROVIDER_DEFAULTS[request.presetId]
  if (defaults === undefined) throw new Error(`unsupported media provider preset: ${request.presetId}`)
  const baseUrl = normalizeBaseUrl(request.baseUrl ?? defaults.baseUrl)
  if (request.acceptsReferenceImages !== undefined && typeof request.acceptsReferenceImages !== "boolean") {
    throw new Error("media provider acceptsReferenceImages must be boolean")
  }
  const inputModalities = resolveMediaInputModalities(request.presetId, modelId, request.acceptsReferenceImages)
  const connectionId = request.connectionId?.trim() || deriveConnectionId(request.presetId, baseUrl)
  const endpointId = `${connectionId}.image-generate`
  return {
    connectionId,
    endpoint: {
      id: endpointId,
      connection: {
        id: connectionId,
        providerId: defaults.providerId,
        baseUrl
      },
      protocol: { id: defaults.protocolId },
      model: {
        id: modelId,
        operations: ["image.generate"],
        inputModalities,
        outputModalities: ["image"],
        features: [],
        generationOptions: imageGenerationOptionCatalog(defaults.protocolId, modelId),
        catalog: {
          source: request.connectionId === undefined ? "builtin" : "custom",
          catalogId: `${defaults.providerId}.images`,
          revision: "m3-c"
        }
      }
    }
  }
}

function resolveMediaInputModalities(
  presetId: MediaProviderPresetId,
  modelId: string,
  acceptsReferenceImages: boolean | undefined
): readonly ("text" | "image")[] {
  if (acceptsReferenceImages === true) return ["text", "image"]
  if (acceptsReferenceImages === false) return ["text"]
  if (presetId === "openai-images") {
    return resolveImageGenerationInputModalities({ providerId: "openai", modelId })
  }
  if (presetId === "gemini-image") {
    return /^(?:gemini-(?:nano-banana|[0-9].*-image)|gemini-.*-image)/.test(modelId)
      ? ["text", "image"]
      : ["text"]
  }
  if (presetId === "volcengine-seedream") {
    return /seedream/i.test(modelId) ? ["text", "image"] : ["text"]
  }
  return ["text"]
}

function deriveConnectionId(presetId: MediaProviderPresetId, baseUrl: string): string {
  const digest = createHash("sha256").update(`${presetId}:${baseUrl}`).digest("hex").slice(0, 16)
  return `media-${presetId}-${digest}`
}

function normalizeBaseUrl(value: string): string {
  const normalized = required(value, "media provider baseUrl")
  let url: URL
  try { url = new URL(normalized) } catch { throw new Error("media provider baseUrl must be a valid URL") }
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback(url.hostname))) || url.username || url.password || url.search || url.hash) {
    throw new Error("media provider baseUrl is not allowed")
  }
  return url.toString().replace(/\/+$/, "")
}

function required(value: string, name: string): string {
  const normalized = value.trim()
  if (normalized.length === 0) throw new Error(`${name} must not be empty`)
  return normalized
}

function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1"
}
