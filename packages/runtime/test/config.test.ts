import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { afterEach, describe, expect, it } from "vitest"
import { createRuntimeEvent } from "@wanex/protocol"
import { createStorageTestStore, type StorageTestStore } from "@wanex/storage/testing"
import {
  configUpdatedPayload,
  WanexConfigCore
} from "../src/config/index.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)

const tempDirs: string[] = []

afterEach(async () => {
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

    await storage.putConfig("provider.profile.default", { id: "old" })
    await expect(config.get("provider.profile.default")).resolves.toEqual({
      id: "old"
    })
    await storage.putConfig("provider.profile.default", { id: "new" })

    const invalidated = config.applyEvent(
      createRuntimeEvent({
        id: "evt_config",
        type: "config.updated",
        scope: {},
        payload: {
          key: "provider.profile.default",
          updatedAt: Date.now()
        },
        occurredAt: Date.now()
      })
    )

    expect(invalidated).toBe("provider.profile.default")
    await expect(config.get("provider.profile.default")).resolves.toEqual({
      id: "new"
    })
  })

  it("polls config invalidations from the event log without exposing values", async () => {
    const storage = await createTestStore()
    const config = new WanexConfigCore({ storage })

    await config.put("provider.profile.deepseek", {
      id: "deepseek",
      apiKey: "secret-key"
    })
    await expect(config.get("provider.profile.deepseek")).resolves.toEqual({
      id: "deepseek",
      apiKey: "secret-key"
    })

    const result = await config.pollInvalidationsOnce({ limit: 10 })

    expect(result.invalidatedKeys).toContain("provider.profile.deepseek")
    expect(JSON.stringify(result.events)).not.toContain("secret-key")
    await expect(config.get("provider.profile.deepseek")).resolves.toEqual({
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
})

async function createTestStore(): Promise<StorageTestStore> {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-config-core-"))
  tempDirs.push(storeDir)
  return createStorageTestStore({ kind: "local-system-service", mode: "oneshot",
    storeDir,
    serviceBin
  })
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
