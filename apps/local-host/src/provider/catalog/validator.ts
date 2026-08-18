import { createHash } from "node:crypto"
import type {
  JsonValue,
  ModelBehavior,
  ModelFeature,
  ModelInputModality,
  ModelLimits,
  ModelOutputModality
} from "@wanex/protocol"
import {
  LOCAL_CATALOG_PROVIDER_IDS,
  LOCAL_MODEL_CATALOG_ID,
  type LocalCatalogProviderId,
  type LocalModelCatalog,
  type LocalModelCatalogEntry
} from "./types.js"

const MAX_MODELS_PER_PROVIDER = 512
const MAX_MODEL_ID_BYTES = 256
const SOURCE_MODALITIES = ["text", "image", "audio", "video", "pdf"] as const
const INPUT_MODALITIES: readonly ModelInputModality[] = [
  "text",
  "image",
  "audio",
  "video",
  "document"
]
const OUTPUT_MODALITIES: readonly ModelOutputModality[] = [
  "text",
  "image",
  "audio",
  "video"
]
const FEATURES: readonly ModelFeature[] = [
  "tool_calling",
  "parallel_tool_calls",
  "reasoning"
]

const PROVIDER_INPUT_SUPPORT: Readonly<
  Record<LocalCatalogProviderId, readonly ModelInputModality[]>
> = {
  openai: ["text", "image"],
  anthropic: ["text", "image", "document"],
  deepseek: ["text"]
}

export class LocalModelCatalogValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "LocalModelCatalogValidationError"
  }
}

export function projectModelsDevCatalog(
  value: unknown,
  source: LocalModelCatalog["source"]
): LocalModelCatalog {
  const payload = record(value, "models.dev catalog")
  const providers = Object.fromEntries(
    LOCAL_CATALOG_PROVIDER_IDS.map((providerId) => [
      providerId,
      projectProvider(payload[providerId], providerId)
    ])
  ) as LocalModelCatalog["providers"]
  const revision = `sha256:${modelCatalogContentDigest(providers)}`
  return {
    kind: "local-host.model-catalog",
    catalogId: LOCAL_MODEL_CATALOG_ID,
    source,
    revision,
    providers
  }
}

export function parseLocalModelCatalog(
  value: JsonValue
): LocalModelCatalog {
  const catalog = record(value, "cached model catalog")
  exactKeys(
    catalog,
    ["kind", "catalogId", "source", "revision", "providers"],
    "cached model catalog"
  )
  if (catalog.kind !== "local-host.model-catalog") {
    invalid("cached model catalog kind is invalid")
  }
  if (catalog.catalogId !== LOCAL_MODEL_CATALOG_ID) {
    invalid("cached model catalog ID is invalid")
  }
  if (catalog.source !== "provider") {
    invalid("cached model catalog source must be provider")
  }
  const revision = nonEmptyString(catalog.revision, "cached catalog revision")
  const providerValues = record(catalog.providers, "cached catalog providers")
  exactKeys(
    providerValues,
    LOCAL_CATALOG_PROVIDER_IDS,
    "cached catalog providers"
  )
  const providers = Object.fromEntries(
    LOCAL_CATALOG_PROVIDER_IDS.map((providerId) => [
      providerId,
      parseCachedProvider(providerValues[providerId], providerId)
    ])
  ) as LocalModelCatalog["providers"]
  const expectedRevision = `sha256:${modelCatalogContentDigest(providers)}`
  if (revision !== expectedRevision) {
    invalid("cached model catalog revision does not match its content")
  }
  return {
    kind: "local-host.model-catalog",
    catalogId: LOCAL_MODEL_CATALOG_ID,
    source: "provider",
    revision,
    providers
  }
}

export function modelCatalogToJson(
  catalog: LocalModelCatalog
): JsonValue {
  return structuredClone(catalog) as unknown as JsonValue
}

export function modelCatalogContentDigest(
  providers: LocalModelCatalog["providers"]
): string {
  return createHash("sha256")
    .update(JSON.stringify(providers))
    .digest("hex")
}

function projectProvider(
  value: unknown,
  providerId: LocalCatalogProviderId
): Readonly<Record<string, LocalModelCatalogEntry>> {
  const provider = record(value, `models.dev provider ${providerId}`)
  if (provider.id !== providerId) {
    invalid(`models.dev provider ${providerId} has a mismatched ID`)
  }
  const models = record(provider.models, `models.dev provider ${providerId}.models`)
  const modelIds = Object.keys(models).sort()
  if (modelIds.length > MAX_MODELS_PER_PROVIDER) {
    invalid(`models.dev provider ${providerId} has too many models`)
  }
  const entries: Array<[string, LocalModelCatalogEntry]> = []
  for (const modelId of modelIds) {
    const model = projectModel(models[modelId], providerId, modelId)
    if (model !== null) entries.push([modelId, model])
  }
  return Object.fromEntries(entries)
}

