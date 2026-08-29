import { expectJsonValue, validateStringList } from "./internal-validation.js"
import type {
  PluginPermissionGrant,
  PluginPermissionRequest,
  PluginPermissionPolicy
} from "./types.js"
import { pluginPermissionPolicyFromGrantUnsafe } from "./permission-grant-projection.js"

export function validatePluginPermissionGrant(
  grant: PluginPermissionGrant
): void {
  validatePluginPermissionPolicy(pluginPermissionPolicyFromGrantUnsafe(grant))
  if (grant.metadata !== undefined) {
    expectJsonValue(grant.metadata, "plugin permission grant metadata")
  }
}

export function validatePluginPermissionPolicy(policy: PluginPermissionPolicy): void {
  if (policy.pluginId.length === 0) {
    throw new Error("plugin permission policy pluginId must not be empty")
  }
  if (policy.decision !== "allow" && policy.decision !== "deny") {
    throw new Error("plugin permission policy decision must be allow or deny")
  }
  if (policy.reason !== undefined && policy.reason.length === 0) {
    throw new Error("plugin permission policy reason must not be empty")
  }
  validateStringList(policy.capabilities, "plugin permission policy capabilities")
  validateStringList(policy.resources, "plugin permission policy resources")
  validateStringList(policy.networks, "plugin permission policy networks")
  validateStringList(
    policy.fileSystemPaths,
    "plugin permission policy fileSystemPaths"
  )
  if (policy.maxExecutionMs !== undefined && policy.maxExecutionMs <= 0) {
    throw new Error("plugin permission policy maxExecutionMs must be positive")
  }
}

export function validatePluginPermissionRequest(
  request: PluginPermissionRequest
): void {
  validateStringList(request.resources, "plugin permission request resources")
  validateStringList(request.networks, "plugin permission request networks")
  validateStringList(
    request.fileSystemPaths,
    "plugin permission request fileSystemPaths"
  )
  if (request.maxExecutionMs !== undefined && request.maxExecutionMs <= 0) {
    throw new Error("plugin permission request maxExecutionMs must be positive")
  }
}
