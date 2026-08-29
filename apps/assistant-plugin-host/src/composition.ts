import type { StorageHandle } from "@wanex/storage"
import type { ExecutionEnvironment } from "@wanex/runtime/execution"
import { createAssistantPluginHost } from "./host.js"
import type {
  CreateAssistantPluginHostOptions,
  AssistantPluginBinding,
} from "./types.js"

export interface AssistantPluginCompositionPort {
  prepare(
    request: AssistantPluginCompositionPrepareRequest,
  ): Promise<AssistantPluginCompositionBinding>
}

export interface AssistantPluginCompositionPrepareRequest {
  readonly handle: Pick<StorageHandle, "core" | "transport">
  readonly executionEnvironment: ExecutionEnvironment
}

export interface AssistantPluginCompositionBinding {
  readonly assistantBinding: AssistantPluginBinding
  start(): void | Promise<void>
  stop(): void | Promise<void>
  dispose(): void | Promise<void>
}

export function createAssistantPluginComposition(
  options: Omit<
    CreateAssistantPluginHostOptions,
    "handle" | "executionEnvironment"
  >,
): AssistantPluginCompositionPort {
  return {
    async prepare({ handle, executionEnvironment }) {
      const host = await createAssistantPluginHost({
        ...options,
        handle,
        executionEnvironment
      })
      return {
        assistantBinding: host.assistantBinding,
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
