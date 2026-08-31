import { randomUUID } from "node:crypto"
import { once } from "node:events"
import { mkdtemp, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createConnection, type Socket } from "node:net"
import { setTimeout as delay } from "node:timers/promises"
import { describe, expect, it } from "vitest"
import {
  createAgentHostClient,
  type AgentHostEvent,
  type AgentHostEventPage
} from "@wanex/protocol"
import {
  createInProcessAgentHostEndpoint,
  createLocalAgentHostIpcClientTransport,
  listenLocalAgentHostIpc
} from "../src/host/index.js"

describe("local Agent Host IPC", () => {
  it("round-trips concurrent operations, events, replay, and endpoint cleanup", async () => {
    const fixture = await createIpcFixture("transport")
    const sourceListeners = new Set<(event: AgentHostEvent) => void>()
    let operationCount = 0
    const server = await listenLocalAgentHostIpc({
      socketPath: fixture.address,
      createEndpoint: () =>
        createInProcessAgentHostEndpoint({
          host: host("roundtrip"),
          capabilities: capabilities(),
          accessToken: "ipc_token",
          handleOperation: async (request) => {
            operationCount += 1
            if (request.operation === "slow.read") await delay(30)
            return {
              outcome: "completed",
              result: { operation: request.operation, count: operationCount }
            }
          },
          replayEvents: (request) => ({
            outcome: "replayed",
            page: page(request.streamId)
          }),
          subscribeEvents: (listener) => {
            sourceListeners.add(listener)
            return () => sourceListeners.delete(listener)
          }
        })
    })
    if (process.platform !== "win32") {
      expect((await stat(fixture.address)).mode & 0o777).toBe(0o600)
    }
    const transport = createLocalAgentHostIpcClientTransport({
      socketPath: fixture.address
    })
    const client = createAgentHostClient(transport, requestIds("roundtrip"))

    try {
      await expect(
        client.handshake({
          protocolVersion: 1,
          clientId: "ipc_client",
          accessToken: "ipc_token",
          requestedDomains: ["assistant"]
        })
      ).resolves.toMatchObject({
        host: { connectionKind: "local_ipc" }
      })

      const received: AgentHostEvent[] = []
      client.subscribe((event) => received.push(event))
      const [slow, fast] = await Promise.all([
        client.read({
          domain: "assistant",
          operation: "slow.read",
          payload: {}
        }),
        client.read({
          domain: "assistant",
          operation: "fast.read",
          payload: {}
        })
      ])
      expect(slow).toMatchObject({ result: { operation: "slow.read" } })
      expect(fast).toMatchObject({ result: { operation: "fast.read" } })
      expect(operationCount).toBe(2)

      const event = createEvent()
      for (const listener of sourceListeners) listener(event)
      await eventually(() => expect(received).toEqual([event]))

      await expect(
        client.replay({
          streamId: "ipc_stream",
          afterSequence: 0,
          limit: 10
        })
      ).resolves.toMatchObject({
        outcome: "replayed",
        page: { streamId: "ipc_stream" }
      })
    } finally {
      await transport.close()
      await server.close()
    }

    await expectEndpointClosed(fixture)
  })

  it("fails a wrong token and accepts a fresh authenticated connection", async () => {
    const fixture = await createIpcFixture("authentication")
    const server = await listenLocalAgentHostIpc({
      socketPath: fixture.address,
      createEndpoint: () =>
        createInProcessAgentHostEndpoint({
          host: host("authentication"),
          capabilities: capabilities(),
          accessToken: "correct_token",
          handleOperation: async () => ({ outcome: "completed", result: {} }),
          replayEvents: () => ({
            outcome: "replayed",
            page: page("auth_stream")
          }),
          subscribeEvents: () => () => undefined
        })
    })
    const rejectedTransport = createLocalAgentHostIpcClientTransport({
      socketPath: fixture.address
    })
    const rejectedClient = createAgentHostClient(
      rejectedTransport,
      requestIds("rejected")
    )

    try {
      await expect(
        rejectedClient.handshake({
          protocolVersion: 1,
          clientId: "rejected_client",
          accessToken: "wrong_token",
          requestedDomains: ["assistant"]
        })
      ).rejects.toMatchObject({
        code: "unauthenticated",
        message: "Agent Host access token is invalid"
      })
    } finally {
      await rejectedTransport.close()
    }

    const acceptedTransport = createLocalAgentHostIpcClientTransport({
      socketPath: fixture.address
    })
    const acceptedClient = createAgentHostClient(
      acceptedTransport,
      requestIds("accepted")
    )
    try {
      await expect(
        acceptedClient.handshake({
          protocolVersion: 1,
          clientId: "accepted_client",
          accessToken: "correct_token",
          requestedDomains: ["assistant"]
        })
      ).resolves.toMatchObject({ host: { hostId: "host_authentication" } })
    } finally {
      await acceptedTransport.close()
      await server.close()
    }
  })

  it("rejects pending requests when the server disconnects", async () => {
    const fixture = await createIpcFixture("pending")
    let markStarted: () => void = () => undefined
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    let releaseOperation: () => void = () => undefined
    const operationReleased = new Promise<void>((resolve) => {
      releaseOperation = resolve
    })
    const server = await listenLocalAgentHostIpc({
      socketPath: fixture.address,
      createEndpoint: () =>
        createInProcessAgentHostEndpoint({
          host: host("pending"),
          capabilities: capabilities(),
          accessToken: "pending_token",
          handleOperation: async () => {
            markStarted()
            await operationReleased
            return { outcome: "completed", result: {} }
          },
          replayEvents: () => ({
            outcome: "replayed",
            page: page("pending_stream")
          }),
          subscribeEvents: () => () => undefined
        })
    })
    const transport = createLocalAgentHostIpcClientTransport({
      socketPath: fixture.address
    })
    const client = createAgentHostClient(transport, requestIds("pending"))

    await client.handshake({
      protocolVersion: 1,
      clientId: "pending_client",
      accessToken: "pending_token",
      requestedDomains: ["assistant"]
    })
    const pending = client.read({
      domain: "assistant",
      operation: "pending.read",
      payload: {}
    })
    await started
    await server.close()
    await expect(pending).rejects.toThrow("Agent Host transport failed")
    releaseOperation()
    await transport.close()
  })

  it("fails closed on malformed or oversized frames and accepts coalesced frames", async () => {
    const fixture = await createIpcFixture("framing")
    const maxFrameBytes = 512
    const server = await listenLocalAgentHostIpc({
      socketPath: fixture.address,
      maxFrameBytes,
      createEndpoint: () =>
        createInProcessAgentHostEndpoint({
          host: host("framing"),
          capabilities: capabilities(maxFrameBytes),
          accessToken: "framing_token",
          handleOperation: async (request) => ({
            outcome: "completed",
            result: { operation: request.operation }
          }),
          replayEvents: () => ({
            outcome: "replayed",
            page: page("framing_stream")
          }),
          subscribeEvents: () => () => undefined
        })
    })

    try {
      const malformed = await connectRaw(fixture.address)
      const malformedClosed = once(malformed, "close")
      malformed.write(frame(Buffer.from("{", "utf8")))
      await expect(readJsonFrames(malformed, 1)).resolves.toEqual([
        expect.objectContaining({
          kind: "wanex.agent-host.error",
          error: expect.objectContaining({ code: "malformed_request" })
        })
      ])
      await malformedClosed

      const oversized = await connectRaw(fixture.address)
      const oversizedClosed = once(oversized, "close")
      const oversizedHeader = Buffer.alloc(4)
      oversizedHeader.writeUInt32BE(maxFrameBytes + 1, 0)
      oversized.write(oversizedHeader)
      await expect(readJsonFrames(oversized, 1)).resolves.toEqual([
        expect.objectContaining({
          kind: "wanex.agent-host.error",
          error: expect.objectContaining({ code: "resource_limit" })
        })
      ])
      await oversizedClosed

      const coalesced = await connectRaw(fixture.address)
      coalesced.write(jsonFrame({
        kind: "wanex.agent-host.handshake.request",
        protocolVersion: 1,
        clientId: "raw_framing_client",
        accessToken: "framing_token",
        requestedDomains: ["assistant"]
      }))
      await expect(readJsonFrames(coalesced, 1)).resolves.toEqual([
        expect.objectContaining({ kind: "wanex.agent-host.handshake.response" })
      ])

      const first = jsonFrame(operationRequest("coalesced_1", "x".repeat(240)))
      const second = jsonFrame(operationRequest("coalesced_2", "y".repeat(240)))
      expect(first.byteLength).toBeLessThanOrEqual(maxFrameBytes + 4)
      expect(second.byteLength).toBeLessThanOrEqual(maxFrameBytes + 4)
      expect(first.byteLength + second.byteLength).toBeGreaterThan(
        maxFrameBytes + 4
      )
      coalesced.write(Buffer.concat([first, second]))
      const responses = await readJsonFrames(coalesced, 2)
      expect(responses).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ requestId: "coalesced_1" }),
          expect.objectContaining({ requestId: "coalesced_2" })
        ])
      )
      coalesced.destroy()
      await once(coalesced, "close")
    } finally {
      await server.close()
    }
  })
})

