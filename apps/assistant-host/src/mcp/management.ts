import type { ConfigEntryRecord, CoreStore } from "@wanex/storage"
import {
  decodeLocalMcpServerEntry,
  encodeLocalMcpServerDefinition,
} from "./codec.js"
import { MAX_LOCAL_MCP_SERVERS } from "./definition-store.js"
import {
  isLocalMcpServerId,
  localMcpServerKey,
  LOCAL_MCP_SERVER_PREFIX,
} from "./identity.js"
import type {
  LocalMcpGenerationController,
  LocalMcpReloadResult,
} from "./generation-controller.js"
import type {
  LocalMcpFailureCategory,
  LocalMcpServerDefinition,
  LocalMcpServerState,
  LocalMcpServerStatus,
} from "./model.js"

export type LocalMcpCredentialState =
  | "not_required"
  | "configured"
  | "unavailable"

export type LocalMcpConfigurationState =
  | "valid"
  | "invalid"
  | "rejected"
  | "absent"

export type LocalMcpRuntimeState = LocalMcpServerState | "absent"

/** Safe product state. Raw transport configuration never crosses this type. */
export interface LocalMcpServerReadModel {
  readonly serverId?: string
  readonly label?: string
  readonly enabled?: boolean
  readonly transport?: "stdio" | "streamable_http"
  readonly configurationState: LocalMcpConfigurationState
  readonly configurationFailure?: LocalMcpFailureCategory
  readonly runtimeState: LocalMcpRuntimeState
  readonly toolCount: number
  readonly revision?: number
  readonly credentialState?: LocalMcpCredentialState
  readonly runtimeFailure?: LocalMcpFailureCategory
}

export interface LocalMcpServersReadModel {
  readonly kind: "assistant-host.mcp-servers"
  readonly servers: readonly LocalMcpServerReadModel[]
}

export type LocalMcpManagementReloadOutcome =
  | LocalMcpReloadResult["outcome"]
  | "failed"

export interface LocalMcpManagementResultBase {
  readonly reloadOutcome: LocalMcpManagementReloadOutcome
  readonly servers: LocalMcpServersReadModel
}

export type LocalMcpSaveServerResult =
  | (LocalMcpManagementResultBase & {
      readonly kind: "applied"
      readonly serverId: string
    })
  | (LocalMcpManagementResultBase & {
      readonly kind: "conflict"
      readonly serverId: string
      readonly expectedRevision: number | null
      readonly currentRevision: number | null
    })

export type LocalMcpSetEnabledResult =
  | (LocalMcpManagementResultBase & {
      readonly kind: "applied"
      readonly serverId: string
      readonly enabled: boolean
    })
  | (LocalMcpManagementResultBase & {
      readonly kind: "conflict"
      readonly serverId: string
      readonly expectedRevision: number
      readonly currentRevision: number | null
    })

export type LocalMcpRemoveServerResult =
  | (LocalMcpManagementResultBase & {
      readonly kind: "applied"
      readonly serverId: string
    })
  | (LocalMcpManagementResultBase & {
      readonly kind: "conflict"
      readonly serverId: string
      readonly expectedRevision: number
      readonly currentRevision: number | null
    })

export interface LocalMcpManagementPort {
  readServers(): Promise<LocalMcpServersReadModel>
  saveServer(request: {
    readonly definition: LocalMcpServerDefinition
    readonly expectedRevision: number | null
  }): Promise<LocalMcpSaveServerResult>
  setServerEnabled(request: {
    readonly serverId: string
    readonly enabled: boolean
    readonly expectedRevision: number
  }): Promise<LocalMcpSetEnabledResult>
  removeServer(request: {
    readonly serverId: string
    readonly expectedRevision: number
  }): Promise<LocalMcpRemoveServerResult>
  reloadServers(options?: {
    readonly force?: boolean
  }): Promise<LocalMcpManagementResultBase>
}

