import type {
  ApplicationScopeBinding,
  ExecutionCapabilitySnapshot,
  ExecutionEnvironmentBinding,
  ExecutionEnvironmentDescriptor,
  ExecutionFileEffect,
  ExecutionPolicySnapshot,
  JsonValue
} from "@wanex/protocol"
import {
  expectArray,
  expectBoolean,
  expectJsonField,
  expectNumber,
  expectString,
  isRecord
} from "./codec-helpers.js"
import { digestJson, expectSha256, requireExactKeys } from "./codec-model-evidence.js"

const FILE_EFFECTS = ["create", "read", "remove", "write"] as const

export function readExecutionEnvironmentBinding(
  value: JsonValue | undefined,
  label: string
): ExecutionEnvironmentBinding {
  if (!isRecord(value)) throw new Error(`${label} must be an object`)
  requireExactKeys(
    value,
    [
      "revision",
      "environmentId",
      "providerId",
      "providerRevision",
      "capabilities",
      "capabilityDigest",
      "policy",
      "policyDigest"
    ],
    label
  )
  const binding: ExecutionEnvironmentBinding = {
    revision: expectRevision(value.revision, `${label}.revision`),
    environmentId: expectBoundedString(value.environmentId, `${label}.environmentId`),
    providerId: expectBoundedString(value.providerId, `${label}.providerId`),
    providerRevision: expectBoundedString(
      value.providerRevision,
      `${label}.providerRevision`
    ),
    capabilities: readCapabilities(value.capabilities, `${label}.capabilities`),
    capabilityDigest: expectSha256(
      value.capabilityDigest,
      `${label}.capabilityDigest`
    ),
    policy: readPolicy(value.policy, `${label}.policy`),
    policyDigest: expectSha256(value.policyDigest, `${label}.policyDigest`)
  }
  if (digestJson(binding.capabilities) !== binding.capabilityDigest) {
    throw new Error(`${label}.capabilityDigest does not match its content`)
  }
  if (digestJson(binding.policy) !== binding.policyDigest) {
    throw new Error(`${label}.policyDigest does not match its content`)
  }
  return binding
}

export function readApplicationScopeBinding(
  value: JsonValue | undefined,
  label: string
): ApplicationScopeBinding {
  if (!isRecord(value)) throw new Error(`${label} must be an object`)
  requireExactKeys(value, ["kind", "id", "digest", "metadata"], label)
  const binding: ApplicationScopeBinding = {
    kind: expectBoundedString(value.kind, `${label}.kind`),
    id: expectBoundedString(value.id, `${label}.id`),
    digest: expectSha256(value.digest, `${label}.digest`),
    metadata: expectJsonField(value, "metadata", `${label}.metadata`)
  }
  const { digest: _digest, ...unsigned } = binding
  if (digestJson(unsigned) !== binding.digest) {
    throw new Error(`${label}.digest does not match its content`)
  }
  return binding
}

function readCapabilities(
  value: JsonValue | undefined,
  label: string
): ExecutionCapabilitySnapshot {
  if (!isRecord(value)) throw new Error(`${label} must be an object`)
  requireExactKeys(
    value,
    [
      "revision",
      "isolation",
      "filesystem",
      "process",
      "pty",
      "network",
      "secretProjection",
      "artifactExport"
    ],
    label
  )
  const isolation = readRecord(value.isolation, `${label}.isolation`)
  requireExactKeys(isolation, ["enforcement"], `${label}.isolation`)
  const filesystem = readRecord(value.filesystem, `${label}.filesystem`)
  requireExactKeys(filesystem, ["enforcement", "effects"], `${label}.filesystem`)
  const process = readRecord(value.process, `${label}.process`)
  requireExactKeys(
    process,
    ["oneShot", "managed", "cleanup"],
    `${label}.process`
  )
  const pty = readRecord(value.pty, `${label}.pty`)
  requireExactKeys(pty, ["supported"], `${label}.pty`)
  const network = readRecord(value.network, `${label}.network`)
  requireExactKeys(network, ["enforcement"], `${label}.network`)
  const secretProjection = readRecord(
    value.secretProjection,
    `${label}.secretProjection`
  )
  requireExactKeys(secretProjection, ["supported"], `${label}.secretProjection`)
  const artifactExport = readRecord(value.artifactExport, `${label}.artifactExport`)
  requireExactKeys(artifactExport, ["supported"], `${label}.artifactExport`)
  const effects = readEffects(filesystem.effects, `${label}.filesystem.effects`)
  const capability: ExecutionCapabilitySnapshot = {
    revision: expectRevision(value.revision, `${label}.revision`),
    isolation: {
      enforcement: expectAllowed(
        isolation.enforcement,
        ["none", "os"],
        `${label}.isolation.enforcement`
      )
    },
    filesystem: {
      enforcement: expectAllowed(
        filesystem.enforcement,
        ["library_guard", "os"],
        `${label}.filesystem.enforcement`
      ),
      effects
    },
    process: {
      oneShot: expectBoolean(process.oneShot, `${label}.process.oneShot`) as true,
      managed: expectBoolean(process.managed, `${label}.process.managed`),
      cleanup: expectAllowed(
        process.cleanup,
        ["runtime_process_tree", "durable_supervisor"],
        `${label}.process.cleanup`
      )
    },
    pty: { supported: expectBoolean(pty.supported, `${label}.pty.supported`) },
    network: {
      enforcement: expectAllowed(
        network.enforcement,
        ["none", "os"],
        `${label}.network.enforcement`
      )
    },
    secretProjection: {
      supported: expectBoolean(
        secretProjection.supported,
        `${label}.secretProjection.supported`
      )
    },
    artifactExport: {
      supported: expectBoolean(
        artifactExport.supported,
        `${label}.artifactExport.supported`
      )
    }
  }
  if (!capability.process.oneShot) {
    throw new Error(`${label}.process.oneShot must be true`)
  }
  return capability
}

