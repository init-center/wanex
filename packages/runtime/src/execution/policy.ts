import type {
  ExecutionCapabilitySnapshot,
  ExecutionPolicySnapshot,
  ExecutionFileEffect,
} from "@wanex/protocol"
import { UnsupportedExecutionCapabilityError } from "./errors.js"

const EXECUTION_FILE_EFFECTS = new Set<ExecutionFileEffect>([
  "read",
  "write",
  "create",
  "remove",
])

/**
 * Checks the capability contract shared by every execution provider.
 * Provider-specific admission may add stricter checks, but it must not
 * weaken this common fail-closed decision.
 */
export function assertExecutionPolicySupported(
  policy: ExecutionPolicySnapshot,
  capabilities: ExecutionCapabilitySnapshot,
): void {
  if (
    policy.isolation === "os" &&
    capabilities.isolation.enforcement !== "os"
  ) {
    throw new UnsupportedExecutionCapabilityError("isolation.os")
  }
  if (
    policy.network === "denied" &&
    capabilities.network.enforcement !== "os"
  ) {
    throw new UnsupportedExecutionCapabilityError("network.denied")
  }
  if (policy.pty && !capabilities.pty.supported) {
    throw new UnsupportedExecutionCapabilityError("pty")
  }
  if (policy.process.oneShot && !capabilities.process.oneShot) {
    throw new UnsupportedExecutionCapabilityError("process.oneShot")
  }
  if (policy.process.managed && !capabilities.process.managed) {
    throw new UnsupportedExecutionCapabilityError("process.managed")
  }
  if (
    (policy.process.oneShot || policy.process.managed) &&
    policy.process.cleanup === "durable_supervisor" &&
    capabilities.process.cleanup !== "durable_supervisor"
  ) {
    throw new UnsupportedExecutionCapabilityError("process.durable_supervisor")
  }

  const supportedEffects = new Set(capabilities.filesystem.effects)
  for (const root of policy.filesystem.roots) {
    for (const effect of root.effects) {
      if (!supportedEffects.has(effect)) {
        throw new UnsupportedExecutionCapabilityError(
          `filesystem.${effect}`,
        )
      }
    }
  }
}

export function normalizeExecutionPolicy(
  input: ExecutionPolicySnapshot,
): ExecutionPolicySnapshot {
  if (input.revision !== 1) {
    throw new Error("execution policy revision is unsupported")
  }
  if (typeof input.process.oneShot !== "boolean") {
    throw new Error("execution process oneShot policy must be boolean")
  }
  if (typeof input.process.managed !== "boolean") {
    throw new Error("execution process managed policy must be boolean")
  }
  if (
    input.process.cleanup !== "runtime_process_tree" &&
    input.process.cleanup !== "durable_supervisor"
  ) {
    throw new Error("execution process cleanup policy is invalid")
  }
  if (input.network !== "unrestricted" && input.network !== "denied") {
    throw new Error("execution network policy is invalid")
  }
  if (input.isolation !== "none" && input.isolation !== "os") {
    throw new Error("execution isolation policy is invalid")
  }
  if (typeof input.pty !== "boolean") {
    throw new Error("execution pty policy must be boolean")
  }
  positiveInteger(input.filesystem.maxReadBytes, "filesystem.maxReadBytes")
  positiveInteger(
    input.filesystem.maxDirectoryEntries,
    "filesystem.maxDirectoryEntries",
  )
  const roots = input.filesystem.roots
    .map((root) => {
      requireOpaqueId(root.id, "filesystem root id")
      const effects = [...new Set(root.effects)].sort()
      if (effects.length === 0) {
        throw new Error("execution filesystem root effects must not be empty")
      }
      if (effects.some((effect) => !EXECUTION_FILE_EFFECTS.has(effect))) {
        throw new Error("execution filesystem root effect is invalid")
      }
      return { id: root.id, effects }
    })
    .sort((left, right) => left.id.localeCompare(right.id))
  if (new Set(roots.map((root) => root.id)).size !== roots.length) {
    throw new Error("execution filesystem root id is duplicated")
  }
  const environmentVariables = [
    ...new Set(
      input.process.environmentVariables.map((name) => {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(name)) {
          throw new Error(
            `execution process environment variable is invalid: ${name}`,
          )
        }
        return name
      }),
    ),
  ].sort()
  return deepFreeze({
    revision: 1,
    filesystem: {
      roots,
      maxReadBytes: input.filesystem.maxReadBytes,
      maxDirectoryEntries: input.filesystem.maxDirectoryEntries,
    },
    process: {
      oneShot: input.process.oneShot,
      managed: input.process.managed,
      cleanup: input.process.cleanup,
      environmentVariables,
    },
    network: input.network,
    isolation: input.isolation,
    pty: input.pty,
  })
}

function requireOpaqueId(value: string, label: string): void {
  if (!/^[A-Za-z0-9_.:-]{1,256}$/u.test(value)) {
    throw new Error(`execution ${label} is invalid`)
  }
}

function positiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`execution ${label} must be a positive integer`)
  }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) {
      deepFreeze(item)
    }
    Object.freeze(value)
  }
  return value
}

export type { ExecutionCapabilitySnapshot, ExecutionFileEffect, ExecutionPolicySnapshot }
