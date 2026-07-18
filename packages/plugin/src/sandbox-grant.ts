import type {
  PluginPermissionGrant,
  PluginSandboxPolicy
} from "./types.js"
import { validatePluginPermissionGrant } from "./sandbox-validation.js"
import {
  pluginSandboxPolicyFromGrantUnsafe
} from "./sandbox-grant-projection.js"

export function pluginSandboxPolicyFromGrant(
  grant: PluginPermissionGrant
): PluginSandboxPolicy {
  validatePluginPermissionGrant(grant)
  return pluginSandboxPolicyFromGrantUnsafe(grant)
}