function readPolicy(
  value: JsonValue | undefined,
  label: string
): ExecutionPolicySnapshot {
  if (!isRecord(value)) throw new Error(`${label} must be an object`)
  requireExactKeys(
    value,
    ["revision", "filesystem", "process", "network", "isolation", "pty"],
    label
  )
  const filesystem = readRecord(value.filesystem, `${label}.filesystem`)
  requireExactKeys(
    filesystem,
    ["roots", "maxReadBytes", "maxDirectoryEntries"],
    `${label}.filesystem`
  )
  const process = readRecord(value.process, `${label}.process`)
  requireExactKeys(
    process,
    ["oneShot", "managed", "cleanup", "environmentVariables"],
    `${label}.process`
  )
  const roots = expectArray(filesystem.roots, `${label}.filesystem.roots`).map(
    (root, index) => readPolicyRoot(root, `${label}.filesystem.roots.${index}`)
  )
  if (roots.some((root, index) => index > 0 && roots[index - 1]!.id >= root.id)) {
    throw new Error(`${label}.filesystem.roots must use canonical order`)
  }
  const environmentVariables = expectArray(
    process.environmentVariables,
    `${label}.process.environmentVariables`
  ).map((item, index) =>
    expectBoundedString(item, `${label}.process.environmentVariables.${index}`)
  )
  if (
    environmentVariables.some(
      (item, index) => index > 0 && environmentVariables[index - 1]! >= item
    )
  ) {
    throw new Error(`${label}.process.environmentVariables must use canonical order`)
  }
  return {
    revision: expectRevision(value.revision, `${label}.revision`),
    filesystem: {
      roots,
      maxReadBytes: expectPositiveInteger(
        filesystem.maxReadBytes,
        `${label}.filesystem.maxReadBytes`
      ),
      maxDirectoryEntries: expectPositiveInteger(
        filesystem.maxDirectoryEntries,
        `${label}.filesystem.maxDirectoryEntries`
      )
    },
    process: {
      oneShot: expectBoolean(process.oneShot, `${label}.process.oneShot`),
      managed: expectBoolean(process.managed, `${label}.process.managed`),
      cleanup: expectAllowed(
        process.cleanup,
        ["runtime_process_tree", "durable_supervisor"],
        `${label}.process.cleanup`
      ),
      environmentVariables
    },
    network: expectAllowed(
      value.network,
      ["unrestricted", "denied"],
      `${label}.network`
    ),
    isolation: expectAllowed(value.isolation, ["none", "os"], `${label}.isolation`),
    pty: expectBoolean(value.pty, `${label}.pty`)
  }
}

function readPolicyRoot(
  value: JsonValue,
  label: string
): ExecutionPolicySnapshot["filesystem"]["roots"][number] {
  if (!isRecord(value)) throw new Error(`${label} must be an object`)
  requireExactKeys(value, ["id", "effects"], label)
  return {
    id: expectBoundedString(value.id, `${label}.id`),
    effects: readEffects(value.effects, `${label}.effects`)
  }
}

function readEffects(
  value: JsonValue | undefined,
  label: string
): readonly ExecutionFileEffect[] {
  const effects = expectArray(value, label).map((item, index) =>
    expectAllowed(item, FILE_EFFECTS, `${label}.${index}`)
  )
  if (effects.length === 0 || new Set(effects).size !== effects.length) {
    throw new Error(`${label} must contain unique effects`)
  }
  if (effects.some((item, index) => index > 0 && effects[index - 1]! >= item)) {
    throw new Error(`${label} must use canonical order`)
  }
  return effects
}

function readRecord(value: JsonValue | undefined, label: string): Record<string, JsonValue> {
  if (!isRecord(value)) throw new Error(`${label} must be an object`)
  return value
}

function expectRevision(value: JsonValue | undefined, label: string): 1 {
  if (expectNumber(value, label) !== 1) throw new Error(`${label} must be 1`)
  return 1
}

function expectPositiveInteger(value: JsonValue | undefined, label: string): number {
  const number = expectNumber(value, label)
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`${label} must be a positive safe integer`)
  }
  return number
}

function expectBoundedString(value: JsonValue | undefined, label: string): string {
  const string = expectString(value, label)
  if (string.length === 0 || string.length > 256) {
    throw new Error(`${label} must be a non-empty string of at most 256 characters`)
  }
  return string
}

function expectAllowed<T extends string>(
  value: JsonValue | undefined,
  allowed: readonly T[],
  label: string
): T {
  const string = expectString(value, label)
  if (!allowed.includes(string as T)) throw new Error(`${label} is invalid`)
  return string as T
}
