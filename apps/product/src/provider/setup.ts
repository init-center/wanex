import { createHash } from "node:crypto"
import type {
  ModelDescriptor,
  ModelEndpoint,
  ModelFeature
} from "@wanex/protocol"

export type StandardProviderPresetId =
  | "openai"
  | "anthropic"
  | "deepseek"

export type ProviderPresetId =
  | StandardProviderPresetId
  | "openai-compatible"

export interface ProviderSetupInput {
  readonly connectionId?: string
  readonly presetId: ProviderPresetId
  readonly conversationModelId: string
  readonly conversationInputModalities?: readonly string[]
  readonly conversationFeatures?: readonly ModelFeature[]
  readonly imageGenerationModelId?: string
  readonly baseUrl?: string
  readonly credential?: string
  readonly makeConversationActive?: boolean
}

export interface ConversationModelResolver {
  resolveConversationModel(
    providerId: StandardProviderPresetId,
    modelId: string
  ): ModelDescriptor
}

export interface ProviderPreset {
  readonly id: ProviderPresetId
  readonly label: string
  readonly customBaseUrl: boolean
}

export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  { id: "openai", label: "OpenAI", customBaseUrl: false },
  { id: "anthropic", label: "Anthropic", customBaseUrl: false },
  { id: "deepseek", label: "DeepSeek", customBaseUrl: false },
  {
    id: "openai-compatible",
    label: "Custom OpenAI-compatible",
    customBaseUrl: true
  }
]

export interface ResolvedCredentialEndpoints {
  readonly connectionId: string
  readonly conversationEndpoint: ModelEndpoint
  readonly imageGenerationEndpoint?: ModelEndpoint
}

const STANDARD_PROVIDER_CONNECTIONS = {
  openai: {
    id: "openai",
    providerId: "openai",
    baseUrl: "https://api.openai.com/v1",
    protocol: { id: "openai-chat-completions" }
  },
  anthropic: {
    id: "anthropic",
    providerId: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    protocol: { id: "anthropic-messages", version: "2023-06-01" }
  },
  deepseek: {
    id: "deepseek",
    providerId: "deepseek",
    baseUrl: "https://api.deepseek.com/v1",
    protocol: { id: "openai-chat-completions" }
  }
} as const

export function resolveCredentialEndpoints(
  request: ProviderSetupInput,
  modelResolver: ConversationModelResolver
): ResolvedCredentialEndpoints {
  const conversationModelId = normalizeRequiredString(
    request.conversationModelId,
    "provider conversationModelId"
  )
  const imageGenerationModelId = normalizeOptionalString(
    request.imageGenerationModelId
  )
  if (
    imageGenerationModelId !== undefined &&
    request.presetId !== "openai" &&
    request.presetId !== "openai-compatible"
  ) {
    throw new ProviderPresetInputError(
      `${request.presetId} preset does not support imageGenerationModelId`
    )
  }
  if (request.presetId === "openai-compatible") {
    const baseUrl = normalizeProviderBaseUrl(request.baseUrl)
    const id = customEndpointId(baseUrl)
    const inputModalities = normalizeCustomConversationInputModalities(
      request.conversationInputModalities
    )
    const features = normalizeCustomConversationFeatures(
      request.conversationFeatures
    )
    return {
      connectionId: id,
      conversationEndpoint: {
        id,
        connection: {
          id,
          providerId: "openai-compatible",
          baseUrl
        },
        protocol: { id: "openai-chat-completions" },
        model:
          request.conversationInputModalities === undefined &&
          request.conversationFeatures === undefined
          ? unresolvedConversationModel(
              request.presetId,
              conversationModelId,
              `${baseUrl}#conversation`
            )
          : {
              id: conversationModelId,
              operations: ["conversation"],
              inputModalities,
              outputModalities: ["text"],
              features,
              catalog: {
                source: "custom",
                catalogId: `${baseUrl}#conversation`,
                revision: "explicit"
              }
            },
      },
      ...(imageGenerationModelId === undefined
        ? {}
        : {
            imageGenerationEndpoint: imageGenerationEndpoint({
              id: `${id}.image-generate`,
              connectionId: id,
              providerId: "openai-compatible",
              baseUrl,
              modelId: imageGenerationModelId,
              catalog: {
                source: "custom",
                catalogId: `${baseUrl}#images`,
                revision: "1"
              }
            })
          })
    }
  }

  if (request.baseUrl !== undefined) {
    throw new ProviderPresetInputError(
      "standard provider preset does not accept baseUrl"
    )
  }
  if (request.conversationInputModalities !== undefined) {
    throw new ProviderPresetInputError(
      "standard provider preset does not accept conversationInputModalities"
    )
  }
  if (request.conversationFeatures !== undefined) {
    throw new ProviderPresetInputError(
      "standard provider preset does not accept conversationFeatures"
    )
  }
  const preset = STANDARD_PROVIDER_CONNECTIONS[request.presetId]
  return {
    connectionId: preset.id,
    conversationEndpoint: {
      id: preset.id,
      connection: {
        id: preset.id,
        providerId: preset.providerId,
        baseUrl: preset.baseUrl
      },
      protocol: preset.protocol,
      model: modelResolver.resolveConversationModel(
        request.presetId,
        conversationModelId
      ),
    },
    ...(imageGenerationModelId === undefined
      ? {}
      : {
          imageGenerationEndpoint: imageGenerationEndpoint({
            id: `${preset.id}.image-generate`,
            connectionId: preset.id,
            providerId: preset.providerId,
            baseUrl: preset.baseUrl,
            modelId: imageGenerationModelId,
            catalog: builtinCatalog("openai.images")
          })
        })
  }
}

