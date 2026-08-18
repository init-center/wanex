import type {
  ContextCompactionEvidence,
  ContextCompactionPolicy
} from "../context/memory/index.js"
import { modelEndpointFromExecutionBinding } from "../provider/index.js"
import type { JsonValue, ModelEndpointExecutionBinding } from "@wanex/protocol"
import type { MemoryCompactionJobPayload } from "./types.js"
import { expectFiniteInteger, expectNonEmptyString, isRecord } from "./validation.js"

export function memoryCompactionPayloadFromJson(
  value: JsonValue
): MemoryCompactionJobPayload {
  if (!isRecord(value) || !isRecord(value.evidence)) {
    throw new Error("memory.compaction payload evidence must be an object")
  }
  return {
    evidence: evidenceFromJson(value.evidence),
    ...(value.metadata === undefined ? {} : { metadata: value.metadata })
  }
}

export function memoryCompactionPayloadToJson(
  payload: MemoryCompactionJobPayload
): JsonValue {
  return {
    evidence: payload.evidence as unknown as JsonValue,
    ...(payload.metadata === undefined ? {} : { metadata: payload.metadata })
  }
}

function evidenceFromJson(value: Readonly<Record<string, JsonValue>>): ContextCompactionEvidence {
  const modelEndpoint = modelEndpointBinding(value.modelEndpoint)
  const evidence = {
    sessionId: expectNonEmptyString(value.sessionId, "memory.compaction.sessionId"),
    sourceHeadSequence: positiveInteger(
      value.sourceHeadSequence,
      "memory.compaction.sourceHeadSequence"
    ),
    sourceHeadMessageId: expectNonEmptyString(
      value.sourceHeadMessageId,
      "memory.compaction.sourceHeadMessageId"
    ),
    cutSequence: positiveInteger(value.cutSequence, "memory.compaction.cutSequence"),
    cutMessageId: expectNonEmptyString(
      value.cutMessageId,
      "memory.compaction.cutMessageId"
    ),
    retainedFromSequence: positiveInteger(
      value.retainedFromSequence,
      "memory.compaction.retainedFromSequence"
    ),
    retainedFromMessageId: expectNonEmptyString(
      value.retainedFromMessageId,
      "memory.compaction.retainedFromMessageId"
    ),
    sourceDigest: digest(value.sourceDigest, "memory.compaction.sourceDigest"),
    policy: policyFromJson(value.policy),
    policyDigest: digest(value.policyDigest, "memory.compaction.policyDigest"),
    modelEndpoint,
    requestDigest: digest(value.requestDigest, "memory.compaction.requestDigest"),
    tokenEstimateBefore: nonNegativeInteger(
      value.tokenEstimateBefore,
      "memory.compaction.tokenEstimateBefore"
    ),
    projectedTokenEstimateAfter: nonNegativeInteger(
      value.projectedTokenEstimateAfter,
      "memory.compaction.projectedTokenEstimateAfter"
    )
  }
  const previousEpochId = optionalString(
    value.previousEpochId,
    "memory.compaction.previousEpochId"
  )
  const previousSummaryDigest = optionalDigest(
    value.previousSummaryDigest,
    "memory.compaction.previousSummaryDigest"
  )
  if ((previousEpochId === undefined) !== (previousSummaryDigest === undefined)) {
    throw new Error("memory.compaction predecessor evidence must appear together")
  }
  return {
    ...evidence,
    ...(previousEpochId === undefined
      ? {}
      : { previousEpochId, previousSummaryDigest: previousSummaryDigest as string })
  }
}

function policyFromJson(value: JsonValue | undefined): ContextCompactionPolicy {
  if (!isRecord(value) || value.algorithm !== "semantic-summary") {
    throw new Error("memory.compaction policy must be semantic-summary")
  }
  return {
    algorithm: "semantic-summary",
    modelContextWindowTokens: positiveInteger(
      value.modelContextWindowTokens,
      "memory.compaction.policy.modelContextWindowTokens"
    ),
    ...(value.modelMaxInputTokens === undefined
      ? {}
      : {
          modelMaxInputTokens: positiveInteger(
            value.modelMaxInputTokens,
            "memory.compaction.policy.modelMaxInputTokens"
          )
        }),
    waterlineTokens: positiveInteger(
      value.waterlineTokens,
      "memory.compaction.policy.waterlineTokens"
    ),
    keepRecentTokens: nonNegativeInteger(
      value.keepRecentTokens,
      "memory.compaction.policy.keepRecentTokens"
    ),
    minimumRecentTurns: nonNegativeInteger(
      value.minimumRecentTurns,
      "memory.compaction.policy.minimumRecentTurns"
    ),
    maxSummaryOutputTokens: positiveInteger(
      value.maxSummaryOutputTokens,
      "memory.compaction.policy.maxSummaryOutputTokens"
    ),
    maxSerializedToolResultChars: positiveInteger(
      value.maxSerializedToolResultChars,
      "memory.compaction.policy.maxSerializedToolResultChars"
    ),
    minimumTokenSavings: nonNegativeInteger(
      value.minimumTokenSavings,
      "memory.compaction.policy.minimumTokenSavings"
    ),
    maxProviderAttempts: positiveInteger(
      value.maxProviderAttempts,
      "memory.compaction.policy.maxProviderAttempts"
    )
  }
}

function modelEndpointBinding(value: JsonValue | undefined): ModelEndpointExecutionBinding {
  if (!isRecord(value)) {
    throw new Error("memory.compaction modelEndpoint must be an object")
  }
  const binding = value as unknown as ModelEndpointExecutionBinding
  modelEndpointFromExecutionBinding(binding)
  return binding
}

function digest(value: JsonValue | undefined, label: string): string {
  const parsed = expectNonEmptyString(value, label)
  if (parsed.length !== 64 || !/^[0-9a-f]+$/.test(parsed)) {
    throw new Error(`${label} must be a lowercase sha256 digest`)
  }
  return parsed
}

function optionalDigest(value: JsonValue | undefined, label: string): string | undefined {
  return value === undefined ? undefined : digest(value, label)
}

function optionalString(value: JsonValue | undefined, label: string): string | undefined {
  return value === undefined ? undefined : expectNonEmptyString(value, label)
}

function positiveInteger(value: JsonValue | undefined, label: string): number {
  const parsed = expectFiniteInteger(value, label)
  if (parsed <= 0) throw new Error(`${label} must be positive`)
  return parsed
}

function nonNegativeInteger(value: JsonValue | undefined, label: string): number {
  const parsed = expectFiniteInteger(value, label)
  if (parsed < 0) throw new Error(`${label} must be non-negative`)
  return parsed
}
