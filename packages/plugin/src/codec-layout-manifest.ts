import type { JsonValue } from "@wanex/protocol"
import { pluginPackageLayoutFromJson } from "./codec-layout-parse.js"
import type { RegisterPluginManifestRequest } from "./types.js"
import { WANEX_PLUGIN_PACKAGE_LAYOUT_KIND } from "./types.js"
import type { PluginPackageLayout } from "./types.js"

export function registerPluginManifestRequestFromPackageLayout(
  layout: PluginPackageLayout | JsonValue
): RegisterPluginManifestRequest {
  const parsed = isPluginPackageLayout(layout)
    ? layout
    : pluginPackageLayoutFromJson(layout)
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

export function isPluginPackageLayout(
  value: PluginPackageLayout | JsonValue
): value is PluginPackageLayout {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as { readonly kind?: unknown }).kind === WANEX_PLUGIN_PACKAGE_LAYOUT_KIND
  )
}
