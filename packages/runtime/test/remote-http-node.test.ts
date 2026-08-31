import { createServer, type Server } from "node:http"
import { describe, expect, it } from "vitest"
import type { AgentHostEvent } from "@wanex/protocol"
import {
  createInProcessAgentHostEndpoint,
  createRemoteAgentHostHttpHandler,
  createRemoteAgentHostNodeHttpAdapter,
  REMOTE_AGENT_HOST_MESSAGE_PATH,
  REMOTE_AGENT_HOST_SESSION_HEADER,
  REMOTE_AGENT_HOST_SSE_EVENT_PATH,
  type RemoteAgentHostHttpHandler
} from "../src/host/index.js"

describe("remote Agent Host Node HTTP adapter", () => {
  it("serves JSON messages and SSE events through real Node HTTP", async () => {
    const fixture = createFixture()
    const server = createServer((request, response) => {
      void fixture.adapter.handle(request, response).catch(() => response.destroy())
    })
    await listen(server)
    const address = server.address()
    if (address === null || typeof address === "string") {
      throw new Error("test server did not bind to a TCP address")
    }
    const baseUrl = `http://127.0.0.1:${address.port}`

    const handshake = await fetch(`${baseUrl}${REMOTE_AGENT_HOST_MESSAGE_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer bearer_token" },
      body: JSON.stringify(handshakeMessage())
    })
    expect(handshake.status).toBe(200)
    const sessionId = handshake.headers.get(REMOTE_AGENT_HOST_SESSION_HEADER)
    expect(sessionId).toBe("session_1")

    const events = new AbortController()
    const eventResponse = await fetch(
      `${baseUrl}${REMOTE_AGENT_HOST_SSE_EVENT_PATH}`,
      {
        headers: {
          accept: "text/event-stream",
          authorization: "Bearer bearer_token",
          [REMOTE_AGENT_HOST_SESSION_HEADER]: sessionId!
        },
        signal: events.signal
      }
    )
    expect(eventResponse.status).toBe(200)
    expect(eventResponse.headers.get("content-type")).toContain(
      "text/event-stream"
    )
    expect(eventResponse.headers.get("cache-control")).toBe("no-store")

    const reader = eventResponse.body?.getReader()
    expect(reader).toBeDefined()
    fixture.publishEvent(event(1))
    const chunk = await reader!.read()
    expect(chunk.done).toBe(false)
    const text = new TextDecoder().decode(chunk.value)
    expect(text).toContain("event: agent_host_event")
    expect(text).toContain("id: remote_stream:1")
    expect(text).toContain('"sequence":1')

    events.abort()
    await reader!.cancel().catch(() => undefined)
    await waitFor(() => fixture.eventSubscriberCount === 0)
    await fixture.handler.close()
    await closeServer(server)
  })

  it("rejects invalid JSON before invoking the framework-neutral handler", async () => {
    const fixture = createFixture()
    const server = createServer((request, response) => {
      void fixture.adapter.handle(request, response).catch(() => response.destroy())
    })
    await listen(server)
    const address = server.address()
    if (address === null || typeof address === "string") {
      throw new Error("test server did not bind to a TCP address")
    }

    const response = await fetch(
      `http://127.0.0.1:${address.port}${REMOTE_AGENT_HOST_MESSAGE_PATH}`,
      {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer bearer_token" },
        body: "not-json"
      }
    )
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "malformed_request" }
    })
    await fixture.handler.close()
    await closeServer(server)
  })
})

function createFixture() {
  const sourceListeners = new Set<(event: AgentHostEvent) => void>()
  let endpointSequence = 0
  const handler: RemoteAgentHostHttpHandler = createRemoteAgentHostHttpHandler({
    authenticateBearerToken: async (token) =>
      token === "bearer_token"
        ? { subjectId: "subject_1", expiresAt: Date.now() + 60_000 }
        : null,
    resolveHost: async () => ({
      host: {
        hostId: "host_1",
        instanceId: "instance_1",
        connectionKind: "remote_tls",
        executionLocation: "remote"
      },
      grant: {
        subjectId: "subject_1",
        hostId: "host_1",
        domains: ["assistant"],
        expiresAt: Date.now() + 60_000
      },
      createEndpoint: (accessToken) => {
        const endpoint = createInProcessAgentHostEndpoint({
          host: {
            hostId: "host_1",
            instanceId: "instance_1",
            connectionKind: "remote_tls",
            executionLocation: "remote"
          },
          capabilities: {
            revision: 1,
            domains: ["assistant"],
            features: ["canonical_reads", "ordered_events", "event_replay"],
            maxFrameBytes: 1024 * 1024,
            maxEventPageSize: 100,
            eventReplay: "bounded"
          },
          accessToken,
          handleOperation: async () => ({
            outcome: "completed",
            result: { ok: true }
          }),
          replayEvents: () => ({
            outcome: "replayed",
            page: {
              streamId: "remote_stream",
              events: [],
              earliestSequence: 0,
              latestSequence: 0,
              hasMore: false
            }
          }),
          subscribeEvents: (listener) => {
            sourceListeners.add(listener)
            return () => sourceListeners.delete(listener)
          }
        })
        return {
          send: endpoint.send,
          subscribe: endpoint.subscribe,
          close: endpoint.close
        }
      }
    }),
    createSessionId: () => `session_${++endpointSequence}`,
    createEndpointAccessToken: () => `endpoint_secret_${endpointSequence}`
  })
  return {
    handler,
    adapter: createRemoteAgentHostNodeHttpAdapter({ handler }),
    get eventSubscriberCount() {
      return sourceListeners.size
    },
    publishEvent(value: AgentHostEvent) {
      for (const listener of sourceListeners) listener(value)
    }
  }
}

function handshakeMessage() {
  return {
    kind: "wanex.agent-host.handshake.request" as const,
    protocolVersion: 1 as const,
    clientId: "client_1",
    accessToken: "external_handshake_value",
    requestedDomains: ["assistant"] as const
  }
}

function event(sequence: number): AgentHostEvent {
  return {
    kind: "wanex.agent-host.event",
    streamId: "remote_stream",
    sequence,
    eventId: `event_${sequence}`,
    domain: "assistant",
    type: "assistant.test.updated",
    payload: { sequence },
    occurredAt: sequence
  }
}

async function listen(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen({ host: "127.0.0.1", port: 0 }, () => resolve())
  })
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)))
  })
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 1_000
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("test condition timed out")
    await new Promise<void>((resolve) => setTimeout(resolve, 1))
  }
}
