import { createHash } from "node:crypto"
import type {
  ExecutionCapabilitySnapshot,
  ExecutionEnvironmentDescriptor,
  ExecutionEnvironmentBinding,
  ExecutionFileEffect,
  ExecutionPolicySnapshot
} from "@wanex/protocol"
import { assertExecutionPolicySupported, normalizeExecutionPolicy } from "./policy.js"

export function createExecutionEnvironmentBinding(request: {
  readonly descriptor: ExecutionEnvironmentDescriptor
  readonly capabilities: ExecutionCapabilitySnapshot
  readonly policy: ExecutionPolicySnapshot
}): ExecutionEnvironmentBinding {
  const policy = normalizeExecutionPolicy(request.policy)
  assertExecutionPolicySupported(policy, request.capabilities)
  const unsigned = {
    revision: 1 as const,
    environmentId: request.descriptor.environmentId,
    providerId: request.descriptor.providerId,
    providerRevision: request.descriptor.providerRevision,
    capabilities: request.capabilities,
    policy
  }
  return Object.freeze({
    ...unsigned,
    capabilityDigest: digestJson(unsigned.capabilities),
    policyDigest: digestJson(unsigned.policy)
  })
}

const FILE_EFFECTS = ["create", "read", "remove", "write"] as const

export function assertExecutionEnvironmentBindingValid(
  binding: ExecutionEnvironmentBinding
): void {
  const value = record(binding, "execution environment binding")
  exactKeys(value, [
    "revision",
    "environmentId",
    "providerId",
    "providerRevision",
    "capabilities",
    "capabilityDigest",
    "policy",
    "policyDigest"
  ], "execution environment binding")
  if (binding.revision !== 1) {
    throw new Error("execution environment binding revision is invalid")
  }
  opaqueId(binding.environmentId, "execution environment id")
  opaqueId(binding.providerId, "execution environment provider id")
  opaqueId(binding.providerRevision, "execution environment provider revision")
  capabilities(binding)
  policy(binding)
  sha256(binding.capabilityDigest, "execution environment capability digest")
  sha256(binding.policyDigest, "execution environment policy digest")
  if (digestJson(binding.capabilities) !== binding.capabilityDigest) {
    throw new Error("execution environment capability digest does not match its content")
  }
  if (digestJson(binding.policy) !== binding.policyDigest) {
    throw new Error("execution environment policy digest does not match its content")
  }
}

export function assertExecutionEnvironmentBindingEqual(
  actual: ExecutionEnvironmentBinding,
  expected: ExecutionEnvironmentBinding,
  label = "execution environment binding"
): void {
  assertExecutionEnvironmentBindingValid(actual)
  assertExecutionEnvironmentBindingValid(expected)
  if (stableJson(actual) !== stableJson(expected)) {
    throw new Error(`${label} changed after admission`)
  }
}

function capabilities(binding: ExecutionEnvironmentBinding): void {
  const value = record(binding.capabilities, "execution environment capabilities")
  exactKeys(value, [
    "revision",
    "isolation",
    "filesystem",
    "process",
    "pty",
    "network",
    "secretProjection",
    "artifactExport"
  ], "execution environment capabilities")
  if (binding.capabilities.revision !== 1) {
    throw new Error("execution environment capability revision is invalid")
  }

  const isolation = record(
    binding.capabilities.isolation,
    "execution environment isolation capability"
  )
  exactKeys(isolation, ["enforcement"], "execution environment isolation capability")
  allowed(
    binding.capabilities.isolation.enforcement,
    ["none", "os"],
    "execution environment isolation enforcement"
  )

  const filesystem = record(
    binding.capabilities.filesystem,
    "execution environment filesystem capability"
  )
  exactKeys(
    filesystem,
    ["enforcement", "effects"],
    "execution environment filesystem capability"
  )
  allowed(
    binding.capabilities.filesystem.enforcement,
    ["library_guard", "os"],
    "execution environment filesystem enforcement"
  )
  effects(
    binding.capabilities.filesystem.effects,
    "execution environment filesystem effects"
  )

  const process = record(
    binding.capabilities.process,
    "execution environment process capability"
  )
  exactKeys(
    process,
    ["oneShot", "managed", "cleanup"],
    "execution environment process capability"
  )
  if (binding.capabilities.process.oneShot !== true) {
    throw new Error("execution environment one-shot capability must be true")
  }
  boolean(binding.capabilities.process.managed, "execution environment managed capability")
  allowed(
    binding.capabilities.process.cleanup,
    ["runtime_process_tree", "durable_supervisor"],
    "execution environment cleanup capability"
  )

  supportedFlag(binding.capabilities.pty, "execution environment PTY capability")
  const network = record(
    binding.capabilities.network,
    "execution environment network capability"
  )
  exactKeys(network, ["enforcement"], "execution environment network capability")
  allowed(
    binding.capabilities.network.enforcement,
    ["none", "os"],
    "execution environment network enforcement"
  )
  supportedFlag(
    binding.capabilities.secretProjection,
    "execution environment Secret projection capability"
  )
  supportedFlag(
    binding.capabilities.artifactExport,
    "execution environment artifact export capability"
  )
}

