import type { LocalPluginPackageLimits } from "./types.js"

export const DEFAULT_LOCAL_PLUGIN_PACKAGE_LIMITS: LocalPluginPackageLimits = {
  maxManifestBytes: 128 * 1024,
  maxFiles: 2_048,
  maxFileBytes: 16 * 1024 * 1024,
  maxTotalBytes: 64 * 1024 * 1024,
  maxPathBytes: 512,
  maxPathDepth: 16
}

export function resolveLocalPluginPackageLimits(
  overrides: Partial<LocalPluginPackageLimits> | undefined
): LocalPluginPackageLimits {
  const limits = { ...DEFAULT_LOCAL_PLUGIN_PACKAGE_LIMITS, ...overrides }
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`local plugin package ${name} must be a positive safe integer`)
    }
  }
  return limits
}