function projectModel(
  value: unknown,
  providerId: LocalCatalogProviderId,
  modelId: string
): LocalModelCatalogEntry | null {
  boundedModelId(modelId, `models.dev ${providerId} model key`)
  const model = record(value, `models.dev ${providerId}/${modelId}`)
  if (boundedModelId(model.id, `models.dev ${providerId}/${modelId}.id`) !== modelId) {
    invalid(`models.dev ${providerId}/${modelId} has a mismatched ID`)
  }
  const attachment = boolean(model.attachment, `${providerId}/${modelId}.attachment`)
  const reasoning = boolean(model.reasoning, `${providerId}/${modelId}.reasoning`)
  const toolCall = boolean(model.tool_call, `${providerId}/${modelId}.tool_call`)
  const modalities = record(model.modalities, `${providerId}/${modelId}.modalities`)
  const sourceInput = sourceModalities(
    modalities.input,
    `${providerId}/${modelId}.modalities.input`
  )
  const sourceOutput = sourceModalities(
    modalities.output,
    `${providerId}/${modelId}.modalities.output`
  )
  const limits = sourceLimits(model.limit, `${providerId}/${modelId}.limit`)
  const conversationCompatible =
    sourceInput.includes("text") &&
    sourceOutput.includes("text") &&
    limits.contextWindowTokens !== undefined
  const behavior = sourceBehavior(
    model.interleaved,
    reasoning,
    `${providerId}/${modelId}.interleaved`
  )
  void attachment

  if (!conversationCompatible) {
    return null
  }
  const inputModalities = mapInputModalities(sourceInput).filter((modality) =>
    PROVIDER_INPUT_SUPPORT[providerId].includes(modality)
  )
  const outputModalities = mapOutputModalities(sourceOutput).filter(
    (modality) => modality === "text"
  )
  const features: ModelFeature[] = []
  if (toolCall) features.push("tool_calling")
  if (reasoning) features.push("reasoning")
  return {
    id: modelId,
    inputModalities,
    outputModalities,
    features,
    limits,
    ...(behavior === undefined ? {} : { behavior })
  }
}

function parseCachedProvider(
  value: unknown,
  providerId: LocalCatalogProviderId
): Readonly<Record<string, LocalModelCatalogEntry>> {
  const models = record(value, `cached catalog provider ${providerId}`)
  const modelIds = Object.keys(models).sort()
  if (modelIds.length > MAX_MODELS_PER_PROVIDER) {
    invalid(`cached catalog provider ${providerId} has too many models`)
  }
  return Object.fromEntries(modelIds.map((modelId) => [
    modelId,
    parseCachedEntry(models[modelId], providerId, modelId)
  ]))
}

function parseCachedEntry(
  value: unknown,
  providerId: LocalCatalogProviderId,
  modelId: string
): LocalModelCatalogEntry {
  boundedModelId(modelId, `cached catalog ${providerId} model key`)
  const entry = record(value, `cached catalog ${providerId}/${modelId}`)
  exactKeys(
    entry,
    ["id", "inputModalities", "outputModalities", "features", "limits", "behavior"],
    `cached catalog ${providerId}/${modelId}`,
    4
  )
  if (boundedModelId(entry.id, `cached catalog ${providerId}/${modelId}.id`) !== modelId) {
    invalid(`cached catalog ${providerId}/${modelId} has a mismatched ID`)
  }
  const inputModalities = enumArray(
    entry.inputModalities,
    INPUT_MODALITIES,
    `${providerId}/${modelId}.inputModalities`
  )
  const outputModalities = enumArray(
    entry.outputModalities,
    OUTPUT_MODALITIES,
    `${providerId}/${modelId}.outputModalities`
  )
  const features = enumArray(
    entry.features,
    FEATURES,
    `${providerId}/${modelId}.features`,
    true
  )
  if (!inputModalities.includes("text") || !outputModalities.includes("text")) {
    invalid(`cached catalog ${providerId}/${modelId} is not conversation compatible`)
  }
  if (
    features.includes("parallel_tool_calls") &&
    !features.includes("tool_calling")
  ) {
    invalid(`cached catalog ${providerId}/${modelId} has invalid Tool features`)
  }
  const limits = parseCachedLimits(entry.limits, `${providerId}/${modelId}.limits`)
  const behavior = parseCachedBehavior(
    entry.behavior,
    features,
    `${providerId}/${modelId}.behavior`
  )
  return {
    id: modelId,
    inputModalities,
    outputModalities,
    features,
    ...(limits === undefined ? {} : { limits }),
    ...(behavior === undefined ? {} : { behavior })
  }
}

function sourceLimits(value: unknown, label: string): ModelLimits {
  const limits = record(value, label)
  const contextWindowTokens = nonNegativeInteger(limits.context, `${label}.context`)
  const maxInputTokens = limits.input === undefined
    ? undefined
    : nonNegativeInteger(limits.input, `${label}.input`)
  const maxOutputTokens = limits.output === undefined
    ? undefined
    : nonNegativeInteger(limits.output, `${label}.output`)
  return {
    ...(contextWindowTokens === 0 ? {} : { contextWindowTokens }),
    ...(maxInputTokens === undefined || maxInputTokens === 0
      ? {}
      : { maxInputTokens }),
    ...(maxOutputTokens === undefined || maxOutputTokens === 0
      ? {}
      : { maxOutputTokens })
  }
}

