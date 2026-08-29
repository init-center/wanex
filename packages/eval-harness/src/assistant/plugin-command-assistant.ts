import type { AssistantPluginHost } from "@wanex/assistant-plugin-host"
import { createShell, createSurfaceAdapter } from "@wanex/assistant"
import {
  createInProcessSurfaceClientTransport,
  createSurfaceClient,
  type SurfaceClient
} from "@wanex/assistant/surface"
import type { ModelEndpoint } from "@wanex/protocol"
import type { StorageHandle } from "@wanex/storage"

export interface EvalPluginCommandAssistant {
  readonly client: SurfaceClient
  dispose(): Promise<void>
}

export async function createEvalPluginCommandAssistant(options: {
  readonly handle: Pick<StorageHandle, "core" | "transport">
  readonly host: AssistantPluginHost
  readonly modelEndpoint: ModelEndpoint
}): Promise<EvalPluginCommandAssistant> {
  const shell = await createShell({
    storage: { kind: "injected", handle: options.handle },
    ...options.host.assistantBinding,
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
