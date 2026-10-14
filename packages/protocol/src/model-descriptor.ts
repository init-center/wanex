import { normalizeModelOptions } from "./model-options.js"
import type { ModelDescriptor, ModelLimits } from "./provider.js"

export const MODEL_OPERATIONS = [
  "conversation", "image.generate", "video.generate", "audio.transcribe", "audio.synthesize"
] as const
export const MODEL_INPUT_MODALITIES = ["text", "image", "audio", "video", "document"] as const
export const MODEL_OUTPUT_MODALITIES = ["text", "image", "audio", "video"] as const
export const MODEL_FEATURES = ["tool_calling", "parallel_tool_calls", "reasoning"] as const

/** Pure contract validation shared by configuration and durable evidence readers. */
export function normalizeModelDescriptor(value: unknown): ModelDescriptor {
  const model = object(value, [
    "id", "operations", "inputModalities", "outputModalities", "features",
    "generationOptions", "limits", "behavior", "catalog"
  ], "model descriptor")
  const operations = values(model.operations, MODEL_OPERATIONS, "model operation")
  const inputModalities = values(model.inputModalities, MODEL_INPUT_MODALITIES, "model input modality")
  const outputModalities = values(model.outputModalities, MODEL_OUTPUT_MODALITIES, "model output modality")
  const features = values(model.features, MODEL_FEATURES, "model feature", true)
  if (features.includes("parallel_tool_calls") && !features.includes("tool_calling")) {
    throw new Error("parallel_tool_calls requires tool_calling")
  }
  const generationOptions = model.generationOptions === undefined
    ? undefined : normalizeModelOptions(model.generationOptions)
  if (generationOptions !== undefined && !operations.includes("image.generate")) {
    throw new Error("generationOptions requires image.generate")
  }
  const limitKeys = ["contextWindowTokens", "maxInputTokens", "maxOutputTokens", "maxInputResources"] as const
  let limits: ModelLimits | undefined
  if (model.limits !== undefined) {
    const source = object(model.limits, limitKeys, "model limits")
    const entries = limitKeys.flatMap((key) => {
      const limit = source[key]
      if (limit === undefined) return []
      if (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit <= 0) {
        throw new Error(`model limit ${key} must be a positive safe integer`)
      }
      return [[key, limit] as const]
    })
    if (entries.length > 0) limits = Object.fromEntries(entries)
  }
  let behavior: ModelDescriptor["behavior"]
  if (model.behavior !== undefined) {
    const source = object(model.behavior, ["reasoningReplay"], "model behavior")
    const reasoningReplay = source.reasoningReplay
    if (reasoningReplay !== undefined) {
      if (reasoningReplay !== "optional" && reasoningReplay !== "required" && reasoningReplay !== "forbidden") {
        throw new Error(`invalid reasoning replay behavior: ${String(reasoningReplay)}`)
      }
      if (!features.includes("reasoning")) {
        throw new Error("reasoning replay behavior requires the reasoning feature")
      }
      behavior = { reasoningReplay }
    }
  }
  const catalog = object(model.catalog, ["source", "catalogId", "revision"], "model catalog")
  const source = catalog.source
  if (source !== "builtin" && source !== "provider" && source !== "custom") {
    throw new Error(`invalid model catalog source: ${String(source)}`)
  }
  return {
    id: text(model.id, "model descriptor id"),
    operations, inputModalities, outputModalities, features,
    ...(generationOptions === undefined ? {} : { generationOptions }),
    ...(limits === undefined ? {} : { limits }),
    ...(behavior === undefined ? {} : { behavior }),
    catalog: {
      source,
      catalogId: text(catalog.catalogId, "model catalog id"),
      revision: text(catalog.revision, "model catalog revision")
    }
  }
}

function object(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  if (Object.keys(value).some((key) => !keys.includes(key))) {
    throw new Error(`${label} contains unknown fields`)
  }
  return value as Record<string, unknown>
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must not be empty`)
  }
  return value.trim()
}

function values<T extends string>(value: unknown, allowed: readonly T[], label: string, allowEmpty = false): T[] {
  if (!Array.isArray(value)) throw new Error(`${label} list must be an array`)
  if (!allowEmpty && value.length === 0) throw new Error(`${label} list must not be empty`)
  const seen = new Set<T>()
  for (const item of value) {
    if (!allowed.includes(item)) throw new Error(`invalid ${label}: ${String(item)}`)
    if (seen.has(item)) throw new Error(`duplicate ${label}: ${item}`)
    seen.add(item)
  }
  return allowed.filter((item) => seen.has(item))
}
