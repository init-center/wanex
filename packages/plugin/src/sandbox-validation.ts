import { expectJsonValue, validateStringList } from "./internal-validation.js"
import type {
  PluginPermissionGrant,
  PluginSandboxAccessRequest,
  PluginSandboxPolicy
} from "./types.js"
import { pluginSandboxPolicyFromGrantUnsafe } from "./sandbox-grant-projection.js"

export function validatePluginPermissionGrant(
  grant: PluginPermissionGrant
): void {
  validatePluginSandboxPolicy(pluginSandboxPolicyFromGrantUnsafe(grant))
  if (grant.metadata !== undefined) {
    expectJsonValue(grant.metadata, "plugin permission grant metadata")
  }
}

export function validatePluginSandboxPolicy(policy: PluginSandboxPolicy): void {
  if (policy.pluginId.length === 0) {
    throw new Error("plugin sandbox policy pluginId must not be empty")
  }
  if (policy.decision !== "allow" && policy.decision !== "deny") {
    throw new Error("plugin sandbox policy decision must be allow or deny")
  }
  if (policy.reason !== undefined && policy.reason.length === 0) {
    throw new Error("plugin sandbox policy reason must not be empty")
  }
  validateStringList(policy.capabilities, "plugin sandbox policy capabilities")
  validateStringList(policy.resources, "plugin sandbox policy resources")
  validateStringList(policy.networks, "plugin sandbox policy networks")
  validateStringList(
    policy.fileSystemPaths,
    "plugin sandbox policy fileSystemPaths"
  )
  if (policy.maxExecutionMs !== undefined && policy.maxExecutionMs <= 0) {
    throw new Error("plugin sandbox policy maxExecutionMs must be positive")
  }
}

export function validatePluginSandboxAccessRequest(
  request: PluginSandboxAccessRequest
): void {
  validateStringList(request.resources, "plugin sandbox request resources")
  validateStringList(request.networks, "plugin sandbox request networks")
  validateStringList(
    request.fileSystemPaths,
    "plugin sandbox request fileSystemPaths"
  )
  if (request.maxExecutionMs !== undefined && request.maxExecutionMs <= 0) {
    throw new Error("plugin sandbox request maxExecutionMs must be positive")
  }
}
