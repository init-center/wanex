import type { CoreStore, StorageTransport } from "@wanex/storage"
import {
  createObjectiveStore,
  type ObjectiveStore
} from "@wanex/storage/objective"
import { createPlanStore, type PlanStore } from "@wanex/storage/plan"
import { createPluginStore, type PluginStore } from "@wanex/storage/plugin"

export type AppStore = CoreStore & PlanStore & ObjectiveStore & PluginStore

export function createAppStore(
  core: CoreStore,
  transport: StorageTransport
): AppStore {
  return Object.assign(
    {},
    core,
    createPlanStore(transport),
    createObjectiveStore(transport),
    createPluginStore(transport)
  )
}
