import type { AppExtensionCatalogSource } from "@wanex/extension"
import type { PreparedAgentContext } from "@wanex/runtime/context"
import { prepareWanexAppExtensionAgentContext } from "./app-extension-context.js"
import {
  extensionStatus,
  projectWanexAppExtensionReadModel
} from "./app-extension-read-model.js"
import type {
  WanexAppExtensionReadModel,
  WanexAppExtensionStatus
} from "./types-extension.js"

export interface WanexAppExtensionContributionManager {
  status(): WanexAppExtensionStatus
  readModel(): WanexAppExtensionReadModel
  prepareAgentContext(
    base?: PreparedAgentContext
  ): Promise<PreparedAgentContext | undefined>
}

export function createWanexAppExtensionContributionManager(
  source: AppExtensionCatalogSource | undefined
): WanexAppExtensionContributionManager {
  return {
    status() {
      return extensionStatus(source?.current())
    },
    readModel() {
      return projectWanexAppExtensionReadModel(source?.current())
    },
    async prepareAgentContext(base) {
      const generation = source?.current()
      return prepareWanexAppExtensionAgentContext({
        ...(base === undefined ? {} : { base }),
        ...(generation === undefined
          ? {}
          : { snapshot: generation.snapshot })
      })
    }
  }
}

export { prepareWanexAppExtensionAgentContext } from "./app-extension-context.js"
export { projectWanexAppExtensionReadModel } from "./app-extension-read-model.js"
