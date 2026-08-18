import type { JsonValue } from "@wanex/protocol"
import { pluginSubprocessManifestEntryFromJson } from "./codec-subprocess.js"
import {
  expectPluginPackageFiles,
  expectPluginPackageRuntimeDependencies
} from "./codec-layout-parts.js"
import { expectPluginPackageContributions } from "./codec-layout-contributions.js"
import { validatePluginPackageLayout } from "./codec-layout-validation.js"
import {
  expectJsonValue,
  expectPluginCapabilityArray,
  expectRecord,
  expectString
} from "./internal-validation.js"
import { WANEX_PLUGIN_PACKAGE_LAYOUT_KIND } from "./types.js"
import type { PluginPackageLayout } from "./types.js"

export function pluginPackageLayoutFromJson(value: JsonValue): PluginPackageLayout {
  const record = expectRecord(value, "plugin package layout")
  const kind = expectString(record.kind, "plugin package layout kind")
  if (kind !== WANEX_PLUGIN_PACKAGE_LAYOUT_KIND) {
    throw new Error("plugin package layout kind is not supported")
  }
  const layout: PluginPackageLayout = {
    kind: WANEX_PLUGIN_PACKAGE_LAYOUT_KIND,
    pluginId: expectString(record.pluginId, "plugin package layout pluginId"),
    version: expectString(record.version, "plugin package layout version"),
    ...(record.name === undefined
      ? {}
      : { name: expectString(record.name, "plugin package layout name") }),
    ...(record.packageName === undefined
      ? {}
      : {
          packageName: expectString(
            record.packageName,
            "plugin package layout packageName"
          )
        }),
    entry: pluginSubprocessManifestEntryFromJson(
      expectJsonValue(record.entry, "plugin package layout entry")
    ),
    capabilities: expectPluginCapabilityArray(
      record.capabilities,
      "plugin package layout capabilities"
    ),
    ...(record.contributes === undefined
      ? {}
      : {
          contributes: expectPluginPackageContributions(record.contributes)
        }),
    ...(record.runtimeDependencies === undefined
      ? {}
      : {
          runtimeDependencies: expectPluginPackageRuntimeDependencies(
            record.runtimeDependencies
          )
        }),
    ...(record.files === undefined
      ? {}
      : { files: expectPluginPackageFiles(record.files) }),
    ...(record.metadata === undefined
      ? {}
      : { metadata: expectJsonValue(record.metadata, "plugin package layout metadata") })
  }
  validatePluginPackageLayout(layout)
  return layout
}
