import type { AppExtensionResolvedSnapshot } from "@wanex/extension"
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
  snapshot(): AppExtensionResolvedSnapshot | undefined
  status(): WanexAppExtensionStatus
  readModel(): WanexAppExtensionReadModel
  prepareAgentContext(
    base?: PreparedAgentContext
  ): Promise<PreparedAgentContext | undefined>
}

export function createWanexAppExtensionContributionManager(
  snapshot: AppExtensionResolvedSnapshot | undefined
): WanexAppExtensionContributionManager {
  return {
    snapshot() {
      return snapshot
    },
    status() {
      return extensionStatus(snapshot)
    },
    readModel() {
      return projectWanexAppExtensionReadModel(snapshot)
    },
    async prepareAgentContext(base) {
      return prepareWanexAppExtensionAgentContext({
        ...(base === undefined ? {} : { base }),
        ...(snapshot === undefined ? {} : { snapshot })
      })
    }
  }
}

export { prepareWanexAppExtensionAgentContext } from "./app-extension-context.js"
export { projectWanexAppExtensionReadModel } from "./app-extension-read-model.js"
