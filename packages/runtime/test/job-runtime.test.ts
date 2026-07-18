import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { afterEach, describe, expect, it } from "vitest"
import { createStorageTestStore, type StorageTestStore } from "@wanex/storage/testing"
import { WanexJobRuntime } from "../src/jobs/index.js"

const serviceBin = join(
  import.meta.dirname,
  "../../../target/debug/wanex-system-service"
)

const tempDirs: string[] = []

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      await removeTempDir(dir)
    }
  }
})

describe("@wanex/runtime/jobs job runtime", () => {
  it("composes storage session events config and worker helpers", async () => {
    const runtime = await createRuntime("worker_compose")

    await runtime.config.put("app.name", "wanex")
    await expect(runtime.config.get("app.name")).resolves.toBe("wanex")

    await runtime.session.create({ id: "ses_runtime_compose" })
    const events = await runtime.events.query({ limit: 10 })
    expect(events.map((event) => event.type)).toContain("config.updated")

    await runtime.stop()
  })

  it("runs one custom scheduler job through the runtime worker", async () => {
    const runtime = await createRuntime("worker_custom")
    runtime.register("config.sync", ({ job }) => ({
      synced: job.payload
    }))
    await runtime.session.enqueueJob({
      id: "job_runtime_custom",
      kind: "config.sync",
      principalId: "user_runtime",
      payload: { key: "app.name" }
    })

    const result = await runtime.runWorkerOnce()

    expect(result.status).toBe("completed")
    if (result.status !== "completed") {
      throw new Error("expected completed job")
    }
    expect(result.job.result).toEqual({ synced: { key: "app.name" } })
    await runtime.stop()
  })

  it("can opt into built-in maintenance handlers", async () => {
    const runtime = await createRuntime("worker_maintenance", {
      registerMaintenanceHandlers: true
    })
    const file = await runtime.storage.writeAtomicFile({
      logicalPath: "runtime/cleanup.txt",
      content: new TextEncoder().encode("cleanup")
    })
    const expired = await runtime.storage.createResourceTicket({
      principalId: "user_runtime",
      resourceId: file.resourceId,
      capability: "read",
      expiresAt: 10
    })
    await runtime.session.enqueueJob({
      id: "job_runtime_cleanup",
      kind: "resource.cleanup",
      principalId: "user_runtime",
      payload: { nowMs: 20, limit: 10 }
    })

    const result = await runtime.runWorkerOnce()

    expect(result.status).toBe("completed")
    if (result.status !== "completed") {
      throw new Error("expected cleanup completion")
    }
    expect(result.job.result).toEqual({
      revokedCount: 1,
      revokedTicketIds: [expired.id],
      nowMs: 20
    })
    await runtime.stop()
  })

  it("runs a worker loop until stopped", async () => {
    const runtime = await createRuntime("worker_loop")
    const completed: string[] = []
    runtime.register("config.sync", ({ job }) => {
      completed.push(job.id)
      return { ok: true }
    })
    await runtime.session.enqueueJob({
      id: "job_runtime_loop",
      kind: "config.sync",
      principalId: "user_runtime",
      payload: {}
    })

    const loop = runtime.startWorkerLoop({
      idleIntervalMs: 10
    })
    await eventually(() => {
      expect(completed).toEqual(["job_runtime_loop"])
    })
    loop.stop()
    expect(loop.stopped).toBe(true)
    await runtime.stop()
  })

  it("stops loops without closing borrowed storage", async () => {
    const storage = await createTestStore()
    let closed = false
    const runtime = new WanexJobRuntime({
      storage: Object.assign(storage, {
        close: async () => {
          closed = true
        }
      }),
      workerId: "worker_close"
    })
    const loop = runtime.startWorkerLoop({ idleIntervalMs: 10 })

    await delay(20)
    await runtime.stop()

    expect(loop.stopped).toBe(true)
    expect(closed).toBe(false)
    await storage.dispose()
  })

  it("waits for a manually stopped loop to finish active work before returning", async () => {
    const storage = await createTestStore()
    const events: string[] = []
    const runtime = new WanexJobRuntime({
      storage: Object.assign(storage, {
        close: async () => {
          events.push("close")
        }
      }),
      workerId: "worker_manual_stop_wait"
    })
    runtime.register("config.sync", async () => {
      events.push("handler:start")
      await delay(50)
      events.push("handler:end")
      return { ok: true }
    })
    await runtime.session.enqueueJob({
      id: "job_runtime_manual_stop_wait",
      kind: "config.sync",
      principalId: "user_runtime",
      payload: {}
    })

    const loop = runtime.startWorkerLoop({ idleIntervalMs: 10 })
    await eventually(() => {
      expect(events).toEqual(["handler:start"])
    })
    loop.stop()

    await runtime.stop()

    expect(loop.stopped).toBe(true)
    expect(events).toEqual(["handler:start", "handler:end"])
    await storage.dispose()
  })

  it("allows child runtimes to stop independently while sharing storage", async () => {
    const storage = await createTestStore()
    const originalClose = storage.dispose.bind(storage)
    let closeCalls = 0
    const borrowedStorage = Object.assign(storage, {
      dispose: async () => {
        closeCalls += 1
        await originalClose()
      }
    })
    const first = new WanexJobRuntime({
      storage: borrowedStorage,
      workerId: "worker_shared_first"
    })
    const second = new WanexJobRuntime({
      storage: borrowedStorage,
      workerId: "worker_shared_second"
    })

    await first.stop()

    expect(closeCalls).toBe(0)
    await expect(second.config.put("shared.key", "still-open")).resolves.toBeUndefined()
    await expect(second.config.get("shared.key")).resolves.toBe("still-open")

    await second.stop()
    expect(closeCalls).toBe(0)
    await borrowedStorage.dispose()
    expect(closeCalls).toBe(1)
  })
})

async function createRuntime(
  workerId: string,
  options: {
    readonly registerMaintenanceHandlers?: boolean
  } = {}
): Promise<WanexJobRuntime> {
  return new WanexJobRuntime({
    storage: await createTestStore(),
    workerId,
    ...(options.registerMaintenanceHandlers === undefined
      ? {}
      : { registerMaintenanceHandlers: options.registerMaintenanceHandlers })
  })
}

async function createTestStore(): Promise<StorageTestStore> {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-runtime-core-"))
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

async function removeTempDir(dir: string): Promise<void> {
  let lastError: unknown
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(dir, { recursive: true, force: true })
      return
    } catch (error) {
      lastError = error
      await delay(20)
    }
  }
  throw lastError
}
