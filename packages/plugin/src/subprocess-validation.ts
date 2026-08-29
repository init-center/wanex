import { PLUGIN_CAPABILITIES } from "./internal-validation.js"
import { validatePluginPermissionRequest } from "./permission.js"
import type { SubprocessPluginActionHostOptions } from "./types.js"
import { isAbsolute } from "node:path"

export function validateSubprocessPluginActionHostOptions(
  options: SubprocessPluginActionHostOptions
): void {
  if (options.command.length === 0) {
    throw new Error("plugin subprocess command must not be empty")
  }
  if (!isAbsolute(options.cwd) || options.cwd.includes("\0")) {
    throw new Error("plugin subprocess cwd must be absolute")
  }
  if (
    options.executionEnvironment === undefined ||
    typeof options.executionEnvironment.bind !== "function"
  ) {
    throw new Error("plugin subprocess executionEnvironment is required")
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
    if (descriptor.permissions !== undefined) {
      validatePluginPermissionRequest(descriptor.permissions)
    }
  }
}
