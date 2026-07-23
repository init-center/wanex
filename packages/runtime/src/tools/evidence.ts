import { createHash } from "node:crypto"
import type { JsonValue } from "@wanex/protocol"
import type { ToolRuntimeBinding } from "./types.js"

export interface CreateToolRuntimeBindingOptions {
  readonly implementationId: string
  readonly implementationRevision: string
  readonly configuration?: JsonValue
}

export function createToolRuntimeBinding(
  options: CreateToolRuntimeBindingOptions
): ToolRuntimeBinding {
  const binding = {
    implementationId: options.implementationId,
    implementationRevision: options.implementationRevision,
    ...(options.configuration === undefined
      ? {}
      : { configurationDigest: toolConfigurationDigest(options.configuration) })
  }
  assertToolRuntimeBinding(binding)
  return Object.freeze(binding)
}

export function toolConfigurationDigest(configuration: JsonValue): string {
  return createHash("sha256").update(stableJson(configuration)).digest("hex")
}

export function assertToolRuntimeBinding(binding: ToolRuntimeBinding): void {
  const supported = new Set([
    "implementationId",
    "implementationRevision",
    "configurationDigest"
  ])
  const unknown = Object.keys(binding).filter((key) => !supported.has(key))
  if (unknown.length > 0) {
    throw new Error(`tool runtime binding has unsupported fields: ${unknown.join(", ")}`)
  }
  assertEvidenceString(binding.implementationId, "tool implementation id", 256)
  assertEvidenceString(
    binding.implementationRevision,
    "tool implementation revision",
    128
  )
  if (
    binding.configurationDigest !== undefined &&
    !/^[a-f0-9]{64}$/u.test(binding.configurationDigest)
  ) {
    throw new Error("tool configuration digest must be a lowercase SHA-256")
  }
}

export function canonicalizeToolEvidence<T>(value: T, label: string): T {
  return normalizeJson(value, new Set<object>(), label) as T
}

function assertEvidenceString(value: string, label: string, maxLength: number): void {
  if (
    value.trim().length === 0 ||
    value.length > maxLength ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new Error(`${label} must be a bounded non-empty string`)
  }
}

function stableJson(value: JsonValue): string {
  const encoded = JSON.stringify(normalizeJson(value, new Set<object>(), "tool configuration"))
  if (encoded === undefined) {
    throw new Error("tool configuration must be JSON serializable")
  }
  return encoded
}

function normalizeJson(
  value: unknown,
  ancestors: Set<object>,
  label: string
): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`${label} numbers must be finite`)
    }
    return value
  }
  if (
    value === undefined ||
    typeof value === "bigint" ||
    typeof value === "function" ||
    typeof value === "symbol"
  ) {
    throw new Error(`${label} must contain only JSON values`)
  }
  if (Array.isArray(value)) {
    return withAncestor(value, ancestors, () =>
      value.map((item) => normalizeJson(item, ancestors, label))
    )
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`${label} objects must be plain records`)
    }
    return withAncestor(value, ancestors, () =>
      Object.fromEntries(
        Object.entries(value)
          .sort(([left], [right]) => compareCanonicalStrings(left, right))
          .map(([key, item]) => [key, normalizeJson(item, ancestors, label)])
      )
    )
  }
  throw new Error(`${label} must contain only JSON values`)
}

export function compareCanonicalStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function withAncestor<T>(
  value: object,
  ancestors: Set<object>,
  project: () => T
): T {
  if (ancestors.has(value)) {
    throw new Error("tool configuration must not contain cycles")
  }
  ancestors.add(value)
  try {
    return project()
  } finally {
    ancestors.delete(value)
  }
}
