import type { PluginCapability, PluginManifestRecord } from "@wanex/protocol"
import type {
  PluginSandboxAccessRequest,
  PluginSandboxPolicy
} from "./types.js"

export function isCapabilityAllowed(
  allowed: readonly PluginCapability[] | undefined,
  capability: PluginCapability
): boolean {
  if (allowed === undefined) {
    return false
  }
  return allowed.includes(capability)
}

export function isPolicyIdentityMatch(
  policy: PluginSandboxPolicy,
  manifest: PluginManifestRecord
): boolean {
  return (
    policy.pluginId === manifest.pluginId &&
    (policy.version === undefined || policy.version === manifest.version)
  )
}

export function isAccessRequestAllowed(
  policy: PluginSandboxPolicy,
  request: PluginSandboxAccessRequest | undefined
): boolean {
  if (request === undefined) {
    return true
  }
  return (
    isListAllowed(request.resources, policy.resources) &&
    isListAllowed(request.networks, policy.networks) &&
    isListAllowed(request.fileSystemPaths, policy.fileSystemPaths) &&
    isExecutionTimeAllowed(request.maxExecutionMs, policy.maxExecutionMs)
  )
}

function isListAllowed(
  requested: readonly string[] | undefined,
  allowed: readonly string[] | undefined
): boolean {
  if (requested === undefined || requested.length === 0) {
    return true
  }
  if (allowed === undefined || allowed.length === 0) {
    return false
  }
  if (allowed.includes("*")) {
    return true
  }
  return requested.every((entry) => allowed.includes(entry))
}

function isExecutionTimeAllowed(
  requested: number | undefined,
  allowed: number | undefined
): boolean {
  if (requested === undefined) {
    return true
  }
  if (allowed === undefined) {
    return false
  }
  return requested <= allowed
}
