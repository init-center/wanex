import type {
  PluginPermissionGrant,
  PluginPermissionPolicy
} from "./types.js"
import { validatePluginPermissionGrant } from "./permission-validation.js"
import {
  pluginPermissionPolicyFromGrantUnsafe
} from "./permission-grant-projection.js"

export function pluginPermissionPolicyFromGrant(
  grant: PluginPermissionGrant
): PluginPermissionPolicy {
  validatePluginPermissionGrant(grant)
  return pluginPermissionPolicyFromGrantUnsafe(grant)
}
