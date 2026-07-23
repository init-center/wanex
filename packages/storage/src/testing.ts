import { createHash } from "node:crypto"
import {
  createStorageHandle,
  type LocalSystemServiceStorageConfig,
  type StorageHandle
} from "./factory.js"
import type {
  JsonValue,
  ProviderProfile,
  SessionTurnExecutionBinding
} from "@wanex/protocol"
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

export function createTestTurnExecutionBinding(
  profile: ProviderProfile = {
    id: "test-profile",
    kind: "fake",
    capabilities: { input: ["text"], output: ["text"] },
    providerId: "fake",
    modelId: "test-model"
  }
): SessionTurnExecutionBinding {
  const normalizedProfile = {
    id: profile.id,
    kind: profile.kind,
    providerId: profile.providerId,
    modelId: profile.modelId,
    capabilities: profile.capabilities,
    ...(profile.baseUrl === undefined ? {} : { baseUrl: profile.baseUrl }),
    ...(profile.secretRef === undefined ? {} : { secretRef: profile.secretRef }),
    ...(profile.anthropicVersion === undefined
      ? {}
      : { anthropicVersion: profile.anthropicVersion })
  }
  const provider = {
    profileId: profile.id,
    profileDigest: digestJson(normalizedProfile),
    adapterId: profile.kind,
    providerId: profile.providerId,
    modelId: profile.modelId,
    capabilities: profile.capabilities,
    ...(profile.baseUrl === undefined ? {} : { baseUrl: profile.baseUrl }),
    ...(profile.secretRef === undefined ? {} : { secretRef: profile.secretRef }),
    ...(profile.anthropicVersion === undefined
      ? {}
      : { anthropicVersion: profile.anthropicVersion })
  }
  const unsigned = {
    createdAt: 1,
    provider,
    resources: [],
    recovery: {
      providerMaxAttempts: 1,
      idempotentToolMaxAttempts: 1
    }
  }
  return { digest: digestJson(unsigned), ...unsigned }
}

function digestJson(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex")
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value))
}

function sortJson(value: unknown): JsonValue {
  if (Array.isArray(value)) return value.map(sortJson)
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortJson(item)])
    )
  }
  return value as JsonValue
}
