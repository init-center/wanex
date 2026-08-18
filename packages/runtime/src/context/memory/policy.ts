import type { ModelEndpointExecutionBinding } from "@wanex/protocol"
import type {
  ContextCompactionPolicy,
  ContextCompactionPolicyOverrides
} from "./types.js"

const DEFAULT_MAX_SUMMARY_OUTPUT_TOKENS = 4_096
const DEFAULT_MAX_SERIALIZED_TOOL_RESULT_CHARS = 2_000
const DEFAULT_MINIMUM_TOKEN_SAVINGS = 1_024
const DEFAULT_MINIMUM_RECENT_TURNS = 2
const DEFAULT_MAX_PROVIDER_ATTEMPTS = 2

export function resolveContextCompactionPolicy(
  modelEndpoint: ModelEndpointExecutionBinding,
  override: ContextCompactionPolicyOverrides = {}
): ContextCompactionPolicy | null {
  return resolveContextCompactionPolicyInternal(modelEndpoint, override)
}

export function resolveContextCompactionPolicyAtCeiling(
  modelEndpoint: ModelEndpointExecutionBinding,
  inputTokenCeiling: number,
  override: ContextCompactionPolicyOverrides = {}
): ContextCompactionPolicy | null {
  positiveInteger(inputTokenCeiling, "context inputTokenCeiling")
  return resolveContextCompactionPolicyInternal(
    modelEndpoint,
    override,
    inputTokenCeiling
  )
}

function resolveContextCompactionPolicyInternal(
  modelEndpoint: ModelEndpointExecutionBinding,
  override: ContextCompactionPolicyOverrides,
  inputTokenCeiling?: number
): ContextCompactionPolicy | null {
  const modelContextWindowTokens =
    modelEndpoint.model.limits?.contextWindowTokens
  if (modelContextWindowTokens === undefined) return null
  positiveInteger(modelContextWindowTokens, "model contextWindowTokens")
  const modelMaxInputTokens = modelEndpoint.model.limits?.maxInputTokens
  if (modelMaxInputTokens !== undefined) {
    positiveInteger(modelMaxInputTokens, "model maxInputTokens")
  }

  const defaultReserve = Math.min(
    16_384,
    Math.max(2_048, Math.floor(modelContextWindowTokens / 10)),
    Math.max(1, Math.floor(modelContextWindowTokens / 2))
  )
  const reserveInputTokens = positiveInteger(
    override.reserveInputTokens ?? defaultReserve,
    "context reserveInputTokens"
  )
  if (reserveInputTokens >= modelContextWindowTokens) {
    throw new Error(
      "context reserveInputTokens must be smaller than contextWindowTokens"
    )
  }
  const defaultWaterlineTokens = Math.min(
    modelContextWindowTokens - reserveInputTokens,
    modelMaxInputTokens ?? modelContextWindowTokens
  )
  const waterlineTokens =
    inputTokenCeiling === undefined
      ? defaultWaterlineTokens
      : Math.min(
          modelContextWindowTokens - 1,
          modelMaxInputTokens ?? modelContextWindowTokens,
          inputTokenCeiling
        )
  const defaultKeepRecentTokens = Math.min(
    waterlineTokens - 1,
    20_000,
    Math.max(1_024, Math.floor(waterlineTokens / 4))
  )
  const keepRecentTokens = nonNegativeInteger(
    override.keepRecentTokens ?? defaultKeepRecentTokens,
    "context keepRecentTokens"
  )
  if (keepRecentTokens >= waterlineTokens) {
    throw new Error("context keepRecentTokens must be smaller than the waterline")
  }
  const modelMaxOutputTokens = modelEndpoint.model.limits?.maxOutputTokens
  const maxSummaryOutputTokens = positiveInteger(
    Math.min(
      override.maxSummaryOutputTokens ?? DEFAULT_MAX_SUMMARY_OUTPUT_TOKENS,
      modelMaxOutputTokens ?? DEFAULT_MAX_SUMMARY_OUTPUT_TOKENS
    ),
    "context maxSummaryOutputTokens"
  )
  return {
    algorithm: "semantic-summary",
    modelContextWindowTokens,
    ...(modelMaxInputTokens === undefined ? {} : { modelMaxInputTokens }),
    waterlineTokens,
    keepRecentTokens,
    minimumRecentTurns: nonNegativeInteger(
      override.minimumRecentTurns ?? DEFAULT_MINIMUM_RECENT_TURNS,
      "context minimumRecentTurns"
    ),
    maxSummaryOutputTokens,
    maxSerializedToolResultChars: positiveInteger(
      override.maxSerializedToolResultChars ??
        DEFAULT_MAX_SERIALIZED_TOOL_RESULT_CHARS,
      "context maxSerializedToolResultChars"
    ),
    minimumTokenSavings: nonNegativeInteger(
      override.minimumTokenSavings ?? DEFAULT_MINIMUM_TOKEN_SAVINGS,
      "context minimumTokenSavings"
    ),
    maxProviderAttempts: positiveInteger(
      override.maxProviderAttempts ?? DEFAULT_MAX_PROVIDER_ATTEMPTS,
      "context maxProviderAttempts"
    )
  }
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer`)
  }
  return value
}

function nonNegativeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`)
  }
  return value
}
