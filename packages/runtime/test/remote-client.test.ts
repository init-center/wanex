import { describe, expect, it } from "vitest"
import {
  createAgentHostClient,
  type AgentHostClientMessage,
  type AgentHostServerMessage
} from "@wanex/protocol"
import {
  createRemoteAgentHostHttpClientTransport,
  type RemoteAgentHostHttpClientOptions
} from "../src/host/index.js"

describe("remote Agent Host HTTP client transport", () => {
  it("sends the existing protocol over HTTPS and refreshes bearer auth per request", async () => {
    const requests: Array<{ readonly init: RequestInit; readonly url: string }> = []
    const bearerTokens = ["bearer_1", "bearer_2", "bearer_3"]
    const transport = createTransport(async (input, init) => {
      requests.push({ url: String(input), init: init ?? {} })
      const message = JSON.parse(String(init?.body)) as AgentHostClientMessage
      if (message.kind === "wanex.agent-host.handshake.request") {
        return jsonResponse(handshakeResponse(), 200, {
          "x-wanex-host-session": "session_1"
        })
      }
      if (message.kind === "wanex.agent-host.events.replay.request") {
        return jsonResponse(replayResponse(message.requestId))
      }
      return jsonResponse(operationResponse(message.requestId))
    }, {
      getBearerToken: () => {
        const token = bearerTokens.shift()
        if (token === undefined) throw new Error("test bearer exhausted")
        return token
      }
    })
    const client = createAgentHostClient(transport, requestIds())

    await expect(
      client.handshake({
        protocolVersion: 1,
        clientId: "client_1",
        accessToken: "protocol_handshake_value",
        requestedDomains: ["assistant"]
      })
    ).resolves.toMatchObject({ host: { hostId: "host_1" } })
    await expect(
      client.read({ domain: "assistant", operation: "assistant.read", payload: {} })
    ).resolves.toMatchObject({ requestId: "request_1", outcome: "completed" })
    await expect(
      client.replay({
        streamId: "remote_stream",
        afterSequence: 0,
        limit: 10
      })
    ).resolves.toMatchObject({
      requestId: "request_2",
      outcome: "replayed"
    })

    expect(requests).toHaveLength(3)
    expect(requests[0]?.url).toBe(
      "https://host.example/v1/agent-host/message"
    )
    expect(requests[0]?.init.headers).toMatchObject({
      authorization: "Bearer bearer_1",
      "content-type": "application/json"
    })
    expect(requests[1]?.init.headers).toMatchObject({
      authorization: "Bearer bearer_2",
      "content-type": "application/json",
      "x-wanex-host-session": "session_1"
    })
    expect(requests[2]?.init.headers).toMatchObject({
      authorization: "Bearer bearer_3",
      "content-type": "application/json",
      "x-wanex-host-session": "session_1"
    })
    expect(JSON.parse(String(requests[0]?.init.body))).not.toMatchObject({
      accessToken: "bearer_1"
    })
  })

  it("requires a handshake and rejects concurrent or repeated handshakes", async () => {
    let releaseFetch: () => void = () => undefined
    const fetchGate = new Promise<void>((resolve) => {
      releaseFetch = resolve
    })
    let fetchStarted: () => void = () => undefined
    const started = new Promise<void>((resolve) => {
      fetchStarted = resolve
    })
    const transport = createTransport(async () => {
      fetchStarted()
      await fetchGate
      return jsonResponse(handshakeResponse(), 200, {
        "x-wanex-host-session": "session_1"
      })
    })

    await expect(transport.send(operationMessage("request_1"))).rejects.toThrow(
      "handshake is required"
    )
    const firstHandshake = transport.send(handshakeMessage())
    await started
    await expect(transport.send(handshakeMessage())).rejects.toThrow(
      "handshake is already established"
    )
    releaseFetch()
    await expect(firstHandshake).resolves.toMatchObject({
      kind: "wanex.agent-host.handshake.response"
    })
    await expect(transport.send(handshakeMessage())).rejects.toThrow(
      "handshake is already established"
    )
  })

  it("does not install a session after a protocol handshake error", async () => {
    let calls = 0
    const transport = createTransport(async () => {
      calls += 1
      if (calls === 1) {
        return jsonResponse(errorResponse("unauthenticated"), 401)
      }
      return jsonResponse(handshakeResponse(), 200, {
        "x-wanex-host-session": "session_2"
      })
    })
    const client = createAgentHostClient(transport, requestIds())

    await expect(client.handshake(handshakeInput())).rejects.toMatchObject({
      code: "unauthenticated"
    })
    await expect(client.handshake(handshakeInput())).resolves.toMatchObject({
      host: { hostId: "host_1" }
    })
  })

  it("clears a stale session after an unauthenticated operation response", async () => {
    let calls = 0
    const transport = createTransport(async (input, init) => {
      calls += 1
      const message = JSON.parse(String(init?.body)) as AgentHostClientMessage
      if (message.kind === "wanex.agent-host.handshake.request") {
        return jsonResponse(handshakeResponse(), 200, {
          "x-wanex-host-session": `session_${calls}`
        })
      }
      return jsonResponse(errorResponse("unauthenticated", message.requestId), 401)
    })
    const client = createAgentHostClient(transport, requestIds())
    await client.handshake(handshakeInput())

    await expect(
      client.read({ domain: "assistant", operation: "assistant.read", payload: {} })
    ).rejects.toMatchObject({ code: "unauthenticated" })
    await expect(
      client.handshake(handshakeInput())
    ).resolves.toMatchObject({ host: { hostId: "host_1" } })
    expect(calls).toBe(3)
  })

  it("bounds request and streamed response bodies before protocol use", async () => {
    let fetchCalls = 0
    const requestLimited = createTransport(
      async () => {
        fetchCalls += 1
        return jsonResponse(handshakeResponse())
      },
      { limits: { maxBodyBytes: 64 } }
    )
    await expect(requestLimited.send(handshakeMessage())).rejects.toThrow(
      "request body exceeds"
    )
    expect(fetchCalls).toBe(0)

    const responseLimited = createTransport(
      async () =>
        jsonResponse(handshakeResponse(), 200, {
          "content-length": "1024"
        }),
      { limits: { maxResponseBytes: 128 } }
    )
    await expect(responseLimited.send(handshakeMessage())).rejects.toThrow(
      "response exceeds"
    )

    const streamedResponseLimited = createTransport(
      async () =>
        new Response(JSON.stringify(handshakeResponse()), {
          headers: { "content-type": "application/json" }
        }),
      { limits: { maxResponseBytes: 128 } }
    )
    await expect(streamedResponseLimited.send(handshakeMessage())).rejects.toThrow(
      "response exceeds"
    )
  })

  it("uses a request deadline and aborts without retrying", async () => {
    let fetchCalls = 0
    let signal: AbortSignal | undefined
    const transport = createTransport(
      async (_input, init) => {
        fetchCalls += 1
        signal = init?.signal ?? undefined
        await new Promise<void>((resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new Error("aborted"))
          })
          init?.signal?.addEventListener("abort", () => resolve())
        })
        return jsonResponse(handshakeResponse())
      },
      { limits: { requestTimeoutMs: 10 } }
    )

    await expect(transport.send(handshakeMessage())).rejects.toThrow("timed out")
    expect(fetchCalls).toBe(1)
    expect(signal?.aborted).toBe(true)
  })

  it("returns fetch failures without retrying the request", async () => {
    let fetchCalls = 0
    const transport = createTransport(async () => {
      fetchCalls += 1
      throw new Error("network unavailable")
    })

    await expect(transport.send(handshakeMessage())).rejects.toThrow(
      "network unavailable"
    )
    expect(fetchCalls).toBe(1)
  })

  it("aborts pending requests on close and forgets the session", async () => {
    let signal: AbortSignal | undefined
    const transport = createTransport(async (_input, init) => {
      signal = init?.signal ?? undefined
      await new Promise<void>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))
      })
      return jsonResponse(handshakeResponse())
    })
    const pending = transport.send(handshakeMessage())
    await waitFor(() => signal !== undefined)
    await transport.close()
    await expect(pending).rejects.toThrow("client is closed")
    await expect(transport.send(handshakeMessage())).rejects.toThrow(
      "client is closed"
    )
  })

  it("rejects unsafe URLs and bearer header values before network I/O", async () => {
    expect(() =>
      createTransport(async () => jsonResponse(handshakeResponse()), {
        messageUrl: "http://host.example/v1/agent-host/message"
      })
    ).toThrow("HTTPS message endpoint")
    expect(() =>
      createTransport(async () => jsonResponse(handshakeResponse()), {
        messageUrl: "https://host.example/v1/agent-host/message?token=bad"
      })
    ).toThrow("HTTPS message endpoint")

    const transport = createTransport(
      async () => jsonResponse(handshakeResponse()),
      { getBearerToken: () => "bad\r\nvalue" }
    )
    await expect(transport.send(handshakeMessage())).rejects.toThrow(
      "bearer token is invalid"
    )
  })

  it("reserves a request id before awaiting bearer resolution", async () => {
    let releaseToken: () => void = () => undefined
    const tokenGate = new Promise<void>((resolve) => {
      releaseToken = resolve
    })
    let tokenStarted: () => void = () => undefined
    const started = new Promise<void>((resolve) => {
      tokenStarted = resolve
    })
    let tokenCalls = 0
    let fetchCalls = 0
    const transport = createTransport(
      async (_input, init) => {
        fetchCalls += 1
        if (fetchCalls === 1) {
          return jsonResponse(handshakeResponse(), 200, {
            "x-wanex-host-session": "session_1"
          })
        }
        expect(init?.headers).toMatchObject({
          "x-wanex-host-session": "session_1"
        })
        return jsonResponse(operationResponse("request_1"))
      },
      {
        getBearerToken: async () => {
          tokenCalls += 1
          if (tokenCalls === 2) {
            tokenStarted()
            await tokenGate
          }
          return "bearer"
        }
      }
    )
    await transport.send(handshakeMessage())
    const first = transport.send(operationMessage("request_1"))
    await started
    await expect(transport.send(operationMessage("request_1"))).rejects.toThrow(
      "request is already pending"
    )
    releaseToken()
    await expect(first).resolves.toMatchObject({ requestId: "request_1" })
  })

  it("rejects a successful protocol payload under a non-success HTTP status", async () => {
    const transport = createTransport(async () =>
      jsonResponse(handshakeResponse(), 401, {
        "x-wanex-host-session": "session_1"
      })
    )
    await expect(transport.send(handshakeMessage())).rejects.toThrow(
      "response status is invalid"
    )
  })
})

