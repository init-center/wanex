import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { WanexSessionCore } from "../src/sessions/index.js"
import { createStorageTestStore, type StorageTestStore } from "@wanex/storage/testing"
import {
  registerResourceCleanupHandler,
  startWorkerLoop,
  WanexWorker,
  workerAcknowledged
} from "../src/jobs/index.js"

const serviceBin = join(
  import.meta.dirname,
  "../../../target/debug/wanex-system-service"
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

describe("@wanex/runtime/jobs", () => {
  it("runs and stops the shared worker loop without overlapping ticks", async () => {
    let active = 0
    let maxActive = 0
    let calls = 0
    const loop = startWorkerLoop(
      {
        async runOnce() {
          active += 1
          maxActive = Math.max(maxActive, active)
          calls += 1
          await new Promise((resolve) => setTimeout(resolve, 2))
          active -= 1
          return { status: "idle" as const }
        }
      },
      { idleIntervalMs: 1 }
    )

    while (calls < 2) {
      await new Promise((resolve) => setTimeout(resolve, 2))
    }
    loop.stop()
    await loop.waitForIdle()
    const stoppedAt = calls
    await new Promise((resolve) => setTimeout(resolve, 5))

    expect(loop.stopped).toBe(true)
    expect(maxActive).toBe(1)
    expect(calls).toBe(stoppedAt)
  })

  it("claims a job dispatches a handler and completes it", async () => {
    const session = await createSessionCore()
    await session.enqueueJob({
      id: "job_worker_success",
      kind: "resource.cleanup",
      principalId: "user_worker",
      payload: { logicalPath: "tmp" }
    })

    const worker = new WanexWorker({
      session,
      workerId: "worker_success",
      leaseMs: 60_000
    })
    worker.register("resource.cleanup", ({ job }) => ({
      cleaned: job.payload
    }))

    const result = await worker.runOnce()

    expect(result.status).toBe("completed")
    if (result.status !== "completed") {
      throw new Error("expected completed result")
    }
    expect(result.job.state).toBe("succeeded")
    expect(result.job.result).toEqual({ cleaned: { logicalPath: "tmp" } })
    expect(result.job.lastError).toBeUndefined()
  })

  it("fails a job and lets scheduler retry it", async () => {
    const session = await createSessionCore()
    await session.enqueueJob({
      id: "job_worker_retry",
      kind: "provider.retry",
      principalId: "user_worker",
      payload: { provider: "fake" },
      maxAttempts: 2,
      retryPolicy: {
        strategy: "fixed",
        initialDelayMs: 0,
        maxDelayMs: 0
      }
    })

    const worker = new WanexWorker({
      session,
      workerId: "worker_retry",
      leaseMs: 60_000
    })
    worker.register("provider.retry", () => {
      throw new Error("transient provider failure")
    })

    const first = await worker.runOnce()
    expect(first.status).toBe("failed")
    if (first.status !== "failed") {
      throw new Error("expected failed result")
    }
    expect(first.job?.state).toBe("retry_scheduled")
    expect(first.job?.result).toBeUndefined()
    expect(first.job?.lastError).toMatchObject({
      type: "worker.error"
    })

    const second = await worker.runOnce()
    expect(second.status).toBe("failed")
    if (second.status !== "failed") {
      throw new Error("expected failed result")
    }
    expect(second.job?.state).toBe("failed")
    expect(second.job?.result).toBeUndefined()
  })

  it("fails jobs with no registered handler", async () => {
    const session = await createSessionCore()
    await session.enqueueJob({
      id: "job_worker_missing",
      kind: "memory.compaction",
      principalId: "user_worker",
      payload: { sessionId: "ses_missing" }
    })

    const worker = new WanexWorker({
      session,
      workerId: "worker_missing",
      leaseMs: 60_000
    })
    const result = await worker.runOnce()

    expect(result.status).toBe("failed")
    if (result.status !== "failed") {
      throw new Error("expected failed result")
    }
    expect(result.job?.state).toBe("failed")
    expect(result.job?.result).toBeUndefined()
    expect(result.error.message).toContain("no worker handler")
  })

  it("times out slow handlers and records failure", async () => {
    const session = await createSessionCore()
    await session.enqueueJob({
      id: "job_worker_timeout",
      kind: "config.sync",
      principalId: "user_worker",
      payload: {}
    })

    const worker = new WanexWorker({
      session,
      workerId: "worker_timeout",
      leaseMs: 60_000,
      timeoutMs: 5
    })
    worker.register("config.sync", async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })

    const result = await worker.runOnce()

    expect(result.status).toBe("failed")
    if (result.status !== "failed") {
      throw new Error("expected failed result")
    }
    expect(result.error.name).toBe("WanexWorkerTimeoutError")
    expect(result.job?.state).toBe("failed")
    expect(result.job?.result).toBeUndefined()
  })

  it("allows handlers to heartbeat explicitly", async () => {
    const session = await createSessionCore()
    await session.enqueueJob({
      id: "job_worker_heartbeat",
      kind: "resource.cleanup",
      principalId: "user_worker",
      payload: {}
    })

    const worker = new WanexWorker({
      session,
      workerId: "worker_heartbeat",
      leaseMs: 60_000
    })
    worker.register("resource.cleanup", async ({ heartbeat }) => {
      await heartbeat()
      return { ok: true }
    })

    const result = await worker.runOnce()

    expect(result.status).toBe("completed")
    const jobs = await session.listJobs({ state: "succeeded" })
    expect(jobs).toHaveLength(1)
  })

  it("allows domain handlers to acknowledge jobs atomically", async () => {
    const session = await createSessionCore()
    await session.enqueueJob({
      id: "job_worker_acknowledged",
      kind: "resource.cleanup",
      principalId: "user_worker",
      payload: { logicalPath: "tmp" }
    })

    const worker = new WanexWorker({
      session,
      workerId: "worker_acknowledged",
      leaseMs: 60_000
    })
    worker.register("resource.cleanup", async ({ job }) => {
      const completed = await session.completeJob({
        jobId: job.id,
        workerId: "worker_acknowledged",
        leaseToken: job.leaseToken ?? "",
        result: { acknowledged: true }
      })
      if (completed === null) {
        throw new Error("expected atomic acknowledgement")
      }
      return workerAcknowledged(completed)
    })

    const result = await worker.runOnce()

    expect(result.status).toBe("completed")
    if (result.status !== "completed") {
      throw new Error("expected completed result")
    }
    expect(result.job).toMatchObject({
      id: "job_worker_acknowledged",
      state: "succeeded",
      result: { acknowledged: true }
    })
  })

  it("runs the built-in resource.cleanup handler against session-core", async () => {
    const { session, storage } = await createSessionCoreWithStorage()
    const file = await storage.writeAtomicFile({
      logicalPath: "worker/cleanup.txt",
      content: new TextEncoder().encode("cleanup")
    })
    const expired = await storage.createResourceTicket({
      principalId: "user_worker",
      resourceId: file.resourceId,
      capability: "read",
      expiresAt: 100
    })
    await storage.createResourceTicket({
      principalId: "user_worker",
      resourceId: file.resourceId,
      capability: "write",
      expiresAt: 1_000
    })
    await session.enqueueJob({
      id: "job_worker_builtin_cleanup",
      kind: "resource.cleanup",
      principalId: "user_worker",
      payload: { nowMs: 500, limit: 10 }
    })

    const worker = new WanexWorker({
      session,
      workerId: "worker_builtin_cleanup",
      leaseMs: 60_000
    })
    registerResourceCleanupHandler(worker, session)

    const result = await worker.runOnce()

    expect(result.status).toBe("completed")
    if (result.status !== "completed") {
      throw new Error("expected completed result")
    }
    expect(result.job.result).toEqual({
      revokedCount: 1,
      revokedTicketIds: [expired.id],
      nowMs: 500
    })
    expect(result.job.lastError).toBeUndefined()
    await expect(
      session.cleanupExpiredResourceTickets({ nowMs: 500, limit: 10 })
    ).resolves.toMatchObject({ revokedCount: 0 })
  })
})

async function createSessionCore(): Promise<WanexSessionCore> {
  return (await createSessionCoreWithStorage()).session
}

async function createSessionCoreWithStorage(): Promise<{
  readonly session: WanexSessionCore
  readonly storage: StorageTestStore
}> {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-worker-core-"))
  tempDirs.push(storeDir)
  const storage = createStorageTestStore({ kind: "local-system-service", mode: "oneshot",
    storeDir,
    serviceBin
  })
  return {
    session: new WanexSessionCore({ storage }),
    storage
  }
}
