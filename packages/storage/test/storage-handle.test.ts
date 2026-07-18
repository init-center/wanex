import { describe, expect, it, vi } from "vitest"
import {
  createStorageHandleFromTransport,
  type StorageTransport
} from "../src/index.js"
import { createChannelStore } from "../src/channel.js"
import { createPluginStore } from "../src/plugin.js"
import { createWorkspaceStore } from "../src/workspace.js"

describe("storage handle and borrowed facets", () => {
  it("owns one transport and disposes it exactly once", async () => {
    const close = vi.fn(async () => undefined)
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

    await handle.dispose()
    await handle.dispose()
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
