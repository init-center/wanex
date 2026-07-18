import { PLUGIN_CAPABILITIES } from "./internal-validation.js"
import { validatePluginSandboxAccessRequest } from "./sandbox.js"
import type { SubprocessPluginActionHostOptions } from "./types.js"

export function validateSubprocessPluginActionHostOptions(
  options: SubprocessPluginActionHostOptions
): void {
  if (options.command.length === 0) {
    throw new Error("plugin subprocess command must not be empty")
  }
  if (options.timeoutMs !== undefined && options.timeoutMs <= 0) {
    throw new Error("plugin subprocess timeoutMs must be positive")
  }
  if (
    options.stdoutLimitBytes !== undefined &&
    options.stdoutLimitBytes <= 0
  ) {
    throw new Error("plugin subprocess stdoutLimitBytes must be positive")
  }
  if (
    options.stderrLimitBytes !== undefined &&
    options.stderrLimitBytes <= 0
  ) {
    throw new Error("plugin subprocess stderrLimitBytes must be positive")
  }
  for (const descriptor of options.descriptors) {
    if (descriptor.pluginId.length === 0) {
      throw new Error("plugin subprocess descriptor pluginId must not be empty")
    }
    if (descriptor.actionId.length === 0) {
      throw new Error("plugin subprocess descriptor actionId must not be empty")
    }
    if (!PLUGIN_CAPABILITIES.has(descriptor.capability)) {
      throw new Error(`invalid plugin capability: ${descriptor.capability}`)
    }
    if (descriptor.sandbox !== undefined) {
      validatePluginSandboxAccessRequest(descriptor.sandbox)
    }
  }
}
