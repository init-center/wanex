import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createStorageTestStore, type StorageTestStore } from "@wanex/storage/testing"
import {
  PRODUCT_APP_STATE_CONFIG_KEY,
  createStorageProductAppStateStore
} from "../src/state-store-storage.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)
const tempDirs: string[] = []

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

describe("Product App Local storage-backed state store", () => {
  it("persists Product App state through the trusted local storage boundary", async () => {
    const storage = await createStorage()
    const first = createStorageProductAppStateStore({ storage })
    await first.save({
      ui: {
        selectedSessionId: "ses_storage_product_app",
        layout: "split",
        mode: "workbench",
        preferences: {
          theme: "dark",
          density: "compact"
        }
      },
      trackedConversationOperations: {
        ses_storage_product_app: {
          sessionId: "ses_storage_product_app",
          inputId: "input_storage_product_app",
          turnId: "turn_storage_product_app",
          jobId: "job_storage_product_app"
        }
      },
      conversationAttachmentDrafts: {}
    })

    const second = createStorageProductAppStateStore({ storage })
    await expect(second.load()).resolves.toEqual({
      found: true,
      state: {
        ui: {
          selectedSessionId: "ses_storage_product_app",
          layout: "split",
          mode: "workbench",
          preferences: {
            theme: "dark",
            density: "compact"
          }
        },
        trackedConversationOperations: {
          ses_storage_product_app: {
            sessionId: "ses_storage_product_app",
            inputId: "input_storage_product_app",
            turnId: "turn_storage_product_app",
            jobId: "job_storage_product_app"
          }
        },
        conversationAttachmentDrafts: {}
      }
    })
  })

  it("fails closed on malformed persisted Product App state", async () => {
    const storage = await createStorage()
    await storage.putConfig(PRODUCT_APP_STATE_CONFIG_KEY, {
      ui: {
        layout: "stacked",
        mode: "chat",
        preferences: {
          theme: "system",
          density: "comfortable"
        }
      },
      trackedConversationOperations: {},
      conversationAttachmentDrafts: {}
    })

    await expect(
      createStorageProductAppStateStore({ storage }).load()
    ).rejects.toThrow("product app persisted ui.layout is not supported")
  })
})

async function createStorage(): Promise<StorageTestStore> {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-product-app-state-"))
  tempDirs.push(storeDir)
  return createStorageTestStore({ kind: "local-system-service", mode: "oneshot", storeDir, serviceBin })
}
