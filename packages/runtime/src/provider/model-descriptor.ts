import type {
  ModelBehavior,
  ModelCapabilityRequirement,
  ModelCatalogProvenance,
  ModelDescriptor,
  ModelFeature,
  ModelInputModality,
  ModelLimits,
  ModelOperation,
  ModelOutputModality
} from "@wanex/protocol"

const OPERATION_ORDER: readonly ModelOperation[] = [
  "conversation",
  "image.generate",
  "image.edit",
  "video.generate",
  "audio.transcribe",
  "audio.synthesize"
]
const INPUT_ORDER: readonly ModelInputModality[] = [
  "text",
  "image",
  "audio",
  "video",
  "document"
]
const OUTPUT_ORDER: readonly ModelOutputModality[] = [
  "text",
  "image",
  "audio",
  "video"
]
const FEATURE_ORDER: readonly ModelFeature[] = [
  "tool_calling",
  "parallel_tool_calls",
  "reasoning"
]

export function fakeModelDescriptor(modelId = "fake-model"): ModelDescriptor {
  return normalizeModelDescriptor({
    id: modelId,
    operations: OPERATION_ORDER,
    inputModalities: INPUT_ORDER,
    outputModalities: ["text"],
    features: ["tool_calling", "parallel_tool_calls", "reasoning"],
    behavior: { reasoningReplay: "optional" },
    catalog: {
      source: "builtin",
      catalogId: "wanex.fake",
      revision: "1"
    }
  })
}

export function normalizeModelDescriptor(
  descriptor: ModelDescriptor
): ModelDescriptor {
  const id = requireNonEmpty(descriptor.id, "model descriptor id")
  const operations = normalizeValues(
    descriptor.operations,
    OPERATION_ORDER,
    "model operation"
  )
  const inputModalities = normalizeValues(
    descriptor.inputModalities,
    INPUT_ORDER,
    "model input modality"
  )
  const outputModalities = normalizeValues(
    descriptor.outputModalities,
    OUTPUT_ORDER,
    "model output modality"
  )
  const features = normalizeValues(
    descriptor.features,
    FEATURE_ORDER,
    "model feature",
    true
  )
  if (
    features.includes("parallel_tool_calls") &&
    !features.includes("tool_calling")
  ) {
    throw new Error("parallel_tool_calls requires tool_calling")
  }
  const behavior = normalizeBehavior(descriptor.behavior, features)
  const limits = normalizeLimits(descriptor.limits)
  const catalog = normalizeCatalog(descriptor.catalog)
  return {
    id,
    operations,
    inputModalities,
    outputModalities,
    features,
    ...(limits === undefined ? {} : { limits }),
    ...(behavior === undefined ? {} : { behavior }),
    catalog
  }
}

export function normalizeModelCapabilityRequirement(
  requirement: ModelCapabilityRequirement
): ModelCapabilityRequirement {
  if (!OPERATION_ORDER.includes(requirement.operation)) {
    throw new Error(
      `invalid model capability operation: ${String(requirement.operation)}`
    )
  }
  return {
    operation: requirement.operation,
    inputModalities: normalizeValues(
      requirement.inputModalities,
      INPUT_ORDER,
      "model capability input modality",
      true
    ),
    outputModalities: normalizeValues(
      requirement.outputModalities,
      OUTPUT_ORDER,
      "model capability output modality",
      true
    ),
    features: normalizeValues(
      requirement.features,
      FEATURE_ORDER,
      "model capability feature",
      true
    )
  }
}

export function modelCapabilityRequirementKey(
  requirement: ModelCapabilityRequirement
): string {
  return JSON.stringify(normalizeModelCapabilityRequirement(requirement))
}

export function modelSupportsCapability(
  descriptor: ModelDescriptor,
  requirement: ModelCapabilityRequirement
): boolean {
  const model = normalizeModelDescriptor(descriptor)
  const required = normalizeModelCapabilityRequirement(requirement)
  return (
    model.operations.includes(required.operation) &&
    required.inputModalities.every((item) =>
      model.inputModalities.includes(item)
    ) &&
    required.outputModalities.every((item) =>
      model.outputModalities.includes(item)
    ) &&
    required.features.every((item) => model.features.includes(item))
  )
}

export function assertModelSupportsCapability(
  descriptor: ModelDescriptor,
  requirement: ModelCapabilityRequirement
): ModelDescriptor {
  const model = normalizeModelDescriptor(descriptor)
  const required = normalizeModelCapabilityRequirement(requirement)
  if (!modelSupportsCapability(model, required)) {
    throw new Error(
      `model ${model.id} does not satisfy capability ${modelCapabilityRequirementKey(required)}`
    )
  }
  return model
}