export function createLocalMcpManagement(options: {
  readonly storage: Pick<
    CoreStore,
    | "compareAndApplyConfigMutations"
    | "getConfigEntry"
    | "listConfigEntries"
  >
  readonly controller: LocalMcpGenerationController
}): LocalMcpManagementPort {
  const rejectedByServer = new Map<string, {
    readonly revision: number
    readonly status: LocalMcpServerStatus
  }>()

  async function readServers(
    rejectedStatuses: readonly LocalMcpServerStatus[] = []
  ): Promise<LocalMcpServersReadModel> {
    const entries = await options.storage.listConfigEntries({
      prefix: LOCAL_MCP_SERVER_PREFIX,
      limit: MAX_LOCAL_MCP_SERVERS + 1,
    })
    const configured: StoredServer[] = []
    for (const entry of entries) {
      try {
        const definition = decodeLocalMcpServerEntry(entry)
        configured.push({ definition, entry })
      } catch {
        const serverId = invalidServerId(entry)
        configured.push(
          serverId === undefined
            ? { entry, configurationFailure: "invalid_definition" }
            : { entry, serverId, configurationFailure: "invalid_definition" }
        )
      }
    }
    const liveStatuses = options.controller.status()
    const cachedRejectedStatuses = configured.flatMap((stored) => {
      const serverId = stored.definition?.serverId ?? stored.serverId
      const cached = serverId === undefined
        ? undefined
        : rejectedByServer.get(serverId)
      return cached === undefined || cached.revision !== stored.entry.revision
        ? []
        : [cached.status]
    })
    const effectiveRejectedStatuses = [...cachedRejectedStatuses, ...rejectedStatuses]
    const liveByServerId = new Map(
      liveStatuses.flatMap((status) =>
        status.serverId === undefined ? [] : [[status.serverId, status] as const]
      )
    )
    const rejectedByServerId = new Map(
      effectiveRejectedStatuses.flatMap((status) =>
        status.serverId === undefined ? [] : [[status.serverId, status] as const]
      )
    )
    const servers = configured.map((stored) => {
      const serverId = stored.definition?.serverId ?? stored.serverId
      const live = serverId === undefined ? undefined : liveByServerId.get(serverId)
      const rejected = serverId === undefined
        ? undefined
        : rejectedByServerId.get(serverId)
      return projectServer(live, stored, rejected)
    })
    for (const status of liveStatuses) {
      if (status.serverId === undefined) {
        servers.push(projectServer(status, undefined, undefined))
        continue
      }
      if (configured.some((stored) =>
        (stored.definition?.serverId ?? stored.serverId) === status.serverId
      )) continue
      servers.push(projectServer(status, undefined, undefined))
    }
    for (const status of effectiveRejectedStatuses) {
      if (
        status.serverId !== undefined &&
        !configured.some((stored) =>
          (stored.definition?.serverId ?? stored.serverId) === status.serverId
        )
      ) {
        servers.push(projectServer(undefined, undefined, status))
      }
    }
    return {
      kind: "assistant-host.mcp-servers",
      servers: Object.freeze(servers.map((server) => Object.freeze(server))),
    }
  }

  async function reloadAndRead(
    force: boolean | undefined
  ): Promise<LocalMcpManagementResultBase> {
    let reloadOutcome: LocalMcpManagementReloadOutcome
    let rejectedStatuses: readonly LocalMcpServerStatus[] = []
    try {
      const result = await options.controller.reload(
        force === undefined ? {} : { force }
      )
      reloadOutcome = result.outcome
      if (result.outcome === "rejected") {
        const entries = await options.storage.listConfigEntries({
          prefix: LOCAL_MCP_SERVER_PREFIX,
          limit: MAX_LOCAL_MCP_SERVERS + 1,
        })
        const revisions = new Map(
          entries.map((entry) => [entry.key, entry.revision])
        )
        rejectedStatuses = result.status
        for (const status of result.status) {
          if (status.serverId === undefined) continue
          const key = safeLocalMcpServerKey(status.serverId)
          const revision = key === undefined ? undefined : revisions.get(key)
          if (revision !== undefined) {
            rejectedByServer.set(status.serverId, { revision, status })
          }
        }
      } else {
        rejectedByServer.clear()
      }
    } catch {
      reloadOutcome = "failed"
    }
    return {
      reloadOutcome,
      servers: await readServers(rejectedStatuses),
    }
  }

  async function unchanged(): Promise<LocalMcpManagementResultBase> {
    return {
      reloadOutcome: "unchanged",
      servers: await readServers(),
    }
  }

  return {
    readServers,
    async saveServer(request) {
      const definition = validateDefinition(request.definition)
      const serverId = definition.serverId
      const key = localMcpServerKey(serverId)
      const expectedRevision = validateExpectedRevision(
        request.expectedRevision,
        "saveServer expectedRevision"
      )
      const applied = await options.storage.compareAndApplyConfigMutations({
        conditions: [{ key, expectedRevision }],
        puts: [{ key, value: encodeLocalMcpServerDefinition(definition) }],
        deletes: [],
      })
      if (applied.kind === "conflict") {
        const conflict = applied.conflicts.find((item) => item.key === key)
        return {
          kind: "conflict",
          serverId,
          expectedRevision,
          currentRevision: conflict?.current?.revision ?? null,
          ...(await unchanged()),
        }
      }
      return {
        kind: "applied",
        serverId,
        ...(await reloadAndRead(undefined)),
      }
    },
    async setServerEnabled(request) {
      const serverId = validateServerId(request.serverId)
      const expectedRevision = validateExpectedRevision(
        request.expectedRevision,
        "setServerEnabled expectedRevision"
      )
      if (expectedRevision === null) {
        throw new Error("setServerEnabled expectedRevision must be a revision")
      }
      const key = localMcpServerKey(serverId)
      const current = await options.storage.getConfigEntry(key)
      if (current === null) {
        throw new Error(`MCP server is not configured: ${serverId}`)
      }
      const definition = decodeLocalMcpServerEntry(current)
      if (current.revision !== expectedRevision) {
        return {
          kind: "conflict",
          serverId,
          expectedRevision,
          currentRevision: current.revision,
          ...(await unchanged()),
        }
      }
      if (definition.enabled === request.enabled) {
        return {
          kind: "applied",
          serverId,
          enabled: request.enabled,
          ...(await unchanged()),
        }
      }
      const updated = {
        ...definition,
        enabled: request.enabled,
      } satisfies LocalMcpServerDefinition
      const applied = await options.storage.compareAndApplyConfigMutations({
        conditions: [{ key, expectedRevision }],
        puts: [{ key, value: encodeLocalMcpServerDefinition(updated) }],
        deletes: [],
      })
      if (applied.kind === "conflict") {
        const conflict = applied.conflicts.find((item) => item.key === key)
        return {
          kind: "conflict",
          serverId,
          expectedRevision,
          currentRevision: conflict?.current?.revision ?? null,
          ...(await unchanged()),
        }
      }
      return {
        kind: "applied",
        serverId,
        enabled: request.enabled,
        ...(await reloadAndRead(undefined)),
      }
    },
    async removeServer(request) {
      const serverId = validateServerId(request.serverId)
      const expectedRevision = validateExpectedRevision(
        request.expectedRevision,
        "removeServer expectedRevision"
      )
      if (expectedRevision === null) {
        throw new Error("removeServer expectedRevision must be a revision")
      }
      const key = localMcpServerKey(serverId)
      const applied = await options.storage.compareAndApplyConfigMutations({
        conditions: [{ key, expectedRevision }],
        puts: [],
        deletes: [key],
      })
      if (applied.kind === "conflict") {
        const conflict = applied.conflicts.find((item) => item.key === key)
        return {
          kind: "conflict",
          serverId,
          expectedRevision,
          currentRevision: conflict?.current?.revision ?? null,
          ...(await unchanged()),
        }
      }
      return {
        kind: "applied",
        serverId,
        ...(await reloadAndRead(undefined)),
      }
    },
    async reloadServers(request = {}) {
      return await reloadAndRead(request.force)
    },
  }
}

