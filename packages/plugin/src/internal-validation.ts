import { isAbsolute, relative, resolve } from "node:path"
import type { JsonValue, PluginCapability } from "@wanex/protocol"
import type {
  PluginPackageRuntimeDependencyDistribution,
  PluginPackageRuntimeDependencyLoading,
  PluginPackageSourceKind,
  PluginPackageTrustDecisionStatus
} from "./types.js"

export function expectRecord(
  value: JsonValue | undefined,
  label: string
): Record<string, JsonValue> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as Record<string, JsonValue>
}

export function rejectUnknownRecordKeys(
  record: Readonly<Record<string, JsonValue>>,
  allowed: ReadonlySet<string>,
  label: string
): void {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      throw new Error(`${label} contains unsupported field: ${key}`)
    }
  }
}

export function expectString(value: JsonValue | undefined, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`)
  }
  return value
}

export function expectStringArray(value: JsonValue | undefined, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`)
  }
  return value.map((entry, index) => expectString(entry, `${label}[${index}]`))
}

export function expectPositiveNumber(value: JsonValue | undefined, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number`)
  }
  return Math.trunc(value)
}

export function expectPluginCapability(
  value: JsonValue | undefined,
  label: string
): PluginCapability {
  const capability = expectString(value, label)
  if (!PLUGIN_CAPABILITIES.has(capability as PluginCapability)) {
    throw new Error(`invalid plugin capability: ${capability}`)
  }
  return capability as PluginCapability
}

export function expectPluginCapabilityArray(
  value: JsonValue | undefined,
  label: string
): PluginCapability[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`)
  }
  return value.map((entry, index) =>
    expectPluginCapability(entry, `${label}[${index}]`)
  )
}

export function expectBoolean(value: JsonValue | undefined, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean`)
  }
  return value
}

export function expectNonNegativeInteger(
  value: JsonValue | undefined,
  label: string
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    !Number.isInteger(value)
  ) {
    throw new Error(`${label} must be a non-negative integer`)
  }
  return value
}

export function expectSha256(value: JsonValue | undefined, label: string): string {
  const hash = expectString(value, label)
  if (!/^[a-f0-9]{64}$/u.test(hash)) {
    throw new Error(`${label} must be a lowercase sha256 hex digest`)
  }
  return hash
}

export function validatePackageRelativePath(path: string, label: string): void {
  if (path.length === 0) {
    throw new Error(`${label} must not be empty`)
  }
  if (isAbsolute(path)) {
    throw new Error(`${label} must be relative`)
  }
  if (path.includes("\\") || path.includes(":") || path.includes("\0")) {
    throw new Error(`${label} must use safe forward-slash segments`)
  }
  const segments = path.split("/")
  if (
    segments.length === 0 ||
    segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")
  ) {
    throw new Error(`${label} escapes package root`)
  }
  const normalized = resolve(".", path)
  const rel = relative(".", normalized)
  if (rel.startsWith("..") || isAbsolute(rel) || rel.length === 0) {
    throw new Error(`${label} escapes package root`)
  }
}

export function expectJsonValue(value: unknown, label: string): JsonValue {
  if (!isJsonValue(value)) {
    throw new Error(`${label} must be JSON-safe`)
  }
  return value
}

export function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return Number.isFinite(value as number) || typeof value !== "number"
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue)
  }
  if (typeof value === "object") {
    return Object.values(value).every(isJsonValue)
  }
  return false
}

export function validateStringList(
  value: readonly string[] | undefined,
  label: string
): void {
  if (value === undefined) {
    return
  }
  for (const entry of value) {
    if (entry.length === 0) {
      throw new Error(`${label} entries must not be empty`)
    }
  }
}

export const PLUGIN_CAPABILITIES = new Set<PluginCapability>([
  "resource.read",
  "resource.write",
  "workspace.change.propose",
  "delegation.graph.read",
  "delegation.graph.write",
  "team.conversation.read",
  "team.conversation.write",
  "channel.connect",
  "channel.receive",
  "channel.deliver",
  "config.read",
  "config.write",
  "network.fetch"
])

export const PLUGIN_PACKAGE_SOURCE_KINDS = new Set<PluginPackageSourceKind>([
  "local",
  "registry",
  "archive",
  "git",
  "builtin"
])

export const PLUGIN_PACKAGE_TRUST_DECISIONS = new Set<PluginPackageTrustDecisionStatus>([
  "allow",
  "deny",
  "review-required"
])

export const PLUGIN_PACKAGE_DEPENDENCY_LOADINGS = new Set<PluginPackageRuntimeDependencyLoading>([
  "lazy",
  "startup"
])

export const PLUGIN_PACKAGE_DEPENDENCY_DISTRIBUTIONS = new Set<PluginPackageRuntimeDependencyDistribution>([
  "bundled",
  "peer",
  "optional",
  "external-artifact"
])
