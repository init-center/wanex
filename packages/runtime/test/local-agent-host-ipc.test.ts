import { mkdtemp, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
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

const unixOnly = describe.skipIf(process.platform === "win32")
const windowsOnly = describe.skipIf(process.platform !== "win32")

unixOnly("local Agent Host IPC", () => {
  it("round-trips concurrent operations, events, replay, and private socket cleanup", async () => {
    const directory = await mkdtemp(join(tmpdir(), "wanex-agent-host-ipc-"))
    const socketPath = join(directory, "host.sock")
    const sourceListeners = new Set<(event: AgentHostEvent) => void>()
    let operationCount = 0
    const server = await listenLocalAgentHostIpc({
      socketPath,
      createEndpoint: () =>
        createInProcessAgentHostEndpoint({
          host: {
            hostId: "host_ipc",
            instanceId: "instance_ipc",
            connectionKind: "local_ipc",
            executionLocation: "local"
          },
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
    expect((await stat(socketPath)).mode & 0o777).toBe(0o600)
    const transport = createLocalAgentHostIpcClientTransport({ socketPath })
    const client = createAgentHostClient(transport, (() => {
      let sequence = 0
      return () => `ipc_request_${++sequence}`
    })())

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
      expect(slow).toMatchObject({
        requestId: "ipc_request_1",
        result: { operation: "slow.read" }
      })
      expect(fast).toMatchObject({
        requestId: "ipc_request_2",
        result: { operation: "fast.read" }
      })
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

    await expect(stat(socketPath)).rejects.toMatchObject({ code: "ENOENT" })
    const mode = (await stat(directory)).mode & 0o777
    expect(mode & 0o077).toBe(0)
  })

  it("fails handshake with an invalid per-launch access token", async () => {
    const directory = await mkdtemp(join(tmpdir(), "wanex-agent-host-auth-"))
    const socketPath = join(directory, "host.sock")
    const server = await listenLocalAgentHostIpc({
      socketPath,
      createEndpoint: () =>
        createInProcessAgentHostEndpoint({
          host: {
            hostId: "host_auth",
            instanceId: "instance_auth",
            connectionKind: "local_ipc",
            executionLocation: "local"
          },
          capabilities: capabilities(),
          accessToken: "correct_token",
          handleOperation: async () => ({
            outcome: "completed",
            result: {}
          }),
          replayEvents: () => ({
            outcome: "replayed",
            page: page("auth_stream")
          }),
          subscribeEvents: () => () => undefined
        })
    })
    const transport = createLocalAgentHostIpcClientTransport({ socketPath })
    const client = createAgentHostClient(transport, () => "auth_request")

    try {
      await expect(
        client.handshake({
          protocolVersion: 1,
          clientId: "auth_client",
          accessToken: "wrong_token",
          requestedDomains: ["assistant"]
        })
      ).rejects.toMatchObject({
        code: "unauthenticated",
        message: "Agent Host access token is invalid"
      })
    } finally {
      await transport.close()
      await server.close()
    }
  })
})

windowsOnly("Windows Agent Host named pipe IPC", () => {
  it("round-trips operations and cleans up the named pipe", async () => {
    const pipeName = `\\\\.\\pipe\\wanex-agent-host-${process.pid}-${Date.now()}`
    let operationCount = 0
    const server = await listenLocalAgentHostIpc({
      socketPath: pipeName,
      createEndpoint: () =>
        createInProcessAgentHostEndpoint({
          host: {
            hostId: "host_windows_pipe",
            instanceId: "instance_windows_pipe",
            connectionKind: "local_ipc",
            executionLocation: "local"
          },
          capabilities: capabilities(),
          accessToken: "windows_pipe_token",
          handleOperation: async (request) => {
            operationCount += 1
            return {
              outcome: "completed",
              result: { operation: request.operation, count: operationCount }
            }
          },
          replayEvents: (request) => ({
            outcome: "replayed",
            page: page(request.streamId)
          }),
          subscribeEvents: () => () => undefined
        })
    })
    const transport = createLocalAgentHostIpcClientTransport({
      socketPath: pipeName
    })
    const client = createAgentHostClient(transport, () => "windows_request")

    try {
      await expect(
        client.handshake({
          protocolVersion: 1,
          clientId: "windows_client",
          accessToken: "windows_pipe_token",
          requestedDomains: ["assistant"]
        })
      ).resolves.toMatchObject({
        host: { connectionKind: "local_ipc" }
      })
      await expect(
        client.read({
          domain: "assistant",
          operation: "windows.read",
          payload: {}
        })
      ).resolves.toMatchObject({
        outcome: "completed",
        result: { operation: "windows.read", count: 1 }
      })
    } finally {
      await transport.close()
      await server.close()
    }
  })
})

function capabilities() {
  return {
    revision: 1 as const,
    domains: ["assistant"] as const,
    features: [
      "canonical_reads",
      "ordered_events",
      "event_replay",
      "idempotent_commands"
    ] as const,
    maxFrameBytes: 1024 * 1024,
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
