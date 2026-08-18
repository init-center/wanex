import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createStorageTestStore, type StorageTestStore } from "@wanex/storage/testing"
import {
  STATE_CONFIG_KEY,
  createStorageStateStore
} from "../src/state/storage.js"

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

describe("local host storage-backed state store", () => {
  it("persists product state through the trusted local storage boundary", async () => {
    const storage = await createStorage()
    const first = createStorageStateStore({ storage })
    await first.save({
      ui: {
        selection: {
          kind: "session",
          sessionId: "ses_storage_product_app"
        },
        selectedPlanProposalId: "plan_storage_product_app",
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
      pendingGuidedFollowUps: {
        ses_storage_product_app: {
          sessionId: "ses_storage_product_app",
          inputId: "input_storage_product_app_pending",
          turnId: "turn_storage_product_app_pending",
          jobId: "job_storage_product_app_pending"
        }
      },
      conversationAttachmentDrafts: {}
    })

    const second = createStorageStateStore({ storage })
    await expect(second.load()).resolves.toEqual({
      found: true,
      state: {
        ui: {
          selection: {
            kind: "session",
            sessionId: "ses_storage_product_app"
          },
          selectedPlanProposalId: "plan_storage_product_app",
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
        pendingGuidedFollowUps: {
          ses_storage_product_app: {
            sessionId: "ses_storage_product_app",
            inputId: "input_storage_product_app_pending",
            turnId: "turn_storage_product_app_pending",
            jobId: "job_storage_product_app_pending"
          }
        },
        conversationAttachmentDrafts: {}
      }
    })
  })

  it("fails closed on malformed persisted product state", async () => {
    const storage = await createStorage()
    await storage.putConfig(STATE_CONFIG_KEY, {
      ui: {
        layout: "stacked",
        mode: "chat",
        preferences: {
          theme: "system",
          density: "comfortable"
        }
      },
      trackedConversationOperations: {},
      pendingGuidedFollowUps: {},
      conversationAttachmentDrafts: {}
    })

    await expect(
      createStorageStateStore({ storage }).load()
    ).rejects.toThrow("application persisted ui.layout is not supported")
  })

  it("rejects the removed selectedSessionId persisted field", async () => {
    const storage = await createStorage()
    await storage.putConfig(STATE_CONFIG_KEY, {
      ui: {
        selectedSessionId: "ses_legacy",
        layout: "single",
        mode: "chat",
        preferences: {
          theme: "system",
          density: "comfortable"
        }
      },
      trackedConversationOperations: {},
      pendingGuidedFollowUps: {},
      conversationAttachmentDrafts: {}
    })

    await expect(
      createStorageStateStore({ storage }).load()
    ).rejects.toThrow(
      "application persisted ui contains unsupported fields: selectedSessionId"
    )
  })

  it("fails closed on an invalid persisted Plan selection", async () => {
    const storage = await createStorage()
    await storage.putConfig(STATE_CONFIG_KEY, {
      ui: {
        selectedPlanProposalId: "   ",
        layout: "single",
        mode: "chat",
        preferences: {
          theme: "system",
          density: "comfortable"
        }
      },
      trackedConversationOperations: {},
      pendingGuidedFollowUps: {},
      conversationAttachmentDrafts: {}
    })

    await expect(
      createStorageStateStore({ storage }).load()
    ).rejects.toThrow(
      "application persisted ui.selectedPlanProposalId must be a non-empty string"
    )
  })
})

async function createStorage(): Promise<StorageTestStore> {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-product-state-"))
  tempDirs.push(storeDir)
  return createStorageTestStore({ kind: "local-system-service", mode: "oneshot", storeDir, serviceBin })
}