interface IpcFixture {
  readonly address: string
  readonly directory?: string
}

async function createIpcFixture(label: string): Promise<IpcFixture> {
  if (process.platform === "win32") {
    return { address: `\\\\.\\pipe\\wanex-${label}-${randomUUID()}` }
  }
  const directory = await mkdtemp(join(tmpdir(), `wanex-${label}-`))
  return { address: join(directory, "host.sock"), directory }
}

async function expectEndpointClosed(fixture: IpcFixture): Promise<void> {
  if (process.platform !== "win32") {
    await expect(stat(fixture.address)).rejects.toMatchObject({ code: "ENOENT" })
    expect((await stat(fixture.directory!)).mode & 0o077).toBe(0)
    return
  }
  await expect(connectRaw(fixture.address)).rejects.toBeInstanceOf(Error)
}

async function connectRaw(address: string): Promise<Socket> {
  const socket = createConnection(address)
  await new Promise<void>((resolve, reject) => {
    const onConnect = (): void => finish(undefined)
    const onError = (error: Error): void => finish(error)
    const finish = (error: Error | undefined): void => {
      socket.off("connect", onConnect)
      socket.off("error", onError)
      if (error === undefined) resolve()
      else reject(error)
    }
    socket.once("connect", onConnect)
    socket.once("error", onError)
  })
  return socket
}

