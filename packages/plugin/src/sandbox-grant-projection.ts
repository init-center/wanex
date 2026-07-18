import type {
  PluginPermissionGrant,
  PluginSandboxPolicy
} from "./types.js"

export function pluginSandboxPolicyFromGrantUnsafe(
  grant: PluginPermissionGrant
): PluginSandboxPolicy {
  return {
    pluginId: grant.pluginId,
    ...(grant.version === undefined ? {} : { version: grant.version }),
    decision: grant.decision,
    ...(grant.reason === undefined ? {} : { reason: grant.reason }),
    ...(grant.capabilities === undefined
      ? {}
      : { capabilities: grant.capabilities }),
    ...(grant.resources === undefined ? {} : { resources: grant.resources }),
    ...(grant.networks === undefined ? {} : { networks: grant.networks }),
    ...(grant.fileSystemPaths === undefined
      ? {}
      : { fileSystemPaths: grant.fileSystemPaths }),
    ...(grant.maxExecutionMs === undefined
      ? {}
      : { maxExecutionMs: grant.maxExecutionMs })
  }
}