function normalizeCustomConversationInputModalities(
  values: readonly string[] | undefined
): readonly ("text" | "image")[] {
  if (values === undefined) return ["text"]
  if (!Array.isArray(values) || values.length === 0) {
    throw new ProviderPresetInputError(
      "custom conversationInputModalities must be a non-empty array"
    )
  }
  const normalized = new Set<string>()
  for (const value of values) {
    if (value !== "text" && value !== "image") {
      throw new ProviderPresetInputError(
        `custom conversation input modality is not supported: ${String(value)}`
      )
    }
    if (normalized.has(value)) {
      throw new ProviderPresetInputError(
        `custom conversation input modality is duplicated: ${value}`
      )
    }
    normalized.add(value)
  }
  if (!normalized.has("text")) {
    throw new ProviderPresetInputError(
      "custom conversationInputModalities must include text"
    )
  }
  return normalized.has("image") ? ["text", "image"] : ["text"]
}

function normalizeCustomConversationFeatures(
  values: readonly ModelFeature[] | undefined
): readonly "tool_calling"[] {
  if (values === undefined) return []
  if (!Array.isArray(values)) {
    throw new ProviderPresetInputError(
      "custom conversationFeatures must be an array"
    )
  }
  const normalized = new Set<ModelFeature>()
  for (const value of values) {
    if (value !== "tool_calling") {
      throw new ProviderPresetInputError(
        `custom conversation feature is not supported: ${String(value)}`
      )
    }
    if (normalized.has(value)) {
      throw new ProviderPresetInputError(
        `custom conversation feature is duplicated: ${value}`
      )
    }
    normalized.add(value)
  }
  return normalized.has("tool_calling") ? ["tool_calling"] : []
}

export function normalizeProviderBaseUrl(
  value: string | undefined
): string {
  const input = normalizeRequiredString(value, "custom provider baseUrl")
  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw new ProviderPresetInputError(
      "custom provider baseUrl must be a valid URL"
    )
  }
  const secure = url.protocol === "https:"
  const loopbackHttp = url.protocol === "http:" && isLoopbackHost(url.hostname)
  if (
    (!secure && !loopbackHttp) ||
    url.hostname.length === 0 ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.hash.length > 0 ||
    url.search.length > 0
  ) {
    throw new ProviderPresetInputError(
      "custom provider baseUrl is not allowed"
    )
  }
  return url.toString().replace(/\/+$/, "")
}

export function isProviderPresetId(
  value: string
): value is ProviderPresetId {
  return PROVIDER_PRESETS.some((preset) => preset.id === value)
}

export function inferProviderPresetId(input: {
  readonly providerId: string
  readonly baseUrl?: string
}): ProviderPresetId | undefined {
  for (const [presetId, connection] of Object.entries(
    STANDARD_PROVIDER_CONNECTIONS
  )) {
    if (
      input.providerId === connection.providerId &&
      input.baseUrl === connection.baseUrl
    ) {
      return presetId as StandardProviderPresetId
    }
  }
  return input.providerId === "openai-compatible" && input.baseUrl !== undefined
    ? "openai-compatible"
    : undefined
}

export class ProviderPresetInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ProviderPresetInputError"
  }
}

export function unresolvedConversationModel(
  providerId: string,
  modelId: string,
  catalogId = `${providerId}.unresolved`
): ModelDescriptor {
  return {
    id: normalizeRequiredString(modelId, "provider conversationModelId"),
    operations: ["conversation"],
    inputModalities: ["text"],
    outputModalities: ["text"],
    features: [],
    catalog: {
      source: "custom",
      catalogId,
      revision: "unresolved"
    }
  }
}

function imageGenerationEndpoint(options: {
  readonly id: string
  readonly connectionId: string
  readonly providerId: string
  readonly baseUrl: string
  readonly modelId: string
  readonly catalog: ModelDescriptor["catalog"]
}): ModelEndpoint {
  return {
    id: options.id,
    connection: {
      id: options.connectionId,
      providerId: options.providerId,
      baseUrl: options.baseUrl
    },
    protocol: { id: "openai-images" },
    model: {
      id: options.modelId,
      operations: ["image.generate"],
      inputModalities: ["text"],
      outputModalities: ["image"],
      features: [],
      catalog: options.catalog
    }
  }
}

function builtinCatalog(catalogId: string): ModelDescriptor["catalog"] {
  return {
    source: "builtin",
    catalogId,
    revision: "2026-07-28"
  }
}

function customEndpointId(baseUrl: string): string {
  const digest = createHash("sha256").update(baseUrl).digest("hex").slice(0, 16)
  return `openai-compatible-${digest}`
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1"
}

function normalizeRequiredString(
  value: string | undefined,
  name: string
): string {
  const normalized = value?.trim() ?? ""
  if (normalized.length === 0) {
    throw new ProviderPresetInputError(
      `${name} must not be empty`
    )
  }
  return normalized
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  return normalizeRequiredString(value, "provider imageGenerationModelId")
}
