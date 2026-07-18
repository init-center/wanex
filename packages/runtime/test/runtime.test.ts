import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { afterEach, describe, expect, it } from "vitest"
import { createStorageHandle } from "@wanex/storage"
import { createWanexRuntime } from "../src/index.js"

const serviceBin = join(
  import.meta.dirname,
  "../../../target/debug/wanex-system-service"
)
const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

describe("@wanex/runtime", () => {
  it("owns storage, provider setup, foreground runs, and disposal", async () => {
    const runtime = await createRuntime("foreground response")

    try {
      expect(runtime.status()).toMatchObject({
        disposed: false,
        started: false,
        workerCount: 1,
        providerKind: "fake",
        modelId: "public-runtime-model"
      })

      const result = await runtime.run({
        text: "hello public runtime",
        sessionId: "ses_public_runtime"
      })
      expect(result).toMatchObject({
        sessionId: "ses_public_runtime",
        jobState: "succeeded",
        assistantText: "foreground response",
        messageCount: 1,
        workerResults: ["completed"]
      })
    } finally {
      await runtime.dispose()
      await runtime.dispose()
    }

    expect(runtime.status().disposed).toBe(true)
    await expect(runtime.run({ text: "after dispose" })).rejects.toThrow(
      "wanex runtime is disposed"
    )
  })

  it("separates restartable background stop from final dispose", async () => {
    const runtime = await createRuntime("background response")
    try {
      runtime.start()
      expect(runtime.status().started).toBe(true)
      await runtime.submit({
        text: "background",
        sessionId: "ses_public_runtime_background"
      })
      await delay(40)
      await runtime.stop()
      expect(runtime.status().started).toBe(false)
      expect(runtime.health(1234)).toMatchObject({
        generatedAt: 1234,
        started: false,
        workerCount: 1,
        activeLoopCount: 0
      })

      const result = await runtime.run({
        text: "foreground after stop",
        sessionId: "ses_public_runtime_after_stop"
      })
      expect(result.jobState).toBe("succeeded")
    } finally {
      await runtime.dispose()
    }
  })

  it("borrows injected storage without closing its handle", async () => {
    const storeDir = await mkdtemp(join(tmpdir(), "wanex-runtime-injected-"))
    tempDirs.push(storeDir)
    const storage = createStorageHandle({
      kind: "local-system-service",
      mode: "persistent",
      storeDir,
      serviceBin
    })
    const runtime = await createWanexRuntime({
      storage: {
        kind: "injected",
        handle: storage
      },
      provider: {
        kind: "fake",
        modelId: "borrowed-storage-model"
      }
    })

    try {
      await runtime.dispose()
      await expect(storage.core.doctor()).resolves.toMatchObject({
        schemaVersion: 8
      })
    } finally {
      await runtime.dispose()
      await storage.dispose()
    }
  })
})

async function createRuntime(responseText: string) {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-public-runtime-"))
  tempDirs.push(storeDir)
  return await createWanexRuntime({
    storage: {
      kind: "local-system-service",
      mode: "persistent",
      storeDir,
      serviceBin
    },
    provider: {
      kind: "fake",
      id: "public-runtime-test",
      modelId: "public-runtime-model",
      responseText
    },
    idleIntervalMs: 5
  })
}
