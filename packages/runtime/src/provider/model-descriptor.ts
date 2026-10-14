import type {
  ModelCapabilityRequirement,
  ModelDescriptor,
  ModelFeature,
  ModelInputModality,
  ModelOperation,
  ModelOutputModality
} from "@wanex/protocol"
import { normalizeModelDescriptor } from "@wanex/protocol"
export { normalizeModelDescriptor } from "@wanex/protocol"

const OPERATION_ORDER: readonly ModelOperation[] = [
  "conversation",
  "image.generate",
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
    case "gemini-generate-content":
      return { input: ["text", "image"], output: ["text", "image"] }
    default:
      throw new Error(`unsupported conversation provider protocol: ${protocolId}`)
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
