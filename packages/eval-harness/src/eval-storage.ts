import type { CoreStore, StorageTransport } from "@wanex/storage"
import { createChannelStore, type ChannelStore } from "@wanex/storage/channel"
import {
  createConnectorStore,
  type ConnectorStore
} from "@wanex/storage/connector"
import {
  createDelegationStore,
  type DelegationStore
} from "@wanex/storage/delegation"
import {
  createObjectiveStore,
  type ObjectiveStore
} from "@wanex/storage/objective"
import { createPlanStore, type PlanStore } from "@wanex/storage/plan"
import { createPluginStore, type PluginStore } from "@wanex/storage/plugin"
import { createTeamStore, type TeamStore } from "@wanex/storage/team"
import {
  createWorkspaceStore,
  type WorkspaceStore
} from "@wanex/storage/workspace"

export type EvalStore = CoreStore &
  WorkspaceStore &
  PlanStore &
  ObjectiveStore &
  DelegationStore &
  TeamStore &
  PluginStore &
  ConnectorStore &
  ChannelStore

export function createEvalStore(
  core: CoreStore,
  transport: StorageTransport
): EvalStore {
  return Object.assign(
    {},
    core,
    createWorkspaceStore(transport),
    createPlanStore(transport),
    createObjectiveStore(transport),
    createDelegationStore(transport),
    createTeamStore(transport),
    createPluginStore(transport),
    createConnectorStore(transport),
    createChannelStore(transport)
  )
}
