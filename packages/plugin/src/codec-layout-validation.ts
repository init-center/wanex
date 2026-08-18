import { validatePackageRelativePath } from "./internal-validation.js"
import type { PluginPackageLayout } from "./types.js"

export function validatePluginPackageLayout(layout: PluginPackageLayout): void {
  validateIdentity(layout.pluginId, "pluginId", /^[a-z0-9][a-z0-9._-]{0,127}$/u)
  validateIdentity(layout.version, "version", /^[0-9A-Za-z][0-9A-Za-z._+-]{0,63}$/u)
  if (layout.capabilities.length === 0) {
    throw new Error("plugin package layout capabilities must not be empty")
  }
  const declared = new Set(layout.capabilities)
  if (declared.size !== layout.capabilities.length) {
    throw new Error("plugin package layout capabilities must be unique")
  }
  const actionIds = new Set<string>()
  for (const action of layout.entry.actions) {
    validateIdentity(
      action.actionId,
      "actionId",
      /^[a-z0-9][a-z0-9._-]{0,127}$/u
    )
    if (actionIds.has(action.actionId)) {
      throw new Error(`duplicate plugin package action: ${action.actionId}`)
    }
    actionIds.add(action.actionId)
    if (!declared.has(action.capability)) {
      throw new Error(
        `plugin package layout action capability is not declared: ${action.capability}`
      )
    }
  }
  const commandIds = new Set<string>()
  const invocationNames = new Set<string>()
  for (const command of layout.contributes?.commands ?? []) {
    if (commandIds.has(command.id)) {
      throw new Error(`duplicate plugin package command id: ${command.id}`)
    }
    commandIds.add(command.id)
    if (!actionIds.has(command.actionId)) {
      throw new Error(
        `plugin package command action does not exist: ${command.actionId}`
      )
    }
    for (const name of [command.name, ...(command.aliases ?? [])]) {
      if (invocationNames.has(name)) {
        throw new Error(
          `duplicate plugin package command invocation name: ${name}`
        )
      }
      invocationNames.add(name)
    }
  }
  validatePackageRelativePath(layout.entry.command, "plugin package entry command")
  const filePaths = new Set<string>()
  for (const file of layout.files ?? []) {
    validatePackageRelativePath(file.path, "plugin package file path")
    if (filePaths.has(file.path)) {
      throw new Error(`duplicate plugin package file: ${file.path}`)
    }
    filePaths.add(file.path)
  }
  const dependencyNames = new Set<string>()
  for (const dependency of layout.runtimeDependencies ?? []) {
    if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u.test(dependency.name)) {
      throw new Error(
        `plugin package runtime dependency name is invalid: ${dependency.name}`
      )
    }
    if (dependencyNames.has(dependency.name)) {
      throw new Error(`duplicate plugin package runtime dependency: ${dependency.name}`)
    }
    dependencyNames.add(dependency.name)
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

function validateIdentity(
  value: string,
  label: string,
  pattern: RegExp
): void {
  if (!pattern.test(value)) {
    throw new Error(`plugin package layout ${label} is invalid`)
  }
}
