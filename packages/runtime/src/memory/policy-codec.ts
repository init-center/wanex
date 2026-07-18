import type { ContextMemoryPolicy } from "../context/memory/index.js"
import type { JsonValue } from "@wanex/protocol"
import {
  expectFiniteInteger,
  expectNonEmptyString,
  isRecord
} from "./validation.js"

export function contextPolicyFromJson(
  value: JsonValue,
  label: string
): Partial<ContextMemoryPolicy> {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object`)
  }
  const policy: Partial<ContextMemoryPolicy> = {}
  setOptionalString(policy, "version", value.version, `${label}.version`)
  setOptionalPositiveInteger(
    policy,
    "maxInputTokens",
    value.maxInputTokens,
    `${label}.maxInputTokens`
  )
  setOptionalNonNegativeInteger(
    policy,
    "recentUserTurns",
    value.recentUserTurns,
    `${label}.recentUserTurns`
  )
  setOptionalNonNegativeInteger(
    policy,
    "snipTextOverChars",
    value.snipTextOverChars,
    `${label}.snipTextOverChars`
  )
  setOptionalNonNegativeInteger(
    policy,
    "placeholderTextOverChars",
    value.placeholderTextOverChars,
    `${label}.placeholderTextOverChars`
  )
  setOptionalNonNegativeInteger(
    policy,
    "snipHeadChars",
    value.snipHeadChars,
    `${label}.snipHeadChars`
  )
  setOptionalNonNegativeInteger(
    policy,
    "snipTailChars",
    value.snipTailChars,
    `${label}.snipTailChars`
  )
  return policy
}

export function contextPolicyToJson(
  policy: Partial<ContextMemoryPolicy>
): JsonValue {
  return {
    ...(policy.version === undefined ? {} : { version: policy.version }),
    ...(policy.maxInputTokens === undefined
      ? {}
      : { maxInputTokens: policy.maxInputTokens }),
    ...(policy.recentUserTurns === undefined
      ? {}
      : { recentUserTurns: policy.recentUserTurns }),
    ...(policy.snipTextOverChars === undefined
      ? {}
      : { snipTextOverChars: policy.snipTextOverChars }),
    ...(policy.placeholderTextOverChars === undefined
      ? {}
      : { placeholderTextOverChars: policy.placeholderTextOverChars }),
    ...(policy.snipHeadChars === undefined
      ? {}
      : { snipHeadChars: policy.snipHeadChars }),
    ...(policy.snipTailChars === undefined
      ? {}
      : { snipTailChars: policy.snipTailChars })
  }
}

function setOptionalString<T extends string>(
  target: Partial<Record<T, string>>,
  key: T,
  value: unknown,
  label: string
): void {
  if (value === undefined || value === null) {
    return
  }
  target[key] = expectNonEmptyString(value, label)
}

function setOptionalPositiveInteger<T extends keyof ContextMemoryPolicy>(
  target: Partial<ContextMemoryPolicy>,
  key: T,
  value: unknown,
  label: string
): void {
  if (value === undefined || value === null) {
    return
  }
  const parsed = expectFiniteInteger(value, label)
  if (parsed <= 0) {
    throw new Error(`${label} must be positive`)
  }
  target[key] = parsed as ContextMemoryPolicy[T]
}

function setOptionalNonNegativeInteger<T extends keyof ContextMemoryPolicy>(
  target: Partial<ContextMemoryPolicy>,
  key: T,
  value: unknown,
  label: string
): void {
  if (value === undefined || value === null) {
    return
  }
  const parsed = expectFiniteInteger(value, label)
  if (parsed < 0) {
    throw new Error(`${label} must be non-negative`)
  }
  target[key] = parsed as ContextMemoryPolicy[T]
}
