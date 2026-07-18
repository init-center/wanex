import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createWanexApp } from "../src/index.js"

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

describe("@wanex/app public facade", () => {
  it("runs an agent through the minimal root entry and disposes idempotently", async () => {
    const storeDir = await createStoreDir()
    const app = await createWanexApp({
      storage: {
        kind: "local-system-service",
        mode: "persistent",
        storeDir,
        serviceBin
      },
      provider: {
        id: "public-app-test",
        kind: "fake",
        modelId: "public-app-model"
      }
    })

    try {
      expect(app.status()).toEqual({
        disposed: false,
        providerProfileId: "public-app-test",
        activeProviderProfileId: "public-app-test"
      })

      const run = await app.run({
        text: "hello public app",
        sessionId: "ses_public_app"
      })
      expect(run).toMatchObject({
        sessionId: "ses_public_app",
        assistantText: expect.any(String),
        messageCount: 1,
        jobStatuses: ["succeeded"]
      })
      expect(run.assistantText.length).toBeGreaterThan(0)
    } finally {
      await app.dispose()
      await app.dispose()
    }

    expect(app.status().disposed).toBe(true)
  })
})

async function createStoreDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "wanex-public-app-"))
  tempDirs.push(dir)
  return dir
}
