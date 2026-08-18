import type {
  PluginActionHost,
  PluginInstallRecord,
  PluginManifestRecord,
} from "@wanex/plugin"
import type { PluginExecutionHostFactory } from "./types.js"

/**
 * Keeps exact-version execution hosts alive for the lifetime of one Product.
 * Entries are append-only: an active install can be replaced in the catalog,
 * but an in-flight action must retain the host it already resolved.
 */
export class PluginExecutionHostRegistry {
  readonly #hosts = new Map<string, PluginActionHost>()
  readonly #actionHost: PluginActionHost = {
    resolve: (request) =>
      this.#hosts
        .get(pluginVersionKey(request.pluginId, request.version))
        ?.resolve(request),
    execute: (request) => {
      const host = this.#hosts.get(
        pluginVersionKey(request.manifest.pluginId, request.manifest.version),
      )
      if (host === undefined) {
        throw new Error(
          `plugin action host not registered: ${request.manifest.pluginId}@${request.manifest.version}`,
        )
      }
      return host.execute(request)
    },
  }

  constructor(private readonly factory: PluginExecutionHostFactory) {}

  get actionHost(): PluginActionHost {
    return this.#actionHost
  }

  get size(): number {
    return this.#hosts.size
  }

  async ensure(
    request: {
      readonly manifest: PluginManifestRecord
      readonly install: PluginInstallRecord
    },
  ): Promise<void> {
    const key = pluginVersionKey(
      request.manifest.pluginId,
      request.manifest.version,
    )
    if (this.#hosts.has(key)) {
      return
    }
    const host = await this.factory(request)
    if (
      typeof host.resolve !== "function" ||
      typeof host.execute !== "function"
    ) {
      throw new Error(
        `plugin action host factory returned an invalid host: ${request.manifest.pluginId}@${request.manifest.version}`,
      )
    }
    this.#hosts.set(key, host)
  }
}

function pluginVersionKey(pluginId: string, version: string): string {
  return `${pluginId}\u0000${version}`
}
