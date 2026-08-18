import type {
  ExecutePluginActionRequest,
  PluginActionHost,
  ResolvePluginActionRequest
} from "./types-action.js"

export interface CompositePluginActionHostEntry {
  readonly pluginId: string
  readonly version: string
  readonly host: PluginActionHost
}

export function createCompositePluginActionHost(
  entries: readonly CompositePluginActionHostEntry[]
): PluginActionHost {
  if (entries.length === 0) {
    throw new Error("composite plugin action host requires at least one entry")
  }
  const byPluginVersion = new Map<string, PluginActionHost>()
  for (const entry of entries) {
    const pluginId = entry.pluginId.trim()
    const version = entry.version.trim()
    if (pluginId.length === 0) {
      throw new Error("composite plugin action host pluginId must not be empty")
    }
    if (version.length === 0) {
      throw new Error("composite plugin action host version must not be empty")
    }
    const key = pluginVersionKey(pluginId, version)
    if (byPluginVersion.has(key)) {
      throw new Error(`duplicate composite plugin action host: ${pluginId}@${version}`)
    }
    byPluginVersion.set(key, entry.host)
  }

  return {
    resolve(request) {
      return hostForResolve(byPluginVersion, request)?.resolve(request)
    },
    execute(request) {
      const host = byPluginVersion.get(
        pluginVersionKey(request.manifest.pluginId, request.manifest.version)
      )
      if (host === undefined) {
        throw new Error(
          `plugin action host not registered: ${request.manifest.pluginId}@${request.manifest.version}`
        )
      }
      return host.execute(request)
    }
  }
}

function hostForResolve(
  byPluginVersion: ReadonlyMap<string, PluginActionHost>,
  request: ResolvePluginActionRequest
): PluginActionHost | undefined {
  return byPluginVersion.get(pluginVersionKey(request.pluginId, request.version))
}

function pluginVersionKey(pluginId: string, version: string): string {
  return `${pluginId}\u0000${version}`
}

export type CompositePluginActionExecuteRequest = ExecutePluginActionRequest