function parseCachedLimits(value: unknown, label: string): ModelLimits | undefined {
  if (value === undefined) return undefined
  const limits = record(value, label)
  exactKeys(
    limits,
    ["contextWindowTokens", "maxInputTokens", "maxOutputTokens", "maxInputResources"],
    label,
    1
  )
  const result: ModelLimits = {
    ...(limits.contextWindowTokens === undefined
      ? {}
      : {
          contextWindowTokens: positiveInteger(
            limits.contextWindowTokens,
            `${label}.contextWindowTokens`
          )
        }),
    ...(limits.maxInputTokens === undefined
      ? {}
      : {
          maxInputTokens: positiveInteger(
            limits.maxInputTokens,
            `${label}.maxInputTokens`
          )
        }),
    ...(limits.maxOutputTokens === undefined
      ? {}
      : {
          maxOutputTokens: positiveInteger(
            limits.maxOutputTokens,
            `${label}.maxOutputTokens`
          )
        }),
    ...(limits.maxInputResources === undefined
      ? {}
      : {
          maxInputResources: positiveInteger(
            limits.maxInputResources,
            `${label}.maxInputResources`
          )
        })
  }
  return Object.keys(result).length === 0 ? undefined : result
}

function sourceBehavior(
  value: unknown,
  reasoning: boolean,
  label: string
): ModelBehavior | undefined {
  if (value === undefined) return undefined
  if (value === true) return undefined
  const interleaved = record(value, label)
  exactKeys(interleaved, ["field"], label)
  const field = nonEmptyString(interleaved.field, `${label}.field`)
  if (field !== "reasoning_content" && field !== "reasoning_details") {
    invalid(`${label}.field is not supported`)
  }
  if (!reasoning) invalid(`${label} requires reasoning support`)
  return field === "reasoning_content"
    ? { reasoningReplay: "required" }
    : undefined
}

function parseCachedBehavior(
  value: unknown,
  features: readonly ModelFeature[],
  label: string
): ModelBehavior | undefined {
  if (value === undefined) return undefined
  const behavior = record(value, label)
  exactKeys(behavior, ["reasoningReplay"], label)
  if (
    behavior.reasoningReplay !== "optional" &&
    behavior.reasoningReplay !== "required" &&
    behavior.reasoningReplay !== "forbidden"
  ) {
    invalid(`${label}.reasoningReplay is invalid`)
  }
  if (!features.includes("reasoning")) {
    invalid(`${label} requires reasoning support`)
  }
  return { reasoningReplay: behavior.reasoningReplay }
}

function sourceModalities(value: unknown, label: string): string[] {
  return enumArray(value, SOURCE_MODALITIES, label)
}

function mapInputModalities(values: readonly string[]): ModelInputModality[] {
  return INPUT_MODALITIES.filter((modality) =>
    values.includes(modality === "document" ? "pdf" : modality)
  )
}

function mapOutputModalities(values: readonly string[]): ModelOutputModality[] {
  return OUTPUT_MODALITIES.filter((modality) => values.includes(modality))
}

function enumArray<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
  allowEmpty = false
): T[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    invalid(`${label} must be ${allowEmpty ? "an" : "a non-empty"} array`)
  }
  const result: T[] = []
  for (const item of value) {
    if (typeof item !== "string" || !allowed.includes(item as T)) {
      invalid(`${label} contains an unsupported value`)
    }
    if (result.includes(item as T)) invalid(`${label} contains a duplicate value`)
    result.push(item as T)
  }
  return allowed.filter((item) => result.includes(item))
}

function boundedModelId(value: unknown, label: string): string {
  const id = nonEmptyString(value, label)
  if (Buffer.byteLength(id, "utf8") > MAX_MODEL_ID_BYTES) {
    invalid(`${label} exceeds ${MAX_MODEL_ID_BYTES} bytes`)
  }
  return id
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    invalid(`${label} must be a positive safe integer`)
  }
  return value as number
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    invalid(`${label} must be a non-negative safe integer`)
  }
  return value as number
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") invalid(`${label} must be a boolean`)
  return value as boolean
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    invalid(`${label} must be a non-empty string`)
  }
  return value.trim()
}

function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    invalid(`${label} must be an object`)
  }
  return value as Readonly<Record<string, unknown>>
}

function exactKeys(
  value: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
  label: string,
  minimum = allowed.length
): void {
  const keys = Object.keys(value)
  if (keys.length < minimum || keys.some((key) => !allowed.includes(key))) {
    invalid(`${label} contains missing or unknown fields`)
  }
}

function invalid(message: string): never {
  throw new LocalModelCatalogValidationError(message)
}
