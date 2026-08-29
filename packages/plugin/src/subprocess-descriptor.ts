import type { PluginActionDescriptor } from "./types.js"

export function pluginActionDescriptorFromDefinitionLike(
  definition: PluginActionDescriptor
): PluginActionDescriptor {
  return {
    capability: definition.capability,
    version: definition.version,
    ...(definition.permissions === undefined
      ? {}
      : { permissions: definition.permissions })
  }
}
