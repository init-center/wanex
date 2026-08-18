import type { PluginCommandHost } from "@wanex/plugin-command-host"
import { createShell, createSurfaceAdapter } from "@wanex/product"
import {
  createInProcessSurfaceClientTransport,
  createSurfaceClient,
  type SurfaceClient
} from "@wanex/product/surface"
import type { ModelEndpoint } from "@wanex/protocol"
import type { StorageHandle } from "@wanex/storage"

export interface EvalPluginCommandProduct {
  readonly client: SurfaceClient
  dispose(): Promise<void>
}

export async function createEvalPluginCommandProduct(options: {
  readonly handle: Pick<StorageHandle, "core" | "transport">
  readonly host: PluginCommandHost
  readonly modelEndpoint: ModelEndpoint
}): Promise<EvalPluginCommandProduct> {
  const shell = await createShell({
    storage: { kind: "injected", handle: options.handle },
    ...options.host.productBinding,
    modelEndpoint: options.modelEndpoint
  })
  const surface = createSurfaceAdapter(shell)
  let disposePromise: Promise<void> | undefined
  return {
    client: createSurfaceClient(
      createInProcessSurfaceClientTransport(surface)
    ),
    dispose() {
      disposePromise ??= (async () => {
        await surface.dispose()
        await shell.dispose()
      })()
      return disposePromise
    }
  }
}
