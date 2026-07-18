import type { JsonValue, ObjectiveStopPolicy } from "@wanex/protocol"
import {
  expectBoolean,
  expectNumber,
  isRecord
} from "./codec-helpers.js"

export function objectiveStopPolicyToJson(
  policy: ObjectiveStopPolicy
): JsonValue {
  const value: Record<string, JsonValue> = {}
  if (policy.maxAttempts !== undefined) {
    value.maxAttempts = policy.maxAttempts
  }
  if (policy.maxElapsedMs !== undefined) {
    value.maxElapsedMs = policy.maxElapsedMs
  }
  if (policy.maxTokens !== undefined) {
    value.maxTokens = policy.maxTokens
  }
  if (policy.repeatedBlockThreshold !== undefined) {
    value.repeatedBlockThreshold = policy.repeatedBlockThreshold
  }
  if (policy.requireVerification !== undefined) {
    value.requireVerification = policy.requireVerification
  }
  if (policy.metadata !== undefined) {
    value.metadata = policy.metadata
  }
  return value
}

export function objectiveStopPolicyFromJson(
  value: JsonValue
): ObjectiveStopPolicy {
  if (!isRecord(value)) {
    throw new Error("objective stop policy must be an object")
  }
  const policy: {
    maxAttempts?: number
    maxElapsedMs?: number
    maxTokens?: number
    repeatedBlockThreshold?: number
    requireVerification?: boolean
    metadata?: JsonValue
  } = {}
  if (value.maxAttempts !== null && value.maxAttempts !== undefined) {
    policy.maxAttempts = expectNumber(
      value.maxAttempts,
      "objective_stop_policy.maxAttempts"
    )
  }
  if (value.maxElapsedMs !== null && value.maxElapsedMs !== undefined) {
    policy.maxElapsedMs = expectNumber(
      value.maxElapsedMs,
      "objective_stop_policy.maxElapsedMs"
    )
  }
  if (value.maxTokens !== null && value.maxTokens !== undefined) {
    policy.maxTokens = expectNumber(
      value.maxTokens,
      "objective_stop_policy.maxTokens"
    )
  }
  if (
    value.repeatedBlockThreshold !== null &&
    value.repeatedBlockThreshold !== undefined
  ) {
    policy.repeatedBlockThreshold = expectNumber(
      value.repeatedBlockThreshold,
      "objective_stop_policy.repeatedBlockThreshold"
    )
  }
  if (
    value.requireVerification !== null &&
    value.requireVerification !== undefined
  ) {
    policy.requireVerification = expectBoolean(
      value.requireVerification,
      "objective_stop_policy.requireVerification"
    )
  }
  if (value.metadata !== undefined) {
    policy.metadata = value.metadata
  }
  return policy
}
