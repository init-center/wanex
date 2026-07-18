import type {
  PluginPermissionGrant,
  PluginSandboxGuard,
  PluginSandboxPolicy
} from "./types.js"
import { pluginSandboxPolicyFromGrant } from "./sandbox-grant.js"
import {
  isAccessRequestAllowed,
  isCapabilityAllowed,
  isPolicyIdentityMatch
} from "./sandbox-match.js"
import { validatePluginSandboxPolicy } from "./sandbox-validation.js"

export function createPluginSandboxGuard(
  policy: PluginSandboxPolicy
): PluginSandboxGuard {
  validatePluginSandboxPolicy(policy)
  return {
    authorize(options) {
      if (policy.decision === "deny") {
        return {
          status: "denied",
          policy,
          ...(policy.reason === undefined ? {} : { reason: policy.reason })
        }
      }
      if (options.plugin.pluginId !== policy.pluginId) {
        return {
          status: "denied",
          policy,
          reason: `plugin mismatch: ${options.plugin.pluginId}`
        }
      }
      if (policy.version !== undefined && options.plugin.version !== policy.version) {
        return {
          status: "denied",
          policy,
          reason: `plugin version mismatch: ${options.plugin.version}`
        }
      }
      if (!isCapabilityAllowed(policy.capabilities, options.actionCapability)) {
        return {
          status: "denied",
          policy,
          reason: `plugin capability denied: ${options.actionCapability}`
        }
      }
      if (!isAccessRequestAllowed(policy, options.request)) {
        return {
          status: "denied",
          policy,
          reason: `plugin sandbox access denied: ${options.plugin.pluginId}/${options.actionId}`
        }
      }
      return { status: "allowed", policy }
    }
  }
}

export function createPluginPermissionGrantGuard(
  grants: readonly PluginPermissionGrant[]
): PluginSandboxGuard {
  if (grants.length === 0) {
    throw new Error("plugin permission grants must not be empty")
  }
  const policies = grants.map(pluginSandboxPolicyFromGrant)
  return {
    authorize(options) {
      for (const policy of policies) {
        if (
          policy.decision === "deny" &&
          isPolicyIdentityMatch(policy, options.plugin) &&
          isCapabilityAllowed(policy.capabilities, options.actionCapability) &&
          isAccessRequestAllowed(policy, options.request)
        ) {
          return {
            status: "denied",
            policy,
            ...(policy.reason === undefined ? {} : { reason: policy.reason })
          }
        }
      }
      for (const policy of policies) {
        if (
          policy.decision === "allow" &&
          isPolicyIdentityMatch(policy, options.plugin) &&
          isCapabilityAllowed(policy.capabilities, options.actionCapability) &&
          isAccessRequestAllowed(policy, options.request)
        ) {
          return { status: "allowed", policy }
        }
      }
      return {
        status: "denied",
        policy: {
          pluginId: options.plugin.pluginId,
          version: options.plugin.version,
          decision: "deny",
          reason: "no matching plugin permission grant"
        },
        reason: "no matching plugin permission grant"
      }
    }
  }
}
