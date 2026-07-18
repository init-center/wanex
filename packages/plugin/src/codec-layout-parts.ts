import type { JsonValue } from "@wanex/protocol"
import {
  expectBoolean,
  expectNonNegativeInteger,
  expectRecord,
  expectSha256,
  expectString,
  expectStringArray,
  PLUGIN_PACKAGE_DEPENDENCY_DISTRIBUTIONS,
  PLUGIN_PACKAGE_DEPENDENCY_LOADINGS
} from "./internal-validation.js"
import type {
  PluginPackageFileEntry,
  PluginPackageRuntimeDependency,
  PluginPackageRuntimeDependencyDistribution,
  PluginPackageRuntimeDependencyLoading
} from "./types.js"

export function expectPluginPackageRuntimeDependencies(
  value: JsonValue | undefined
): PluginPackageRuntimeDependency[] {
  if (!Array.isArray(value)) {
    throw new Error("plugin package runtimeDependencies must be an array")
  }
  return value.map((entry, index) => {
    const record = expectRecord(
      entry,
      `plugin package runtimeDependencies[${index}]`
    )
    const loading = expectString(
      record.loading,
      `plugin package runtimeDependencies[${index}].loading`
    )
    if (!PLUGIN_PACKAGE_DEPENDENCY_LOADINGS.has(loading as PluginPackageRuntimeDependencyLoading)) {
      throw new Error(`plugin package runtime dependency loading is not supported: ${loading}`)
    }
    const distribution = expectString(
      record.distribution,
      `plugin package runtimeDependencies[${index}].distribution`
    )
    if (!PLUGIN_PACKAGE_DEPENDENCY_DISTRIBUTIONS.has(distribution as PluginPackageRuntimeDependencyDistribution)) {
      throw new Error(
        `plugin package runtime dependency distribution is not supported: ${distribution}`
      )
    }
    return {
      name: expectString(
        record.name,
        `plugin package runtimeDependencies[${index}].name`
      ),
      ...(record.version === undefined
        ? {}
        : {
            version: expectString(
              record.version,
              `plugin package runtimeDependencies[${index}].version`
            )
          }),
      loading: loading as PluginPackageRuntimeDependencyLoading,
      distribution: distribution as PluginPackageRuntimeDependencyDistribution,
      ...(record.platforms === undefined
        ? {}
        : {
            platforms: expectStringArray(
              record.platforms,
              `plugin package runtimeDependencies[${index}].platforms`
            )
          }),
      ...(record.maxPackedBytes === undefined
        ? {}
        : {
            maxPackedBytes: expectNonNegativeInteger(
              record.maxPackedBytes,
              `plugin package runtimeDependencies[${index}].maxPackedBytes`
            )
          })
    }
  })
}

export function expectPluginPackageFiles(
  value: JsonValue | undefined
): PluginPackageFileEntry[] {
  if (!Array.isArray(value)) {
    throw new Error("plugin package files must be an array")
  }
  return value.map((entry, index) => {
    const record = expectRecord(entry, `plugin package files[${index}]`)
    return {
      path: expectString(record.path, `plugin package files[${index}].path`),
      ...(record.sha256 === undefined
        ? {}
        : {
            sha256: expectSha256(
              record.sha256,
              `plugin package files[${index}].sha256`
            )
          }),
      ...(record.executable === undefined
        ? {}
        : {
            executable: expectBoolean(
              record.executable,
              `plugin package files[${index}].executable`
            )
          }),
      ...(record.bytes === undefined
        ? {}
        : {
            bytes: expectNonNegativeInteger(
              record.bytes,
              `plugin package files[${index}].bytes`
            )
          })
    }
  })
}
