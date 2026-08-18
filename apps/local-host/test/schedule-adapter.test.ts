import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import type {
  ScheduleDefinition,
  ScheduleDefinitionSpec,
} from "@wanex/product/schedule"
import {
  createStorageTestStore,
  type StorageTestStore,
} from "@wanex/storage/testing"
import { startLocalProductHost, type LocalProductHost } from "../src/application/index.js"
import { createLocalScheduleAdapter } from "../src/schedule/adapter.js"
import {
  deriveLocalScheduleIdentity,
  LOCAL_SCHEDULE_DEFINITION_PREFIX,
  LOCAL_SCHEDULE_OCCURRENCE_PREFIX,
} from "../src/schedule/identity.js"
import type { LocalScheduleAdapter } from "../src/schedule/model.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`,
)
const tempDirs: string[] = []
const stores: StorageTestStore[] = []
const adapters: LocalScheduleAdapter[] = []
const hosts: LocalProductHost[] = []

afterEach(async () => {
  while (hosts.length > 0) await hosts.pop()?.close()
  while (adapters.length > 0) adapters.pop()?.dispose()
  while (stores.length > 0) await stores.pop()?.dispose()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir !== undefined) await rm(dir, { recursive: true, force: true })
  }
})

describe("Local Schedule adapter", () => {
  it("persists strict definitions with idempotent create and exact revision CAS", async () => {
    let clock = 1_000
    const { storage, adapter } = await createHarness(() => clock++)
    const events: unknown[] = []
    adapter.port.subscribeInvalidations(() => {
      throw new Error("isolated invalidation listener")
    })
    adapter.port.subscribeInvalidations((event) => events.push(event))
    const definition = scheduleSpec("Daily brief")

    const created = await adapter.port.createDefinition({
      definition,
      idempotencyKey: "schedule-daily",
    })
    expect(created).toMatchObject({
      kind: "product.schedule.applied",
      operation: "create",
      definition: {
        scheduleId: expect.stringMatching(/^schedule_[a-f0-9]{32}$/u),
        prompt: "Daily brief",
        revision: 1,
      },
    })
    const first = requireDefinition(created)
    expect(events).toEqual([{ at: expect.any(Number), revision: 1 }])

    const replayed = await adapter.port.createDefinition({
      definition,
      idempotencyKey: "schedule-daily",
    })
    expect(replayed).toEqual(created)
    expect(events).toHaveLength(1)
    await expect(
      adapter.port.createDefinition({
        definition: scheduleSpec("Different request"),
        idempotencyKey: "schedule-daily",
      }),
    ).resolves.toMatchObject({
      kind: "product.schedule.conflict",
      operation: "create",
      reason: "idempotency_conflict",
      current: { scheduleId: first.scheduleId, revision: 1 },
    })

    await expect(adapter.port.readDefinition(first.scheduleId)).resolves.toEqual(first)
    await expect(adapter.port.readDefinition("not-a-local-id")).resolves.toBeNull()

    const replaced = await adapter.port.replaceDefinition({
      scheduleId: first.scheduleId,
      expectedRevision: 1,
      definition: {
        ...definition,
        prompt: "Updated daily brief",
        modelPolicy: { kind: "pinned", endpointId: "endpoint_daily" },
      },
    })
    expect(replaced).toMatchObject({
      kind: "product.schedule.applied",
      operation: "replace",
      definition: { prompt: "Updated daily brief", revision: 2 },
    })
    await expect(
      adapter.port.replaceDefinition({
        scheduleId: first.scheduleId,
        expectedRevision: 1,
        definition,
      }),
    ).resolves.toMatchObject({
      kind: "product.schedule.conflict",
      reason: "revision_conflict",
      expectedRevision: 1,
      current: { revision: 2 },
    })

    const disabled = await adapter.port.setEnabled({
      scheduleId: first.scheduleId,
      expectedRevision: 2,
      enabled: false,
    })
    expect(disabled).toMatchObject({
      kind: "product.schedule.applied",
      definition: { enabled: false, revision: 3 },
    })
    const removed = await adapter.port.removeDefinition({
      scheduleId: first.scheduleId,
      expectedRevision: 3,
    })
    expect(removed).toEqual({
      kind: "product.schedule.applied",
      operation: "remove",
      scheduleId: first.scheduleId,
      revision: 4,
    })
    await expect(adapter.port.readDefinition(first.scheduleId)).resolves.toBeNull()
    expect(events).toHaveLength(4)

    const raw = await storage.listConfigEntries({
      prefix: LOCAL_SCHEDULE_DEFINITION_PREFIX,
    })
    expect(raw).toEqual([])
  })

  it("pages opaque cursors and rejects malformed durable records", async () => {
    const { storage, adapter } = await createHarness()
    for (const idempotencyKey of ["alpha", "beta", "gamma"]) {
      await adapter.port.createDefinition({
        definition: scheduleSpec(`Prompt ${idempotencyKey}`),
        idempotencyKey,
      })
    }

    const first = await adapter.port.listDefinitions({ limit: 2 })
    expect(first.definitions).toHaveLength(2)
    expect(first.nextCursor).toEqual(expect.any(String))
    expect(first.nextCursor).not.toContain("schedule_")
    if (first.nextCursor === undefined) {
      throw new Error("expected a second Schedule page")
    }
    const second = await adapter.port.listDefinitions({
      cursor: first.nextCursor,
      limit: 2,
    })
    expect(second.definitions).toHaveLength(1)
    expect(second.nextCursor).toBeUndefined()
    const ids = [...first.definitions, ...second.definitions].map(
      (definition) => definition.scheduleId
    )
    expect(new Set(ids).size).toBe(3)
    expect(JSON.stringify([...first.definitions, ...second.definitions]))
      .not.toContain("idempotencyDigest")
    await expect(
      adapter.port.listDefinitions({ cursor: "not+canonical", limit: 2 }),
    ).rejects.toThrow("Schedule cursor is invalid")

    const corruptIdentity = deriveLocalScheduleIdentity("corrupt")
    await storage.putConfig(
      `${LOCAL_SCHEDULE_DEFINITION_PREFIX}${corruptIdentity.scheduleId}`,
      {
        kind: "local.schedule-definition",
        scheduleId: corruptIdentity.scheduleId,
        idempotencyDigest: corruptIdentity.idempotencyDigest,
        definition: {
          title: null,
          prompt: "corrupt",
          enabled: true,
          trigger: { kind: "once", at: 1 },
          sessionPolicy: { kind: "isolated" },
          modelPolicy: { kind: "active" },
          overlapPolicy: "skip_if_running",
          misfirePolicy: "fire_once",
        },
        createdAt: 1,
        storeDir: "/private/store",
      },
    )
    await expect(adapter.port.listDefinitions({ limit: 100 })).rejects.toThrow(
      "Schedule definition record fields are invalid",
    )
  })

  it("allows only one concurrent occurrence claim and fences stale definitions", async () => {
    const storeDir = await createStoreDir()
    const firstStorage = createStore(storeDir)
    const secondStorage = createStore(storeDir)
    const firstAdapter = trackAdapter(
      createLocalScheduleAdapter({ storage: firstStorage, now: () => 5_000 }),
    )
    const secondAdapter = trackAdapter(
      createLocalScheduleAdapter({ storage: secondStorage, now: () => 5_001 }),
    )
    const created = await firstAdapter.port.createDefinition({
      definition: scheduleSpec("Concurrent claim"),
      idempotencyKey: "concurrent-claim",
    })
    const definition = requireDefinition(created)
    const request = {
      scheduleId: definition.scheduleId,
      expectedDefinitionRevision: definition.revision,
      occurrenceAt: 10_000,
    }

    const results = await Promise.all([
      firstAdapter.claimOccurrence(request),
      secondAdapter.claimOccurrence(request),
    ])
    expect(results.map((result) => result.kind).sort()).toEqual([
      "local.schedule-occurrence.claimed",
      "local.schedule-occurrence.duplicate",
    ])
    await expect(firstStorage.listConfigEntries({
      prefix: LOCAL_SCHEDULE_OCCURRENCE_PREFIX,
    })).resolves.toHaveLength(1)

    const replaced = await firstAdapter.port.replaceDefinition({
      scheduleId: definition.scheduleId,
      expectedRevision: 1,
      definition: { ...scheduleSpec("Changed"), enabled: true },
    })
    const current = requireDefinition(replaced)
    await expect(firstAdapter.claimOccurrence({
      ...request,
      occurrenceAt: 11_000,
    })).resolves.toMatchObject({
      kind: "local.schedule-occurrence.definition-changed",
      expectedDefinitionRevision: 1,
      currentDefinition: { revision: 2 },
    })

    const disabled = await firstAdapter.port.setEnabled({
      scheduleId: definition.scheduleId,
      expectedRevision: current.revision,
      enabled: false,
    })
    const disabledDefinition = requireDefinition(disabled)
    await expect(firstAdapter.claimOccurrence({
      scheduleId: definition.scheduleId,
      expectedDefinitionRevision: disabledDefinition.revision,
      occurrenceAt: 12_000,
    })).resolves.toMatchObject({
      kind: "local.schedule-occurrence.definition-disabled",
      definition: { enabled: false, revision: 3 },
    })

    await firstAdapter.port.removeDefinition({
      scheduleId: definition.scheduleId,
      expectedRevision: disabledDefinition.revision,
    })
    await expect(firstAdapter.claimOccurrence({
      scheduleId: definition.scheduleId,
      expectedDefinitionRevision: disabledDefinition.revision + 1,
      occurrenceAt: 13_000,
    })).resolves.toEqual({
      kind: "local.schedule-occurrence.definition-missing",
      scheduleId: definition.scheduleId,
      occurrenceAt: 13_000,
    })
  })

  it("composes one durable Product Schedule port without adding Surface commands", async () => {
    const storeDir = await createStoreDir()
    const first = await startLocalProductHost({
      storage: { kind: "store-dir", storeDir },
      serviceBin,
    })
    hosts.push(first)
    expect(first.schedules.readAvailability()).toMatchObject({ state: "ready" })
    const created = await first.schedules.createDefinition({
      definition: {
        prompt: "Persist through Product composition",
        trigger: { kind: "once", at: 42_000 },
      },
      idempotencyKey: "product-composition",
    })
    const definition = requireDefinition(created)
    await expect(first.surface.dispatchSurfaceCommand({
      command: "readSchedules",
    })).resolves.toMatchObject({
      ok: false,
      error: { code: "unknown_command" },
    })
    await first.close()
    hosts.pop()

    const reopened = await startLocalProductHost({
      storage: { kind: "store-dir", storeDir },
      serviceBin,
    })
    hosts.push(reopened)
    await expect(
      reopened.schedules.readDefinition({ scheduleId: definition.scheduleId }),
    ).resolves.toMatchObject({
      kind: "product.schedule.found",
      definition: {
        prompt: "Persist through Product composition",
        revision: 1,
      },
    })
  })
})

