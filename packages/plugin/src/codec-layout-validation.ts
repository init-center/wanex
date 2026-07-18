import { validatePackageRelativePath } from "./internal-validation.js"
import type { PluginPackageLayout } from "./types.js"

export function validatePluginPackageLayout(layout: PluginPackageLayout): void {
  if (layout.capabilities.length === 0) {
    throw new Error("plugin package layout capabilities must not be empty")
  }
  const declared = new Set(layout.capabilities)
  for (const action of layout.entry.actions) {
    if (!declared.has(action.capability)) {
      throw new Error(
        `plugin package layout action capability is not declared: ${action.capability}`
      )
    }
  }
  validatePackageRelativePath(layout.entry.command, "plugin package entry command")
  for (const file of layout.files ?? []) {
    validatePackageRelativePath(file.path, "plugin package file path")
  }
  for (const dependency of layout.runtimeDependencies ?? []) {
    if (dependency.name.length === 0) {
      throw new Error("plugin package runtime dependency name must not be empty")
    }
    if (
      dependency.distribution === "bundled" &&
      dependency.loading !== "lazy"
    ) {
      throw new Error(
        `plugin package bundled runtime dependency must be lazy-loaded: ${dependency.name}`
      )
    }
    if (
      dependency.distribution === "bundled" &&
      (dependency.maxPackedBytes === undefined ||
        dependency.maxPackedBytes <= 0)
    ) {
      throw new Error(
        `plugin package bundled runtime dependency must declare maxPackedBytes: ${dependency.name}`
      )
    }
  }
}
