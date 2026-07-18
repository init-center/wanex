import {
  createStorageHandle,
  type LocalSystemServiceStorageConfig,
  type StorageHandle
} from "./factory.js"
import { createChannelStore, type ChannelStore } from "./channel.js"
import { createConnectorStore, type ConnectorStore } from "./connector.js"
import { createDelegationStore, type DelegationStore } from "./delegation.js"
import { createObjectiveStore, type ObjectiveStore } from "./objective.js"
import { createPlanStore, type PlanStore } from "./plan.js"
import { createPluginStore, type PluginStore } from "./plugin.js"
import { createTeamStore, type TeamStore } from "./team.js"
import type { CoreStore } from "./types.js"
import { createWorkspaceStore, type WorkspaceStore } from "./workspace.js"

export type StorageTestStore = CoreStore &
  WorkspaceStore &
  PlanStore &
  ObjectiveStore &
  DelegationStore &
  TeamStore &
  PluginStore &
  ConnectorStore &
  ChannelStore & {
    readonly storeDir: string
    readonly serviceBin: string
    dispose(): Promise<void>
  }

export function createStorageTestStore(
  config: LocalSystemServiceStorageConfig
): StorageTestStore {
  const handle: StorageHandle = createStorageHandle(config)
  return Object.assign(
    {},
    handle.core,
    createWorkspaceStore(handle.transport),
    createPlanStore(handle.transport),
    createObjectiveStore(handle.transport),
    createDelegationStore(handle.transport),
    createTeamStore(handle.transport),
    createPluginStore(handle.transport),
    createConnectorStore(handle.transport),
    createChannelStore(handle.transport),
    {
    storeDir: config.storeDir,
    serviceBin: config.serviceBin,
    dispose: () => handle.dispose()
    }
  )
}