function frame(payload: Buffer): Buffer {
  const header = Buffer.alloc(4)
  header.writeUInt32BE(payload.byteLength, 0)
  return Buffer.concat([header, payload])
}

function jsonFrame(value: object): Buffer {
  return frame(Buffer.from(JSON.stringify(value), "utf8"))
}

function operationRequest(requestId: string, text: string): object {
  return {
    kind: "wanex.agent-host.operation.request",
    operationKind: "read",
    requestId,
    domain: "assistant",
    operation: "coalesced.read",
    payload: { text }
  }
}

async function readJsonFrames(socket: Socket, count: number): Promise<unknown[]> {
  return await new Promise<unknown[]>((resolve, reject) => {
    let buffer = Buffer.alloc(0)
    const values: unknown[] = []
    const onData = (chunk: Buffer): void => {
      buffer = Buffer.concat([buffer, chunk])
      while (buffer.byteLength >= 4) {
        const size = buffer.readUInt32BE(0)
        if (buffer.byteLength < size + 4) return
        try {
          values.push(JSON.parse(buffer.subarray(4, size + 4).toString("utf8")))
        } catch (error) {
          finish(error instanceof Error ? error : new Error("invalid JSON frame"))
          return
        }
        buffer = buffer.subarray(size + 4)
        if (values.length === count) {
          finish(undefined)
          return
        }
      }
    }
    const onError = (error: Error): void => finish(error)
    const onClose = (): void => finish(new Error("socket closed before response"))
    const finish = (error: Error | undefined): void => {
      socket.off("data", onData)
      socket.off("error", onError)
      socket.off("close", onClose)
      if (error === undefined) resolve(values)
      else reject(error)
    }
    socket.on("data", onData)
    socket.once("error", onError)
    socket.once("close", onClose)
  })
}

function requestIds(prefix: string): () => string {
  let sequence = 0
  return () => `${prefix}_request_${++sequence}`
}

function host(label: string) {
  return {
    hostId: `host_${label}`,
    instanceId: `instance_${label}`,
    connectionKind: "local_ipc" as const,
    executionLocation: "local" as const
  }
}

function capabilities(maxFrameBytes = 1024 * 1024) {
  return {
    revision: 1 as const,
    domains: ["assistant"] as const,
    features: [
      "canonical_reads",
      "ordered_events",
      "event_replay",
      "idempotent_commands"
    ] as const,
    maxFrameBytes,
    maxEventPageSize: 100,
    eventReplay: "bounded" as const
  }
}

function page(streamId: string): AgentHostEventPage {
  return {
    streamId,
    events: [],
    earliestSequence: 0,
    latestSequence: 0,
    hasMore: false
  }
}

function createEvent(): AgentHostEvent {
  return {
    kind: "wanex.agent-host.event",
    streamId: "ipc_stream",
    sequence: 1,
    eventId: "ipc_event_1",
    domain: "assistant",
    type: "snapshot.changed",
    payload: { changed: true },
    occurredAt: 1
  }
}

async function eventually(assertion: () => void): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      assertion()
      return
    } catch (error) {
      if (attempt === 19) throw error
      await delay(5)
    }
  }
}
