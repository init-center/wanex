import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { afterEach, describe, expect, it } from "vitest"
import { createRuntimeEvent } from "@wanex/protocol"
import { createStorageTestStore, type StorageTestStore } from "@wanex/storage/testing"
import {
  ConfigHotReloadController,
  configUpdatedPayload,
  WanexConfigCore
} from "../src/config/index.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)

const tempDirs: string[] = []
const clients: StorageTestStore[] = []

afterEach(async () => {
  while (clients.length > 0) {
    await clients.pop()?.dispose()
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

describe("@wanex/runtime/config", () => {
  it("reads config through storage and serves repeated reads from memory cache", async () => {
    const storage = await createTestStore()
    const config = new WanexConfigCore({ storage })

    await storage.putConfig("app.theme", { value: "dark" })
    await expect(config.get("app.theme")).resolves.toEqual({ value: "dark" })

    await storage.putConfig("app.theme", { value: "light" })
    await expect(config.get("app.theme")).resolves.toEqual({ value: "dark" })

    config.deleteLocal("app.theme")
    await expect(config.get("app.theme")).resolves.toEqual({ value: "light" })
  })

  it("invalidates a cached key when applying config.updated", async () => {
    const storage = await createTestStore()
    const config = new WanexConfigCore({ storage })

    await storage.putConfig("runtime.setting.default", { id: "old" })
    await expect(config.get("runtime.setting.default")).resolves.toEqual({
      id: "old"
    })
    await storage.putConfig("runtime.setting.default", { id: "new" })

    const invalidated = config.applyEvent(
      createRuntimeEvent({
        id: "evt_config",
        type: "config.updated",
        scope: {},
        payload: {
          key: "runtime.setting.default",
          updatedAt: Date.now()
        },
        occurredAt: Date.now()
      })
    )

    expect(invalidated).toBe("runtime.setting.default")
    await expect(config.get("runtime.setting.default")).resolves.toEqual({
      id: "new"
    })
  })

  it("polls config invalidations from the event log without exposing values", async () => {
    const storage = await createTestStore()
    const config = new WanexConfigCore({ storage })

    await config.put("runtime.setting.dynamic", {
      id: "deepseek",
      apiKey: "secret-key"
    })
    await expect(config.get("runtime.setting.dynamic")).resolves.toEqual({
      id: "deepseek",
      apiKey: "secret-key"
    })

    const result = await config.pollInvalidationsOnce({ limit: 10 })

    expect(result.invalidatedKeys).toContain("runtime.setting.dynamic")
    expect(JSON.stringify(result.events)).not.toContain("secret-key")
    await expect(config.get("runtime.setting.dynamic")).resolves.toEqual({
      id: "deepseek",
      apiKey: "secret-key"
    })
  })

  it("watches invalidations and keeps retrying after poll errors", async () => {
    const storage = await createTestStore()
    const config = new WanexConfigCore({ storage })
    const originalQueryEvents = storage.queryEvents.bind(storage)
    const invalidated: string[] = []
    const errors: unknown[] = []
    let attempts = 0

    storage.queryEvents = async (query) => {
      attempts += 1
      if (attempts === 1) {
        throw new Error("temporary poll failure")
      }
      return await originalQueryEvents(query)
    }

    const watcher = config.watchInvalidations({
      intervalMs: 10,
      onInvalidate: (key) => invalidated.push(key),
      onError: (error) => errors.push(error)
    })
    await storage.putConfig("app.hot", { enabled: true })

    await eventually(() => {
      expect(errors.length).toBeGreaterThanOrEqual(1)
      expect(attempts).toBeGreaterThanOrEqual(2)
      expect(invalidated).toContain("app.hot")
    })
    watcher.stop()
    await watcher.waitForIdle()
  })

  it("parses only safe config.updated payloads", () => {
    const event = createRuntimeEvent({
      id: "evt_safe",
      type: "config.updated",
      scope: {},
      payload: { key: "app.safe", updatedAt: 1 },
      occurredAt: 1
    })
    const malformed = createRuntimeEvent({
      id: "evt_bad",
      type: "config.updated",
      scope: {},
      payload: { key: "app.bad", value: "leaked" },
      occurredAt: 2
    })

    expect(configUpdatedPayload(event)).toEqual({
      key: "app.safe",
      updatedAt: 1
    })
    expect(configUpdatedPayload(malformed)).toBeNull()
  })

  it("commits matching config candidates as one generation", async () => {
    const storage = await createTestStore()
    const live = { first: "old", second: "old" }
    const order: string[] = []
    const controller = new ConfigHotReloadController({
      storage,
      subscriptions: [
        atomicSubscription("first", live, order),
        atomicSubscription("second", live, order)
      ]
    })
    await storage.putConfig("runtime.atomic", { value: "new" })

    const result = await controller.refreshKey("runtime.atomic")

    expect(result).toMatchObject({
      generation: 1,
      committed: true,
      reloads: [
        { subscriptionId: "first", generation: 1, committed: true },
        { subscriptionId: "second", generation: 1, committed: true }
      ],
      errors: []
    })
    expect(live).toEqual({ first: "new", second: "new" })
    expect(order).toEqual([
      "prepare:first:new",
      "prepare:second:new",
      "commit:first:new",
      "commit:second:new"
    ])
  })

  it("publishes nothing when a later config candidate rejects", async () => {
    const storage = await createTestStore()
    const live = { first: "old", second: "old" }
    const order: string[] = []
    const controller = new ConfigHotReloadController({
      storage,
      subscriptions: [
        atomicSubscription("first", live, order),
        {
          id: "rejecting",
          matcher: { kind: "exact", key: "runtime.atomic" },
          prepare() {
            order.push("prepare:rejecting")
            return {
              kind: "rejected",
              result: {
                reloaded: false,
                reason: "candidate_incomplete",
                detail: { source: "temporary" }
              }
            }
          }
        }
      ]
    })
    await storage.putConfig("runtime.atomic", { value: "new" })

    const result = await controller.refreshKey("runtime.atomic")

    expect(result).toMatchObject({
      generation: 0,
      committed: false,
      reloads: [{
        subscriptionId: "rejecting",
        generation: 0,
        committed: false,
        reloaded: false,
        reason: "candidate_incomplete"
      }],
      errors: []
    })
    expect(live).toEqual({ first: "old", second: "old" })
    expect(order).toEqual([
      "prepare:first:new",
      "prepare:rejecting",
      "rollback:first:old"
    ])
  })

  it("rolls back the committed prefix and reports rollback failure", async () => {
    const storage = await createTestStore()
    const live = { first: "old", second: "old" }
    const order: string[] = []
    const controller = new ConfigHotReloadController({
      storage,
      subscriptions: [
        atomicSubscription("first", live, order),
        atomicSubscription("second", live, order, {
          failCommit: true,
          reportRollbackFailure: true
        })
      ]
    })
    await storage.putConfig("runtime.atomic", { value: "new" })

    const result = await controller.refreshKey("runtime.atomic")

    expect(result).toMatchObject({
      generation: 0,
      committed: false,
      reloads: [],
      errors: [
        { subscriptionId: "second", stage: "commit" },
        { subscriptionId: "second", stage: "rollback" }
      ]
    })
    expect(live).toEqual({ first: "old", second: "old" })
    expect(order).toEqual([
      "prepare:first:new",
      "prepare:second:new",
      "commit:first:new",
      "commit:second:new",
      "rollback:second:old",
      "rollback:first:old"
    ])
  })

  it("serializes overlapping config generations without interleaving", async () => {
    const storage = await createTestStore()
    const live = { value: "old" }
    const order: string[] = []
    let releaseFirst: (() => void) | undefined
    const firstBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const controller = new ConfigHotReloadController({
      storage,
      subscriptions: [{
        id: "serialized",
        matcher: { kind: "exact", key: "runtime.serialized" },
        async prepare({ config }) {
          const value = configValue(await config.require("runtime.serialized"))
          order.push(`prepare:${value}`)
          if (value === "first") {
            await firstBlocked
          }
          const previous = live.value
          return {
            kind: "ready",
            result: { reloaded: value !== previous },
            commit() {
              order.push(`commit:${value}`)
              live.value = value
            },
            rollback() {
              order.push(`rollback:${previous}`)
              live.value = previous
            }
          }
        }
      }]
    })

    await storage.putConfig("runtime.serialized", { value: "first" })
    const first = controller.refreshKey("runtime.serialized")
    await eventually(() => expect(order).toEqual(["prepare:first"]))

    await storage.putConfig("runtime.serialized", { value: "second" })
    const second = controller.refreshKey("runtime.serialized")
    await delay(20)
    expect(order).toEqual(["prepare:first"])

    releaseFirst?.()
    const [firstResult, secondResult] = await Promise.all([first, second])

    expect(firstResult.generation).toBe(1)
    expect(secondResult.generation).toBe(2)
    expect(live.value).toBe("second")
    expect(order).toEqual([
      "prepare:first",
      "commit:first",
      "prepare:second",
      "commit:second"
    ])
  })
})

function atomicSubscription(
  id: "first" | "second",
  live: Record<"first" | "second", string>,
  order: string[],
  options: {
    readonly failCommit?: boolean
    readonly reportRollbackFailure?: boolean
  } = {}
) {
  return {
    id,
    matcher: { kind: "exact" as const, key: "runtime.atomic" },
    async prepare({ config }: { config: WanexConfigCore }) {
      const value = configValue(await config.require("runtime.atomic"))
      const previous = live[id]
      order.push(`prepare:${id}:${value}`)
      return {
        kind: "ready" as const,
        result: { reloaded: value !== previous },
        commit() {
          order.push(`commit:${id}:${value}`)
          live[id] = value
          if (options.failCommit === true) {
            throw new Error(`${id} commit failed`)
          }
        },
        rollback() {
          order.push(`rollback:${id}:${previous}`)
          live[id] = previous
          if (options.reportRollbackFailure === true) {
            throw new Error(`${id} rollback reported failure`)
          }
        }
      }
    }
  }
}

function configValue(value: unknown): string {
  if (
    value === null ||
    typeof value !== "object" ||
    !("value" in value) ||
    typeof value.value !== "string"
  ) {
    throw new Error("test config value is invalid")
  }
  return value.value
}

async function createTestStore(): Promise<StorageTestStore> {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-config-core-"))
  tempDirs.push(storeDir)
  const storage = createStorageTestStore({
    kind: "local-system-service",
    mode: "persistent",
    storeDir,
    serviceBin
  })
  clients.push(storage)
  return storage
}

async function eventually(assertion: () => void): Promise<void> {
  const started = Date.now()
  let lastError: unknown
  while (Date.now() - started < 1_000) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
      await delay(20)
    }
  }
  throw lastError
}
