import type { AppExtensionResolvedSnapshot } from "@wanex/extension"
import type { PreparedAgentContext } from "@wanex/runtime/context"
import { prepareWanexAppShellExtensionAgentContext } from "./app-extension-context.js"
import {
  extensionStatus,
  projectWanexAppShellExtensionReadModel
} from "./app-extension-read-model.js"
import type {
  WanexAppShellExtensionReadModel,
  WanexAppShellExtensionStatus
} from "./types-extension.js"

export interface WanexAppShellExtensionContributionManager {
  snapshot(): AppExtensionResolvedSnapshot | undefined
  status(): WanexAppShellExtensionStatus
  readModel(): WanexAppShellExtensionReadModel
  prepareAgentContext(
    base?: PreparedAgentContext
  ): Promise<PreparedAgentContext | undefined>
}

export function createWanexAppShellExtensionContributionManager(
  snapshot: AppExtensionResolvedSnapshot | undefined
): WanexAppShellExtensionContributionManager {
  return {
    snapshot() {
      return snapshot
    },
    status() {
      return extensionStatus(snapshot)
    },
    readModel() {
      return projectWanexAppShellExtensionReadModel(snapshot)
    },
    async prepareAgentContext(base) {
      return prepareWanexAppShellExtensionAgentContext({
        ...(base === undefined ? {} : { base }),
        ...(snapshot === undefined ? {} : { snapshot })
      })
    }
  }
}

export { prepareWanexAppShellExtensionAgentContext } from "./app-extension-context.js"
export { projectWanexAppShellExtensionReadModel } from "./app-extension-read-model.js"