function scheduleSpec(prompt: string): ScheduleDefinitionSpec {
  return {
    prompt,
    enabled: true,
    trigger: { kind: "cron", expression: "0 9 * * *", timeZone: "Asia/Shanghai" },
    sessionPolicy: { kind: "isolated" },
    modelPolicy: { kind: "active" },
    overlapPolicy: "skip_if_running",
    misfirePolicy: "fire_once",
  }
}

function requireDefinition(result: ScheduleMutationResultLike): ScheduleDefinition {
  if (result.kind !== "product.schedule.applied" || result.operation === "remove") {
    throw new Error("expected applied Schedule definition")
  }
  return result.definition
}

type ScheduleMutationResultLike = Awaited<
  ReturnType<LocalScheduleAdapter["port"]["createDefinition"]>
>

async function createHarness(now?: () => number) {
  const storeDir = await createStoreDir()
  const storage = createStore(storeDir)
  const adapter = trackAdapter(createLocalScheduleAdapter({
    storage,
    ...(now === undefined ? {} : { now }),
  }))
  return { storage, adapter }
}

function createStore(storeDir: string): StorageTestStore {
  const storage = createStorageTestStore({
    kind: "local-system-service",
    mode: "oneshot",
    storeDir,
    serviceBin,
  })
  stores.push(storage)
  return storage
}

function trackAdapter(adapter: LocalScheduleAdapter): LocalScheduleAdapter {
  adapters.push(adapter)
  return adapter
}

async function createStoreDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "wanex-local-schedule-"))
  tempDirs.push(dir)
  return dir
}
