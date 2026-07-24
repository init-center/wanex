import { describe, expect, it, vi } from "vitest"
import {
  createStorageHandleFromTransport,
  type StorageTransport
} from "../src/index.js"
import { createChannelStore } from "../src/channel.js"
import { createPluginStore } from "../src/plugin.js"
import { createWorkspaceStore } from "../src/workspace.js"

describe("storage handle and borrowed facets", () => {
  it("owns one transport and joins concurrent disposal exactly once", async () => {
    const closeStarted = deferred<void>()
    const releaseClose = deferred<void>()
    const close = vi.fn(async () => {
      closeStarted.resolve()
      await releaseClose.promise
    })
    const transport = fakeTransport(close)
    const handle = createStorageHandleFromTransport(transport, {
      ownership: "owned"
    })

    expect(handle.core).toHaveProperty("createSession")
    expect(handle.core).toHaveProperty("enqueueJob")
    expect(handle.core).not.toHaveProperty("putPluginManifest")
    expect(handle.core).not.toHaveProperty("putWorkspaceChangeSet")
    expect(handle.core).not.toHaveProperty("close")
    expect(handle.core).not.toHaveProperty("dispose")

    const firstDispose = handle.dispose()
    await closeStarted.promise
    let secondDisposeCompleted = false
    const secondDispose = handle.dispose().then(() => {
      secondDisposeCompleted = true
    })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(secondDisposeCompleted).toBe(false)
    releaseClose.resolve()
    await Promise.all([firstDispose, secondDispose])
    expect(close).toHaveBeenCalledTimes(1)
  })

  it("never closes a borrowed injected transport", async () => {
    const close = vi.fn(async () => undefined)
    const transport = fakeTransport(close)
    const handle = createStorageHandleFromTransport(transport, {
      ownership: "borrowed"
    })

    const workspace = createWorkspaceStore(transport)
    const plugin = createPluginStore(transport)
    const channel = createChannelStore(transport)
    for (const facet of [workspace, plugin, channel]) {
      expect(facet).not.toHaveProperty("close")
      expect(facet).not.toHaveProperty("dispose")
    }

    await handle.dispose()
    expect(close).not.toHaveBeenCalled()
  })
})

function fakeTransport(close: () => Promise<void>): StorageTransport {
  return {
    async call() {
      return {
        storage_rpc_version: 1,
        request_id: "fake",
        ok: true,
        value: null
      }
    },
    close
  }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}
