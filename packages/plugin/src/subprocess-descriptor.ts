import type { PluginActionDescriptor } from "./types.js"

export function pluginActionDescriptorFromDefinitionLike(
  definition: PluginActionDescriptor
): PluginActionDescriptor {
  return {
    capability: definition.capability,
    ...(definition.version === undefined ? {} : { version: definition.version }),
    ...(definition.sandbox === undefined ? {} : { sandbox: definition.sandbox })
  }
}