function createTransport(
  fetchImpl: typeof globalThis.fetch,
  overrides: Partial<RemoteAgentHostHttpClientOptions> = {}
) {
  return createRemoteAgentHostHttpClientTransport({
    messageUrl: "https://host.example/v1/agent-host/message",
    getBearerToken: () => "bearer",
    fetch: fetchImpl,
    ...overrides
  })
}

function jsonResponse(
  body: AgentHostServerMessage,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers }
  })
}

function handshakeInput() {
  return {
    protocolVersion: 1 as const,
    clientId: "client_1",
    accessToken: "protocol_handshake_value",
    requestedDomains: ["assistant"] as const
  }
}

function handshakeMessage(): AgentHostClientMessage {
  return { kind: "wanex.agent-host.handshake.request", ...handshakeInput() }
}

function operationMessage(requestId: string): AgentHostClientMessage {
  return {
    kind: "wanex.agent-host.operation.request",
    operationKind: "read",
    requestId,
    domain: "assistant",
    operation: "assistant.read",
    payload: {}
  }
}

function handshakeResponse(): AgentHostServerMessage {
  return {
    kind: "wanex.agent-host.handshake.response",
    protocolVersion: 1,
    connectionId: "remote_connection_1",
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
      maxFrameBytes: 4 * 1024 * 1024,
      maxEventPageSize: 100,
      eventReplay: "bounded"
    }
  }
}

function operationResponse(requestId: string): AgentHostServerMessage {
  return {
    kind: "wanex.agent-host.operation.response",
    requestId,
    operationKind: "read",
    outcome: "completed",
    result: { ok: true }
  }
}

function replayResponse(requestId: string): AgentHostServerMessage {
  return {
    kind: "wanex.agent-host.events.replay.response",
    requestId,
    outcome: "replayed",
    page: {
      streamId: "remote_stream",
      events: [],
      earliestSequence: 0,
      latestSequence: 0,
      hasMore: false
    }
  }
}

function errorResponse(
  code: "unauthenticated",
  requestId?: string
): AgentHostServerMessage {
  return {
    kind: "wanex.agent-host.error",
    ...(requestId === undefined ? {} : { requestId }),
    error: { code, message: "not authenticated", retryable: false }
  }
}

function requestIds() {
  let sequence = 0
  return () => `request_${++sequence}`
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 1_000
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("test condition timed out")
    await new Promise<void>((resolve) => setTimeout(resolve, 1))
  }
}