function policy(binding: ExecutionEnvironmentBinding): void {
  const value = record(binding.policy, "execution environment policy")
  exactKeys(value, [
    "revision",
    "filesystem",
    "process",
    "network",
    "isolation",
    "pty"
  ], "execution environment policy")
  if (binding.policy.revision !== 1) {
    throw new Error("execution environment policy revision is invalid")
  }

  const filesystem = record(
    binding.policy.filesystem,
    "execution environment filesystem policy"
  )
  exactKeys(
    filesystem,
    ["roots", "maxReadBytes", "maxDirectoryEntries"],
    "execution environment filesystem policy"
  )
  let previousRoot: string | undefined
  for (const root of binding.policy.filesystem.roots) {
    const value = record(root, "execution environment filesystem root")
    exactKeys(value, ["id", "effects"], "execution environment filesystem root")
    opaqueId(root.id, "execution environment filesystem root id")
    if (previousRoot !== undefined && previousRoot >= root.id) {
      throw new Error("execution environment filesystem roots are not canonical")
    }
    previousRoot = root.id
    effects(root.effects, "execution environment filesystem root effects")
  }
  positiveInteger(
    binding.policy.filesystem.maxReadBytes,
    "execution environment max read bytes"
  )
  positiveInteger(
    binding.policy.filesystem.maxDirectoryEntries,
    "execution environment max directory entries"
  )

  const process = record(binding.policy.process, "execution environment process policy")
  exactKeys(
    process,
    ["oneShot", "managed", "cleanup", "environmentVariables"],
    "execution environment process policy"
  )
  boolean(binding.policy.process.oneShot, "execution environment one-shot policy")
  boolean(binding.policy.process.managed, "execution environment managed policy")
  allowed(
    binding.policy.process.cleanup,
    ["runtime_process_tree", "durable_supervisor"],
    "execution environment cleanup policy"
  )
  canonicalStrings(
    binding.policy.process.environmentVariables,
    "execution environment process environment variables"
  )
  allowed(
    binding.policy.network,
    ["unrestricted", "denied"],
    "execution environment network policy"
  )
  allowed(
    binding.policy.isolation,
    ["none", "os"],
    "execution environment isolation policy"
  )
  boolean(binding.policy.pty, "execution environment PTY policy")
}

function supportedFlag(value: unknown, label: string): void {
  const flag = record(value, label)
  exactKeys(flag, ["supported"], label)
  boolean(flag.supported, `${label} supported flag`)
}

function effects(values: readonly ExecutionFileEffect[], label: string): void {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`${label} must contain unique effects`)
  }
  let previous: string | undefined
  for (const value of values) {
    allowed(value, FILE_EFFECTS, label)
    if (previous !== undefined && previous >= value) {
      throw new Error(`${label} are not canonical`)
    }
    previous = value
  }
}

function canonicalStrings(values: readonly string[], label: string): void {
  if (!Array.isArray(values)) throw new Error(`${label} must be an array`)
  let previous: string | undefined
  for (const value of values) {
    boundedString(value, label)
    if (previous !== undefined && previous >= value) {
      throw new Error(`${label} are not canonical`)
    }
    previous = value
  }
}

function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as Readonly<Record<string, unknown>>
}

function exactKeys(
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[],
  label: string
): void {
  if (
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.prototype.hasOwnProperty.call(value, key))
  ) {
    throw new Error(`${label} contains missing or unknown fields`)
  }
}

function opaqueId(value: unknown, label: string): void {
  if (typeof value !== "string" || !/^[A-Za-z0-9_.:-]{1,256}$/u.test(value)) {
    throw new Error(`${label} must be an opaque identifier`)
  }
}

function boundedString(value: unknown, label: string): void {
  if (typeof value !== "string" || value.length === 0 || value.length > 256) {
    throw new Error(`${label} must be a non-empty string of at most 256 characters`)
  }
}

function positiveInteger(value: unknown, label: string): void {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error(`${label} must be a positive safe integer`)
  }
}

function boolean(value: unknown, label: string): void {
  if (typeof value !== "boolean") throw new Error(`${label} must be a boolean`)
}

function sha256(value: unknown, label: string): void {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) {
    throw new Error(`${label} is invalid`)
  }
}

function allowed<T extends string>(
  value: unknown,
  values: readonly T[],
  label: string
): asserts value is T {
  if (typeof value !== "string" || !values.includes(value as T)) {
    throw new Error(`${label} is invalid`)
  }
}

function digestJson(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex")
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value))
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson)
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortJson(item)])
    )
  }
  return value
}
