import type {
  ExecutePluginActionRequest,
  PluginActionHost,
  ResolvePluginActionRequest
} from "./types-action.js"

export interface CompositePluginActionHostEntry {
  readonly pluginId: string
  readonly host: PluginActionHost
}

export function createCompositePluginActionHost(
  entries: readonly CompositePluginActionHostEntry[]
): PluginActionHost {
  if (entries.length === 0) {
    throw new Error("composite plugin action host requires at least one entry")
  }
  const byPluginId = new Map<string, PluginActionHost>()
  for (const entry of entries) {
    const pluginId = entry.pluginId.trim()
    if (pluginId.length === 0) {
      throw new Error("composite plugin action host pluginId must not be empty")
    }
    if (byPluginId.has(pluginId)) {
      throw new Error(`duplicate composite plugin action host: ${pluginId}`)
    }
    byPluginId.set(pluginId, entry.host)
  }

  return {
    resolve(request) {
      return hostForResolve(byPluginId, request)?.resolve(request)
    },
    execute(request) {
      const host = byPluginId.get(request.manifest.pluginId)
      if (host === undefined) {
        throw new Error(
          `plugin action host not registered: ${request.manifest.pluginId}`
        )
      }
      return host.execute(request)
    }
  }
}

function hostForResolve(
  byPluginId: ReadonlyMap<string, PluginActionHost>,
  request: ResolvePluginActionRequest
): PluginActionHost | undefined {
  return byPluginId.get(request.pluginId)
}

export type CompositePluginActionExecuteRequest = ExecutePluginActionRequest