function projectServer(
  live: LocalMcpServerStatus | undefined,
  configured: StoredServer | undefined,
  rejected: LocalMcpServerStatus | undefined,
): LocalMcpServerReadModel {
  const definition = configured?.definition
  const configurationFailure = configured?.configurationFailure ?? rejected?.failure
  const configurationState = configured === undefined
    ? "absent"
    : configured.configurationFailure !== undefined
      ? "invalid"
      : rejected === undefined ? "valid" : "rejected"
  return {
    ...(definition?.serverId === undefined
      ? configured?.serverId === undefined
        ? live?.serverId === undefined
          ? rejected?.serverId === undefined ? {} : { serverId: rejected.serverId }
          : { serverId: live.serverId }
        : { serverId: configured.serverId }
      : { serverId: definition.serverId }),
    ...(definition?.label === undefined
      ? live?.label === undefined
        ? rejected?.label === undefined ? {} : { label: rejected.label }
        : { label: live.label }
      : { label: definition.label }),
    ...(configured === undefined
      ? {}
      : {
          revision: configured.entry.revision,
          ...(definition === undefined
            ? {}
            : {
                enabled: definition.enabled,
                transport: definition.transport.kind,
                credentialState: credentialState(definition, rejected ?? live),
              }),
        }),
    configurationState,
    ...(configurationFailure === undefined ? {} : { configurationFailure }),
    runtimeState: live?.state ?? "absent",
    toolCount: live?.toolCount ?? 0,
    ...(live?.failure === undefined ? {} : { runtimeFailure: live.failure }),
  }
}

