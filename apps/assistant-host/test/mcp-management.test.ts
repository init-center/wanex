import { describe, expect, it } from "vitest"
import type { JsonValue } from "@wanex/protocol"
import type { ConfigEntryRecord, CoreStore } from "@wanex/storage"
import {
  createLocalMcpManagement,
  encodeLocalMcpServerDefinition,
  localMcpServerKey,
  LOCAL_MCP_SERVER_PREFIX,
  type LocalMcpGenerationController,
  type LocalMcpReloadResult,
  type LocalMcpServerDefinition,
  type LocalMcpServerStatus,
} from "../src/mcp/index.js"

describe("Assistant Host MCP management", () => {
  it("creates and updates a server through one revisioned trusted port", async () => {
    const storage = memoryStorage()
    const controller = fakeController()
    const management = createLocalMcpManagement({ storage, controller })
    const definition = serverDefinition("local-tools")
    controller.nextReload = {
      outcome: "published",
      status: [readyStatus("local-tools", "Local tools")],
    }

    const created = await management.saveServer({
      definition,
      expectedRevision: null,
    })
    expect(created).toMatchObject({
      kind: "applied",
      serverId: "local-tools",
      reloadOutcome: "published",
    })
    expect(created.servers.servers).toEqual([{
      serverId: "local-tools",
      label: "Local tools",
      enabled: true,
      transport: "streamable_http",
      configurationState: "valid",
      runtimeState: "ready",
      toolCount: 2,
      revision: 1,
      credentialState: "configured",
    }])

    controller.nextReload = {
      outcome: "published",
      status: [readyStatus("local-tools", "Updated tools")],
    }
    const updated = await management.saveServer({
      definition: { ...definition, label: "Updated tools" },
      expectedRevision: 1,
    })
    expect(updated).toMatchObject({
      kind: "applied",
      serverId: "local-tools",
      reloadOutcome: "published",
      servers: {
        servers: [{
          label: "Updated tools",
          revision: 2,
          configurationState: "valid",
          runtimeState: "ready",
        }],
      },
    })
  })

  it("rejects stale enable, update, and remove mutations", async () => {
    const storage = memoryStorage(serverDefinition("revisioned"))
    const controller = fakeController([readyStatus("revisioned", "Revisioned tools")])
    const management = createLocalMcpManagement({ storage, controller })

    const enabled = await management.setServerEnabled({
      serverId: "revisioned",
      enabled: true,
      expectedRevision: 2,
    })
    expect(enabled).toMatchObject({
      kind: "conflict",
      expectedRevision: 2,
      currentRevision: 1,
    })

    const staleDefinition = {
      ...serverDefinition("revisioned"),
      label: "stale update",
    }
    const updatedByAnotherCaller = await management.saveServer({
      definition: { ...staleDefinition, label: "first update" },
      expectedRevision: 1,
    })
    expect(updatedByAnotherCaller.kind).toBe("applied")

    const updateConflict = await management.saveServer({
      definition: staleDefinition,
      expectedRevision: 1,
    })
    expect(updateConflict).toMatchObject({
      kind: "conflict",
      expectedRevision: 1,
      currentRevision: 2,
    })

    const removeConflict = await management.removeServer({
      serverId: "revisioned",
      expectedRevision: 1,
    })
    expect(removeConflict).toMatchObject({
      kind: "conflict",
      expectedRevision: 1,
      currentRevision: 2,
    })
  })

  it("checks the revision before returning unchanged for enable or disable", async () => {
    const storage = memoryStorage(serverDefinition("same-state"))
    const controller = fakeController([readyStatus("same-state", "Revisioned tools")])
    const management = createLocalMcpManagement({ storage, controller })

    const result = await management.setServerEnabled({
      serverId: "same-state",
      enabled: true,
      expectedRevision: 2,
    })

    expect(result).toMatchObject({
      kind: "conflict",
      expectedRevision: 2,
      currentRevision: 1,
    })
    expect(controller.reloadCount).toBe(0)
  })

  it("enables, disables, removes, and explicitly reloads through the same port", async () => {
    const storage = memoryStorage(serverDefinition("lifecycle"))
    const controller = fakeController([readyStatus("lifecycle", "Revisioned tools")])
    const management = createLocalMcpManagement({ storage, controller })

    controller.nextReload = {
      outcome: "published",
      status: [{
        serverId: "lifecycle",
        label: "Revisioned tools",
        state: "stopped",
        transport: "streamable_http",
        toolCount: 0,
      }],
    }
    await expect(management.setServerEnabled({
      serverId: "lifecycle",
      enabled: false,
      expectedRevision: 1,
    })).resolves.toMatchObject({
      kind: "applied",
      enabled: false,
      reloadOutcome: "published",
      servers: {
        servers: [{
          enabled: false,
          revision: 2,
          runtimeState: "stopped",
          toolCount: 0,
        }],
      },
    })

    controller.nextReload = {
      outcome: "published",
      status: [readyStatus("lifecycle", "Revisioned tools")],
    }
    await expect(management.setServerEnabled({
      serverId: "lifecycle",
      enabled: true,
      expectedRevision: 2,
    })).resolves.toMatchObject({
      kind: "applied",
      enabled: true,
      reloadOutcome: "published",
      servers: {
        servers: [{
          enabled: true,
          revision: 3,
          runtimeState: "ready",
        }],
      },
    })

    controller.nextReload = { outcome: "published", status: [] }
    await expect(management.removeServer({
      serverId: "lifecycle",
      expectedRevision: 3,
    })).resolves.toMatchObject({
      kind: "applied",
      reloadOutcome: "published",
      servers: { servers: [] },
    })

    controller.nextReload = { outcome: "unchanged", status: [] }
    await expect(management.reloadServers()).resolves.toMatchObject({
      reloadOutcome: "unchanged",
      servers: { servers: [] },
    })
    await expect(management.setServerEnabled({
      serverId: "missing",
      enabled: true,
      expectedRevision: 1,
    })).rejects.toThrow("not configured")
  })

  it("keeps the old runtime generation visible when a saved candidate is rejected", async () => {
    const definition = serverDefinition("rejected")
    const storage = memoryStorage(definition)
    const controller = fakeController([readyStatus("rejected", "Revisioned tools")])
    const management = createLocalMcpManagement({ storage, controller })

    controller.nextReload = {
      outcome: "rejected",
      status: [{
        serverId: "rejected",
        label: "Rejected candidate",
        state: "failed",
        transport: "streamable_http",
        toolCount: 0,
        failure: "connect_failed",
      }],
    }
    const result = await management.saveServer({
      definition: { ...definition, label: "Rejected candidate" },
      expectedRevision: 1,
    })

    expect(result).toMatchObject({
      kind: "applied",
      reloadOutcome: "rejected",
      servers: {
        servers: [{
          label: "Rejected candidate",
          revision: 2,
          configurationState: "rejected",
          configurationFailure: "connect_failed",
          runtimeState: "ready",
          toolCount: 2,
        }],
      },
    })
    await expect(management.readServers()).resolves.toMatchObject({
      servers: [{
        revision: 2,
        configurationState: "rejected",
        runtimeState: "ready",
      }],
    })

    controller.nextReload = {
      outcome: "published",
      status: [readyStatus("rejected", "Rejected candidate")],
    }
    const reloaded = await management.reloadServers()
    expect(reloaded).toMatchObject({
      reloadOutcome: "published",
      servers: {
        servers: [{
          configurationState: "valid",
          runtimeState: "ready",
          revision: 2,
        }],
      },
    })
  })

  it("projects invalid stored definitions without leaking raw configuration", async () => {
    const key = `${LOCAL_MCP_SERVER_PREFIX}Invalid_ID`
    const storage = memoryStorage(memoryStorageEntry({
      key,
      value: { invalid: true },
      revision: 4,
      updatedAt: 10,
    }))
    const controller = fakeController()
    controller.statuses = [{
      serverId: "Invalid_ID",
      state: "failed",
      toolCount: 0,
      failure: "invalid_definition",
    }]
    const management = createLocalMcpManagement({ storage, controller })

    const result = await management.readServers()
    expect(result).toEqual({
      kind: "assistant-host.mcp-servers",
      servers: [{
        serverId: "Invalid_ID",
        configurationState: "invalid",
        configurationFailure: "invalid_definition",
        revision: 4,
        runtimeState: "failed",
        runtimeFailure: "invalid_definition",
        toolCount: 0,
      }],
    })
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain("command")
    expect(serialized).not.toContain("cwd")
    expect(serialized).not.toContain("Authorization")
    expect(serialized).not.toContain("secret")
  })
})

