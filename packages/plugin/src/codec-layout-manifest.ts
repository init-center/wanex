import type { JsonValue } from "@wanex/protocol"
import { pluginPackageLayoutFromJson } from "./codec-layout-parse.js"
import { expectJsonValue } from "./internal-validation.js"
import type { RegisterPluginManifestRequest } from "./types.js"
import type { PluginPackageLayout } from "./types.js"

export function registerPluginManifestRequestFromPackageLayout(
  layout: PluginPackageLayout | JsonValue
): RegisterPluginManifestRequest {
  const parsed = pluginPackageLayoutFromJson(
    expectJsonValue(layout, "plugin package layout")
  )
  return {
    pluginId: parsed.pluginId,
    version: parsed.version,
    ...(parsed.name === undefined ? {} : { name: parsed.name }),
    entry: parsed.entry as unknown as JsonValue,
    capabilities: parsed.capabilities,
    ...(parsed.metadata === undefined ? {} : { metadata: parsed.metadata }),
    idempotencyKey: `plugin-package-layout:${parsed.pluginId}:${parsed.version}`
  }
}