interface StoredServer {
  readonly entry: ConfigEntryRecord
  readonly definition?: LocalMcpServerDefinition
  readonly serverId?: string
  readonly configurationFailure?: LocalMcpFailureCategory
}

function invalidServerId(entry: ConfigEntryRecord): string | undefined {
  const suffix = entry.key.startsWith(LOCAL_MCP_SERVER_PREFIX)
    ? entry.key.slice(LOCAL_MCP_SERVER_PREFIX.length)
    : ""
  return suffix.length === 0 ? undefined : suffix
}

function safeLocalMcpServerKey(serverId: string): string | undefined {
  return isLocalMcpServerId(serverId) ? localMcpServerKey(serverId) : undefined
}

function credentialState(
  definition: LocalMcpServerDefinition,
  status: LocalMcpServerStatus | undefined
): LocalMcpCredentialState {
  const values = definition.transport.kind === "stdio"
    ? definition.transport.environment
    : definition.transport.headers
  const hasCredential = values.some((value) => value.source.kind === "credential")
  if (!hasCredential) return "not_required"
  return status?.failure === "credential_unavailable"
    ? "unavailable"
    : "configured"
}

function validateDefinition(
  definition: LocalMcpServerDefinition
): LocalMcpServerDefinition {
  const serverId = validateServerId(definition.serverId)
  const key = localMcpServerKey(serverId)
  const value = encodeLocalMcpServerDefinition({ ...definition, serverId })
  return decodeLocalMcpServerEntry({
    key,
    value,
    revision: 1,
    updatedAt: 0,
  })
}

function validateServerId(value: string): string {
  if (typeof value !== "string" || !isLocalMcpServerId(value)) {
    throw new Error("MCP server ID is invalid")
  }
  return value
}

function validateExpectedRevision(
  value: number | null,
  label: string
): number | null {
  if (value !== null && (!Number.isSafeInteger(value) || value <= 0)) {
    throw new Error(`${label} must be null or a positive safe integer`)
  }
  return value
}
