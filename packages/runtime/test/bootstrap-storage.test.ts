import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  createStorageHandleFromTransport,
  type StorageHandle
} from "@wanex/storage"
import { bootstrapWanexStorage } from "../src/bootstrap/index.js"

const serviceBin = join(
  import.meta.dirname,
  "../../../target/debug/wanex-system-service"
)
const expectedSchemaVersion = 1

const tempDirs: string[] = []

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

describe("@wanex/runtime/bootstrap storage", () => {
  it("opens local system-service storage from an explicit artifact", async () => {
    const storeDir = await mktemp("wanex-app-bootstrap-local-")
    const runtime = await bootstrapWanexStorage({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: serviceBin
      }
    })

    try {
      expect(runtime.artifacts.systemService).toEqual({
        path: serviceBin,
        source: "explicit"
      })
      await expect(runtime.storage.doctor()).resolves.toMatchObject({
        schemaVersion: expectedSchemaVersion
      })
    } finally {
      await runtime.dispose()
    }
  })

  it("opens isolated local profile storage", async () => {
    const rootDir = await mktemp("wanex-app-bootstrap-profile-")
    const runtime = await bootstrapWanexStorage({
      storage: {
        kind: "local-profile",
        rootDir,
        profileId: "work"
      },
      artifacts: {
        explicitPath: serviceBin
      }
    })

    try {
      await runtime.storage.putConfig("bootstrap.profile", { ok: true })
      await expect(runtime.storage.getConfig("bootstrap.profile")).resolves.toEqual({
        ok: true
      })
    } finally {
      await runtime.dispose()
    }
  })

  it("does not require local artifacts for remote storage clients", async () => {
    const runtime = await bootstrapWanexStorage({
      storage: {
        kind: "remote-http",
        endpoint: "http://127.0.0.1:9/wanex-storage",
        token: "test-token",
        timeoutMs: 1
      }
    })

    expect(runtime.artifacts).toEqual({})
    await runtime.dispose()
  })

  it("uses an injected storage client without taking lifecycle ownership by default", async () => {
    const injected = createInjectedStorage()
    const runtime = await bootstrapWanexStorage({
      storage: {
        kind: "injected",
        handle: injected.handle
      }
    })

    expect(runtime.storage).toBe(injected.handle.core)
    expect(runtime.artifacts).toEqual({})
    await runtime.dispose()
    await runtime.dispose()
    expect(injected.closeCount()).toBe(0)
    await injected.handle.dispose()
    expect(injected.closeCount()).toBe(1)
  })

})

async function mktemp(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

function createInjectedStorage(): {
  readonly handle: StorageHandle
  closeCount(): number
} {
  let closes = 0
  return {
    handle: createStorageHandleFromTransport({
      async call() {
        return {
          storage_rpc_version: 1,
          request_id: "injected",
          ok: true,
          value: null
        }
      },
      async close() {
        closes += 1
      }
    }, { ownership: "owned" }),
    closeCount() {
      return closes
    }
  }
}
