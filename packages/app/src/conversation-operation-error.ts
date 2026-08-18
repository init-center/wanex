import {
  SESSION_TURN_CONTEXT_CAPACITY_ERROR_KIND,
  type JsonValue,
  type SessionTurnContextCapacityReason,
  type SessionTurnRecord
} from "@wanex/protocol"
import type {
  WanexAppConversationOperationCapacityEvidence,
  WanexAppConversationOperationError
} from "./types-conversation-operation.js"

const MAX_REASON_COUNT = 2
const MAX_MESSAGE_CHARS = 512
const MAX_COMPACTION_REASON_CHARS = 1_024
const CAPACITY_REASONS = new Set<SessionTurnContextCapacityReason>([
  "input_tokens_exceeded",
  "input_resources_exceeded"
])

export function projectWanexAppConversationOperationError(
  turn: SessionTurnRecord
): WanexAppConversationOperationError {
  const capacity = decodeCapacityEvidence(turn.error)
  if (capacity === undefined) {
    return {
      code: "conversation_operation_failed",
      category: "runtime",
      message: "conversation operation failed; see app diagnostics for details"
    }
  }
  return {
    code: "conversation_context_capacity_exceeded",
    category: "capacity",
    message: capacityMessage(capacity.reasons),
    modelEndpointId: turn.executionBinding.modelEndpoint.endpointId,
    capacity
  }
}

function decodeCapacityEvidence(
  value: JsonValue | undefined
): WanexAppConversationOperationCapacityEvidence | undefined {
  if (
    !isRecord(value) ||
    value.kind !== SESSION_TURN_CONTEXT_CAPACITY_ERROR_KIND ||
    typeof value.message !== "string" ||
    value.message.length === 0 ||
    value.message.length > MAX_MESSAGE_CHARS
  ) {
    return undefined
  }
  const capacity = value.capacity
  if (!isRecord(capacity)) return undefined
  const reasons = decodeReasons(capacity.reasons)
  const inputTokens = nonNegativeSafeInteger(capacity.inputTokens)
  const inputResources = nonNegativeSafeInteger(capacity.inputResources)
  const requestedOutputTokens = positiveSafeInteger(
    capacity.requestedOutputTokens
  )
  const inputTokenCeiling = optionalPositiveSafeInteger(
    capacity.inputTokenCeiling
  )
  const maxInputResources = optionalPositiveSafeInteger(
    capacity.maxInputResources
  )
  const compactionReason = optionalBoundedString(
    capacity.compactionReason,
    MAX_COMPACTION_REASON_CHARS
  )
  if (
    reasons === undefined ||
    inputTokens === undefined ||
    inputResources === undefined ||
    requestedOutputTokens === undefined ||
    inputTokenCeiling === null ||
    maxInputResources === null ||
    typeof capacity.compactionAttempted !== "boolean" ||
    compactionReason === null
  ) {
    return undefined
  }
  if (
    reasons.includes("input_tokens_exceeded") &&
    (inputTokenCeiling === undefined || inputTokens <= inputTokenCeiling)
  ) {
    return undefined
  }
  if (
    reasons.includes("input_resources_exceeded") &&
    (maxInputResources === undefined || inputResources <= maxInputResources)
  ) {
    return undefined
  }
  return {
    reasons,
    inputTokens,
    ...(inputTokenCeiling === undefined ? {} : { inputTokenCeiling }),
    inputResources,
    ...(maxInputResources === undefined ? {} : { maxInputResources }),
    requestedOutputTokens,
    compactionAttempted: capacity.compactionAttempted,
    ...(compactionReason === undefined ? {} : { compactionReason })
  }
}

function decodeReasons(
  value: JsonValue | undefined
): readonly SessionTurnContextCapacityReason[] | undefined {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > MAX_REASON_COUNT ||
    !value.every(
      (reason): reason is SessionTurnContextCapacityReason =>
        typeof reason === "string" &&
        CAPACITY_REASONS.has(reason as SessionTurnContextCapacityReason)
    )
  ) {
    return undefined
  }
  const reasons = [...new Set(value)]
  return reasons.length === value.length ? reasons : undefined
}

function capacityMessage(
  reasons: readonly SessionTurnContextCapacityReason[]
): string {
  const tokens = reasons.includes("input_tokens_exceeded")
  const resources = reasons.includes("input_resources_exceeded")
  if (tokens && resources) {
    return "This request exceeds the selected model's context and resource capacity."
  }
  if (resources) {
    return "This request contains more resources than the selected model accepts."
  }
  return "This request is larger than the selected model's context capacity."
}

function nonNegativeSafeInteger(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && Number(value) >= 0
    ? Number(value)
    : undefined
}

function positiveSafeInteger(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && Number(value) > 0
    ? Number(value)
    : undefined
}

function optionalPositiveSafeInteger(
  value: unknown
): number | undefined | null {
  return value === undefined ? undefined : positiveSafeInteger(value) ?? null
}

function optionalBoundedString(
  value: unknown,
  maxChars: number
): string | undefined | null {
  return value === undefined
    ? undefined
    : typeof value === "string" && value.length <= maxChars
      ? value
      : null
}

function isRecord(
  value: unknown
): value is Readonly<Record<string, JsonValue>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
