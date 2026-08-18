import type { StorageHandle } from "@wanex/storage"
import { createPluginCommandHost } from "./host.js"
import type {
  CreatePluginCommandHostOptions,
  PluginCommandProductBinding,
} from "./types.js"

export interface PluginCommandCompositionPort {
  prepare(
    request: PluginCommandCompositionPrepareRequest,
  ): Promise<PluginCommandCompositionBinding>
}

export interface PluginCommandCompositionPrepareRequest {
  readonly handle: Pick<StorageHandle, "core" | "transport">
}

export interface PluginCommandCompositionBinding {
  readonly productBinding: PluginCommandProductBinding
  start(): void | Promise<void>
  stop(): void | Promise<void>
  dispose(): void | Promise<void>
}

export function createPluginCommandComposition(
  options: Omit<CreatePluginCommandHostOptions, "handle">,
): PluginCommandCompositionPort {
  return {
    async prepare({ handle }) {
      const host = await createPluginCommandHost({ ...options, handle })
      return {
        productBinding: host.productBinding,
        start() {
          host.start()
        },
        async stop() {
          await host.stop()
        },
        async dispose() {
          await host.dispose()
        },
      }
    },
  }
}
