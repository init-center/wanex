import type {
  PluginActionCatalog,
  PluginActionDescriptor,
  PluginActionHandlerDefinition,
  PluginActionHost,
  PluginActionJobHandlerOptions
} from "./types.js"

export function createInProcessPluginActionHost(options: {
  readonly catalog: PluginActionCatalog
}): PluginActionHost {
  return {
    resolve(request) {
      const definition = getActionDefinition(
        options.catalog,
        request.pluginId,
        request.actionId
      )
      if (definition === undefined) {
        return undefined
      }
      if (definition.version !== request.version) {
        return undefined
      }
      return pluginActionDescriptorFromDefinition(definition)
    },
    async execute(request) {
      const definition = getActionDefinition(
        options.catalog,
        request.manifest.pluginId,
        request.actionId
      )
      if (definition === undefined) {
        throw new Error(
          `plugin action handler not registered: ${request.manifest.pluginId}/${request.actionId}`
        )
      }
      if (definition.version !== request.manifest.version) {
        throw new Error(
          `plugin action host version mismatch: ${definition.version} != ${request.manifest.version}`
        )
      }
      if (definition.capability !== request.capability) {
        throw new Error(
          `plugin action host capability mismatch: ${definition.capability} != ${request.capability}`
        )
      }
      return await definition.handler({
        job: request.job,
        manifest: request.manifest,
        payload: request.payload,
        storage: request.storage,
        signal: request.signal,
        heartbeat: request.heartbeat
      })
    }
  }
}

export function resolvePluginActionHost(
  options: PluginActionJobHandlerOptions
): PluginActionHost {
  if (options.host !== undefined) {
    return options.host
  }
  if (options.catalog !== undefined) {
    return createInProcessPluginActionHost({ catalog: options.catalog })
  }
  throw new Error("plugin action handler requires a host or catalog")
}

function getActionDefinition(
  catalog: PluginActionCatalog,
  pluginId: string,
  actionId: string
): PluginActionHandlerDefinition | undefined {
  const pluginCatalog = isCatalogMap(catalog)
    ? catalog.get(pluginId)
    : catalog[pluginId]
  if (pluginCatalog === undefined) {
    return undefined
  }
  return isActionMap(pluginCatalog)
    ? pluginCatalog.get(actionId)
    : pluginCatalog[actionId]
}

function pluginActionDescriptorFromDefinition(
  definition: PluginActionHandlerDefinition
): PluginActionDescriptor {
  return {
    capability: definition.capability,
    version: definition.version,
    ...(definition.sandbox === undefined ? {} : { sandbox: definition.sandbox })
  }
}

function isCatalogMap(
  catalog: PluginActionCatalog
): catalog is ReadonlyMap<
  string,
  ReadonlyMap<string, PluginActionHandlerDefinition>
> {
  return typeof (catalog as { get?: unknown }).get === "function"
}

function isActionMap(
  catalog:
    | ReadonlyMap<string, PluginActionHandlerDefinition>
    | Record<string, PluginActionHandlerDefinition>
): catalog is ReadonlyMap<string, PluginActionHandlerDefinition> {
  return typeof (catalog as { get?: unknown }).get === "function"
}
