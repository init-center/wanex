import { describe, expect, it, vi } from "vitest"
import {
  ProtocolStorageTransport,
  STORAGE_RPC_SCHEMA_SHA256,
  StorageTransportError,
  type StorageRpcRequestEnvelope,
  type StorageWireTransport
} from "../src/index.js"

describe("storage RPC protocol transport", () => {
  it("wraps and correlates one-shot commands without a second handshake process", async () => {
    const requests: StorageRpcRequestEnvelope[] = []
    const wire: StorageWireTransport = {
      async exchange(request) {
        requests.push(request)
        return success(request.request_id, { schema_version: 8 })
      }
    }
    const transport = new ProtocolStorageTransport(wire, {
      negotiation: "oneshot",
      createRequestId: () => "rpc_oneshot"
    })

    await expect(transport.call({ command: "doctor" })).resolves.toMatchObject({
      ok: true,
      request_id: "rpc_oneshot"
    })
    expect(requests).toEqual([
      {
        storage_rpc_version: 1,
        request_id: "rpc_oneshot",
        request: { command: "doctor" }
      }
    ])
  })

  it("deduplicates concurrent remote negotiation", async () => {
    const requests: StorageRpcRequestEnvelope[] = []
    let nextId = 0
    const wire: StorageWireTransport = {
      async exchange(request) {
        requests.push(request)
        if (request.request.command === "rpc-describe") {
          await Promise.resolve()
          return success(request.request_id, descriptor())
        }
        return success(request.request_id, null)
      }
    }
    const transport = new ProtocolStorageTransport(wire, {
      negotiation: "remote",
      createRequestId: () => `rpc_remote_${++nextId}`
    })

    await Promise.all([
      transport.call({ command: "doctor" }),
      transport.call({ command: "get-config", key: "profile" })
    ])

    expect(
      requests.filter((request) => request.request.command === "rpc-describe")
    ).toHaveLength(1)
    expect(requests).toHaveLength(3)
  })

  it("renegotiates when a persistent wire opens a replacement epoch", async () => {
    const commands: string[] = []
    let epoch: number | null = null
    let nextEpoch = 0
    let nextId = 0
    const wire: StorageWireTransport = {
      connectionEpoch: () => epoch,
      async exchange(request) {
        if (epoch === null) {
          epoch = ++nextEpoch
        }
        commands.push(request.request.command)
        return success(
          request.request_id,
          request.request.command === "rpc-describe" ? descriptor() : null
        )
      }
    }
    const transport = new ProtocolStorageTransport(wire, {
      negotiation: "persistent",
      createRequestId: () => `rpc_persistent_${++nextId}`
    })

    await transport.call({ command: "doctor" })
    epoch = null
    await transport.call({ command: "doctor" })

    expect(commands).toEqual([
      "rpc-describe",
      "doctor",
      "rpc-describe",
      "doctor"
    ])
  })

  it("fails closed on mismatched response correlation and closes once", async () => {
    const close = vi.fn(async () => undefined)
    const wire: StorageWireTransport = {
      async exchange() {
        return success("wrong_request", null)
      },
      close
    }
    const transport = new ProtocolStorageTransport(wire, {
      negotiation: "oneshot",
      createRequestId: () => "expected_request"
    })

    await expect(transport.call({ command: "doctor" })).rejects.toMatchObject({
      name: "StorageTransportError",
      code: "storage_rpc_request_id_mismatch"
    } satisfies Partial<StorageTransportError>)
    await transport.close()
    await transport.close()
    expect(close).toHaveBeenCalledTimes(1)
    await expect(transport.call({ command: "doctor" })).rejects.toMatchObject({
      code: "storage_rpc_transport_closed"
    })
  })

  it("rejects malformed descriptors before dispatching domain commands", async () => {
    const commands: string[] = []
    const wire: StorageWireTransport = {
      async exchange(request) {
        commands.push(request.request.command)
        return success(request.request_id, {
          ...descriptor(),
          schema_sha256: "wrong-schema"
        })
      }
    }
    const transport = new ProtocolStorageTransport(wire, {
      negotiation: "remote",
      createRequestId: () => "rpc_bad_descriptor"
    })

    await expect(transport.call({ command: "doctor" })).rejects.toMatchObject({
      code: "storage_rpc_incompatible_descriptor"
    } satisfies Partial<StorageTransportError>)
    expect(commands).toEqual(["rpc-describe"])
  })

  it("rejects response version mismatches", async () => {
    const wire: StorageWireTransport = {
      async exchange(request) {
        return {
          ...success(request.request_id, null),
          storage_rpc_version: 2
        }
      }
    }
    const transport = new ProtocolStorageTransport(wire, {
      negotiation: "oneshot",
      createRequestId: () => "rpc_wrong_version"
    })

    await expect(transport.call({ command: "doctor" })).rejects.toMatchObject({
      code: "storage_rpc_response_version_mismatch"
    } satisfies Partial<StorageTransportError>)
  })

  it("does not dispatch a domain command when closed during handshake", async () => {
    let releaseHandshake: (() => void) | undefined
    const handshakeBlocked = new Promise<void>((resolve) => {
      releaseHandshake = resolve
    })
    const commands: string[] = []
    const close = vi.fn(async () => undefined)
    const wire: StorageWireTransport = {
      async exchange(request) {
        commands.push(request.request.command)
        if (request.request.command === "rpc-describe") {
          await handshakeBlocked
          return success(request.request_id, descriptor())
        }
        return success(request.request_id, null)
      },
      close
    }
    const transport = new ProtocolStorageTransport(wire, {
      negotiation: "persistent",
      createRequestId: () => "rpc_close_handshake"
    })

    const call = transport.call({ command: "doctor" })
    await vi.waitFor(() => expect(commands).toEqual(["rpc-describe"]))
    await transport.close()
    releaseHandshake?.()

    await expect(call).rejects.toMatchObject({
      code: "storage_rpc_transport_closed"
    } satisfies Partial<StorageTransportError>)
    expect(commands).toEqual(["rpc-describe"])
    expect(close).toHaveBeenCalledTimes(1)
  })
})

function success(requestId: string, value: unknown) {
  return {
    storage_rpc_version: 1,
    request_id: requestId,
    ok: true,
    value
  }
}

function descriptor() {
  return {
    selected_version: 1,
    supported_versions: [1],
    service_version: "0.0.0",
    schema_sha256: STORAGE_RPC_SCHEMA_SHA256,
    capabilities: ["storage.runtime"]
  }
}