export function assertConversationModelSupported(
  protocolId: string,
  descriptor: ModelDescriptor
): ModelDescriptor {
  const model = normalizeModelDescriptor(descriptor)
  if (!model.operations.includes("conversation")) {
    throw new Error(`${protocolId} model must support conversation`)
  }
  if (!model.inputModalities.includes("text")) {
    throw new Error(`${protocolId} conversation model must support text input`)
  }
  if (!model.outputModalities.includes("text")) {
    throw new Error(`${protocolId} conversation model must support text output`)
  }
  const supported = supportedModalitiesForProtocol(protocolId)
  assertSubset(
    model.inputModalities,
    supported.input,
    `${protocolId} input`
  )
  assertSubset(
    model.outputModalities,
    supported.output,
    `${protocolId} output`
  )
  return model
}

export function sameModelDescriptor(
  left: ModelDescriptor,
  right: ModelDescriptor
): boolean {
  return JSON.stringify(normalizeModelDescriptor(left)) ===
    JSON.stringify(normalizeModelDescriptor(right))
}

function supportedModalitiesForProtocol(protocolId: string): {
  readonly input: readonly ModelInputModality[]
  readonly output: readonly ModelOutputModality[]
} {
  switch (protocolId) {
    case "fake":
      return { input: INPUT_ORDER, output: ["text"] }
    case "openai-chat-completions":
      return { input: ["text", "image"], output: ["text"] }
    case "anthropic-messages":
      return { input: ["text", "image", "document"], output: ["text"] }
    default:
      throw new Error(`unsupported conversation provider protocol: ${protocolId}`)
  }
}

function normalizeBehavior(
  behavior: ModelBehavior | undefined,
  features: readonly ModelFeature[]
): ModelBehavior | undefined {
  if (behavior?.reasoningReplay === undefined) {
    return undefined
  }
  if (
    behavior.reasoningReplay !== "optional" &&
    behavior.reasoningReplay !== "required" &&
    behavior.reasoningReplay !== "forbidden"
  ) {
    throw new Error(`invalid reasoning replay behavior: ${String(behavior.reasoningReplay)}`)
  }
  if (!features.includes("reasoning")) {
    throw new Error("reasoning replay behavior requires the reasoning feature")
  }
  return { reasoningReplay: behavior.reasoningReplay }
}

function normalizeLimits(limits: ModelLimits | undefined): ModelLimits | undefined {
  if (limits === undefined) {
    return undefined
  }
  const normalized = {
    ...positiveLimit(limits.contextWindowTokens, "contextWindowTokens"),
    ...positiveLimit(limits.maxInputTokens, "maxInputTokens"),
    ...positiveLimit(limits.maxOutputTokens, "maxOutputTokens"),
    ...positiveLimit(limits.maxInputResources, "maxInputResources")
  }
  return Object.keys(normalized).length === 0 ? undefined : normalized
}

function positiveLimit(value: number | undefined, name: keyof ModelLimits) {
  if (value === undefined) {
    return {}
  }
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`model limit ${name} must be a positive safe integer`)
  }
  return { [name]: value }
}

function normalizeCatalog(
  catalog: ModelCatalogProvenance
): ModelCatalogProvenance {
  if (
    catalog.source !== "builtin" &&
    catalog.source !== "provider" &&
    catalog.source !== "custom"
  ) {
    throw new Error(`invalid model catalog source: ${String(catalog.source)}`)
  }
  return {
    source: catalog.source,
    catalogId: requireNonEmpty(catalog.catalogId, "model catalog id"),
    revision: requireNonEmpty(catalog.revision, "model catalog revision")
  }
}

function normalizeValues<T extends string>(
  values: readonly T[],
  allowed: readonly T[],
  label: string,
  allowEmpty = false
): T[] {
  if (!Array.isArray(values)) {
    throw new Error(`${label} list must be an array`)
  }
  if (!allowEmpty && values.length === 0) {
    throw new Error(`${label} list must not be empty`)
  }
  const seen = new Set<T>()
  for (const value of values) {
    if (!allowed.includes(value)) {
      throw new Error(`invalid ${label}: ${String(value)}`)
    }
    if (seen.has(value)) {
      throw new Error(`duplicate ${label}: ${value}`)
    }
    seen.add(value)
  }
  return allowed.filter((value) => seen.has(value))
}

function assertSubset<T extends string>(
  values: readonly T[],
  supported: readonly T[],
  label: string
): void {
  const unsupported = values.find((value) => !supported.includes(value))
  if (unsupported !== undefined) {
    throw new Error(`${label} modality is not supported by this adapter: ${unsupported}`)
  }
}

function requireNonEmpty(value: string, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must not be empty`)
  }
  return value.trim()
}