function serverDefinition(serverId: string): LocalMcpServerDefinition {
  return {
    kind: "assistant-host.mcp-server",
    serverId,
    label: serverId === "local-tools" ? "Local tools" : "Revisioned tools",
    enabled: true,
    capabilityRevision: "management-v1",
    connectTimeoutMs: 1_000,
    requestTimeoutMs: 1_000,
    transport: {
      kind: "streamable_http",
      url: "https://example.test/mcp",
      headers: [{
        name: "Authorization",
        source: { kind: "credential", ref: "credential://mcp/token" },
      }],
    },
  }
}

function readyStatus(serverId: string, label: string): LocalMcpServerStatus {
  return {
    serverId,
    label,
    state: "ready",
    transport: "streamable_http",
    toolCount: 2,
  }
}

function memoryStorage(
  definitionOrEntry?: LocalMcpServerDefinition | ConfigEntryRecord
): Pick<
  CoreStore,
  "compareAndApplyConfigMutations" | "getConfigEntry" | "listConfigEntries"
> {
  const entry = definitionOrEntry === undefined
    ? undefined
    : "key" in definitionOrEntry
      ? definitionOrEntry
      : memoryStorageEntry({
          key: localMcpServerKey(definitionOrEntry.serverId),
          value: encodeLocalMcpServerDefinition(definitionOrEntry),
          revision: 1,
          updatedAt: 1,
        })
  const entries = new Map<string, ConfigEntryRecord>(
    entry === undefined ? [] : [[entry.key, entry]]
  )
  return {
    async getConfigEntry(key) {
      return entries.get(key) ?? null
    },
    async listConfigEntries(request) {
      return [...entries.values()]
        .filter((item) => item.key.startsWith(request.prefix))
        .sort((left, right) => left.key.localeCompare(right.key))
        .filter((item) =>
          request.afterKey === undefined || item.key > request.afterKey
        )
        .slice(0, request.limit)
    },
    async compareAndApplyConfigMutations(request) {
      const conflicts = request.conditions.flatMap((condition) => {
        const current = entries.get(condition.key) ?? null
        return current?.revision === condition.expectedRevision ||
          current === null && condition.expectedRevision === null
          ? []
          : [{
              key: condition.key,
              expectedRevision: condition.expectedRevision,
              current,
            }]
      })
      if (conflicts.length > 0) return { kind: "conflict", conflicts }
      const applied: ConfigEntryRecord[] = []
      for (const put of request.puts) {
        const current = entries.get(put.key)
        const next = {
          key: put.key,
          value: put.value,
          revision: (current?.revision ?? 0) + 1,
          updatedAt: (current?.updatedAt ?? 0) + 1,
        }
        entries.set(put.key, next)
        applied.push(next)
      }
      for (const key of request.deletes) entries.delete(key)
      return { kind: "applied", entries: applied }
    },
  }
}

function memoryStorageEntry(entry: ConfigEntryRecord): ConfigEntryRecord {
  return entry
}

function fakeController(
  initialStatuses: readonly LocalMcpServerStatus[] = []
): LocalMcpGenerationController & {
  nextReload: LocalMcpReloadResult
  statuses: LocalMcpServerStatus[]
  reloadCount: number
} {
  const controller = {
    nextReload: {
      outcome: "published" as const,
      status: [],
    },
    statuses: [...initialStatuses],
    reloadCount: 0,
    resolve: () => undefined,
    observeTurnLifecycle() {},
    async reload() {
      controller.reloadCount += 1
      if (controller.nextReload.outcome === "published") {
        controller.statuses = [...controller.nextReload.status]
      }
      return controller.nextReload
    },
    status() {
      return controller.statuses
    },
    async dispose() {},
  }
  return controller
}
