import { setTimeout as delay } from "node:timers/promises"
import { describe, expect, it } from "vitest"
import {
  createRemoteAgentHostHttpHandler,
  REMOTE_AGENT_HOST_MESSAGE_PATH,
  REMOTE_AGENT_HOST_SESSION_HEADER,
  type RemoteAgentHostHttpHandler,
  type RemoteAgentHostHttpRequest
} from "../src/host/index.js"
import { createInProcessAgentHostEndpoint } from "../src/host/index.js"

describe("remote Agent Host HTTP handler", () => {
  it("authenticates each request and isolates the endpoint from the bearer", async () => {
    const fixture = createFixture()
    const handshake = await fixture.handler.handle(
      request(handshakeMessage(), "Bearer bearer_token")
    )

    expect(handshake.status).toBe(200)
    expect(handshake.body).toMatchObject({
      kind: "wanex.agent-host.handshake.response",
      host: { hostId: "host_1", connectionKind: "remote_tls" }
    })
    const sessionId = handshake.headers[REMOTE_AGENT_HOST_SESSION_HEADER]
    expect(sessionId).toBe("session_1")
    expect(fixture.endpointSecrets).toEqual(["endpoint_secret_1"])
    expect(fixture.endpointSecrets).not.toContain("bearer_token")

    const operation = await fixture.handler.handle(
      request(
        operationMessage("request_1", "assistant.read"),
        "Bearer bearer_token",
        sessionId
      )
    )
    expect(operation.status).toBe(200)
    expect(operation.body).toMatchObject({
      kind: "wanex.agent-host.operation.response",
      requestId: "request_1",
      outcome: "completed",
      result: { operation: "assistant.read" }
    })
    expect(fixture.authenticatedTokens).toEqual([
      "bearer_token",
      "bearer_token"
    ])
    expect(fixture.operationCalls).toEqual(["assistant.read"])
  })

  it("rejects missing credentials, wrong routes, and top-level store selectors", async () => {
    const fixture = createFixture()
    const missing = await fixture.handler.handle({
      ...request(handshakeMessage()),
      path: REMOTE_AGENT_HOST_MESSAGE_PATH
    })
    expect(missing.status).toBe(401)
    expect(fixture.authenticatedTokens).toEqual([])

    const wrongPath = await fixture.handler.handle({
      ...request(handshakeMessage(), "Bearer bearer_token"),
      path: "/v1/other"
    })
    expect(wrongPath.status).toBe(404)

    const selector = await fixture.handler.handle(
      request(
        {
          ...handshakeMessage(),
          storeDir: "/tmp/should-not-reach-composition"
        } as unknown,
        "Bearer bearer_token"
      )
    )
    expect(selector.status).toBe(400)
    expect(selector.body).toMatchObject({ error: { code: "malformed_request" } })
    expect(fixture.endpointSecrets).toEqual([])
  })

  it("requires a valid session and never lets a session replace bearer auth", async () => {
    const fixture = createFixture()
    const operation = operationMessage("request_1", "assistant.read")
    const missingSession = await fixture.handler.handle(
      request(operation, "Bearer bearer_token")
    )
    expect(missingSession.status).toBe(401)

    const handshake = await fixture.handler.handle(
      request(handshakeMessage(), "Bearer bearer_token")
    )
    const sessionId = handshake.headers[REMOTE_AGENT_HOST_SESSION_HEADER]
    fixture.revoked = true
    const revoked = await fixture.handler.handle(
      request(operation, "Bearer bearer_token", sessionId)
    )
    expect(revoked.status).toBe(401)
    expect(revoked.body).toMatchObject({ error: { code: "unauthenticated" } })
    expect(fixture.closeCalls).toBe(1)
  })

  it("closes a session when its bearer credential is missing or unavailable", async () => {
    const fixture = createFixture()
    const handshake = await fixture.handler.handle(
      request(handshakeMessage(), "Bearer bearer_token")
    )
    const sessionId = handshake.headers[REMOTE_AGENT_HOST_SESSION_HEADER]

    const missing = await fixture.handler.handle(
      request(
        operationMessage("request_1", "assistant.read"),
        undefined,
        sessionId
      )
    )
    expect(missing.status).toBe(401)
    expect(fixture.closeCalls).toBe(1)

    const afterClose = await fixture.handler.handle(
      request(
        operationMessage("request_2", "assistant.read"),
        "Bearer bearer_token",
        sessionId
      )
    )
    expect(afterClose.status).toBe(401)
  })

  it("fails closed when the authentication adapter is unavailable", async () => {
    const fixture = createFixture()
    const handshake = await fixture.handler.handle(
      request(handshakeMessage(), "Bearer bearer_token")
    )
    const sessionId = handshake.headers[REMOTE_AGENT_HOST_SESSION_HEADER]
    fixture.authenticationFailure = true

    const response = await fixture.handler.handle(
      request(
        operationMessage("request_1", "assistant.read"),
        "Bearer bearer_token",
        sessionId
      )
    )
    expect(response.status).toBe(503)
    expect(response.body).toMatchObject({
      error: { code: "application_failure" }
    })
    expect(fixture.closeCalls).toBe(1)
  })

  it("closes a session when re-authentication resolves a different subject", async () => {
    const fixture = createFixture()
    const handshake = await fixture.handler.handle(
      request(handshakeMessage(), "Bearer bearer_token")
    )
    const sessionId = handshake.headers[REMOTE_AGENT_HOST_SESSION_HEADER]
    fixture.subjectId = "subject_2"

    const response = await fixture.handler.handle(
      request(
        operationMessage("request_1", "assistant.read"),
        "Bearer bearer_token",
        sessionId
      )
    )
    expect(response.status).toBe(401)
    expect(response.body).toMatchObject({
      error: { code: "unauthenticated" }
    })
    expect(fixture.closeCalls).toBe(1)
  })

  it("enforces grant domains at handshake and on every operation", async () => {
    const fixture = createFixture({ grantDomains: ["assistant"] })
    const deniedHandshake = await fixture.handler.handle(
      request(
        handshakeMessage(["coding"]),
        "Bearer bearer_token"
      )
    )
    expect(deniedHandshake.status).toBe(403)
    expect(fixture.endpointSecrets).toEqual([])

    const handshake = await fixture.handler.handle(
      request(handshakeMessage(), "Bearer bearer_token")
    )
    const sessionId = handshake.headers[REMOTE_AGENT_HOST_SESSION_HEADER]
    const deniedOperation = await fixture.handler.handle(
      request(
        operationMessage("request_1", "coding.read", "coding"),
        "Bearer bearer_token",
        sessionId
      )
    )
    expect(deniedOperation.status).toBe(403)
    expect(deniedOperation.body).toMatchObject({ error: { code: "unauthorized" } })
    expect(fixture.operationCalls).toEqual([])
  })

  it("closes an expired session before dispatching another request", async () => {
    const fixture = createFixture({ grantExpiresAt: 1_500 })
    const handshake = await fixture.handler.handle(
      request(handshakeMessage(), "Bearer bearer_token", undefined, 1_000)
    )
    const sessionId = handshake.headers[REMOTE_AGENT_HOST_SESSION_HEADER]
    const expired = await fixture.handler.handle(
      request(
        operationMessage("request_1", "assistant.read"),
        "Bearer bearer_token",
        sessionId,
        1_500
      )
    )
    expect(expired.status).toBe(403)
    expect(expired.body).toMatchObject({ error: { code: "unauthorized" } })
    expect(fixture.closeCalls).toBe(1)
    expect(fixture.operationCalls).toEqual([])
  })

  it("bounds sessions and in-flight requests independently", async () => {
    let releaseOperation: () => void = () => undefined
    const operationReleased = new Promise<void>((resolve) => {
      releaseOperation = resolve
    })
    let operationStarted: () => void = () => undefined
    const started = new Promise<void>((resolve) => {
      operationStarted = resolve
    })
    const fixture = createFixture({
      maxSessions: 1,
      maxInFlightRequests: 1,
      handleOperation: async (operation) => {
        operationStarted()
        await operationReleased
        return { outcome: "completed", result: { operation } }
      }
    })
    const firstHandshake = await fixture.handler.handle(
      request(handshakeMessage(), "Bearer bearer_token")
    )
    const sessionId = firstHandshake.headers[REMOTE_AGENT_HOST_SESSION_HEADER]
    const secondHandshake = await fixture.handler.handle(
      request(handshakeMessage(), "Bearer bearer_token")
    )
    expect(secondHandshake.status).toBe(429)

    const firstOperation = fixture.handler.handle(
      request(
        operationMessage("request_1", "assistant.slow"),
        "Bearer bearer_token",
        sessionId
      )
    )
    await started
    const secondOperation = await fixture.handler.handle(
      request(
        operationMessage("request_2", "assistant.fast"),
        "Bearer bearer_token",
        sessionId
      )
    )
    expect(secondOperation.status).toBe(429)
    releaseOperation()
    await expect(firstOperation).resolves.toMatchObject({ status: 200 })
    expect(fixture.operationCalls).toEqual(["assistant.slow"])
  })

  it("reserves session capacity while a handshake is pending", async () => {
    let releaseResolve: () => void = () => undefined
    const resolveGate = new Promise<void>((resolve) => {
      releaseResolve = resolve
    })
    let resolveStarted: () => void = () => undefined
    const started = new Promise<void>((resolve) => {
      resolveStarted = resolve
    })
    const fixture = createFixture({
      maxSessions: 1,
      resolveHostGate: resolveGate,
      resolveHostStarted: resolveStarted
    })

    const firstHandshake = fixture.handler.handle(
      request(handshakeMessage(), "Bearer bearer_token")
    )
    await started
    const secondHandshake = await fixture.handler.handle(
      request(handshakeMessage(), "Bearer bearer_token")
    )
    expect(secondHandshake.status).toBe(429)

    releaseResolve()
    await expect(firstHandshake).resolves.toMatchObject({ status: 200 })
  })

  it("fails closed on oversized request/response bodies", async () => {
    const requestFixture = createFixture({ maxBodyBytes: 128 })
    const requestResponse = await requestFixture.handler.handle(
      request(handshakeMessage(), "Bearer bearer_token")
    )
    expect(requestResponse.status).toBe(413)
    expect(requestFixture.endpointSecrets).toEqual([])

    const handshakeLimitFixture = createFixture({ maxResponseBytes: 128 })
    const oversizedHandshake = await handshakeLimitFixture.handler.handle(
      request(handshakeMessage(), "Bearer bearer_token")
    )
    expect(oversizedHandshake.status).toBe(500)
    expect(oversizedHandshake.body).toMatchObject({
      error: { code: "resource_limit" }
    })
    expect(handshakeLimitFixture.closeCalls).toBe(1)

    const responseFixture = createFixture({
      maxResponseBytes: 1_024,
      operationResult: "x".repeat(1_000)
    })
    const handshake = await responseFixture.handler.handle(
      request(handshakeMessage(), "Bearer bearer_token")
    )
    const sessionId = handshake.headers[REMOTE_AGENT_HOST_SESSION_HEADER]
    const response = await responseFixture.handler.handle(
      request(
        operationMessage("request_1", "assistant.large"),
        "Bearer bearer_token",
        sessionId
      )
    )
    expect(response.status).toBe(500)
    expect(response.body).toMatchObject({ error: { code: "resource_limit" } })
    expect(responseFixture.closeCalls).toBe(1)
  })

  it("uses parsed body size when a transport reports an understated size", async () => {
    const fixture = createFixture({ maxBodyBytes: 128 })
    const response = await fixture.handler.handle({
      ...request(handshakeMessage(), "Bearer bearer_token"),
      bodyBytes: 0
    })
    expect(response.status).toBe(413)
    expect(fixture.endpointSecrets).toEqual([])
  })

  it("prunes expired idle sessions when admitting a new handshake", async () => {
    const fixture = createFixture({
      maxSessions: 1,
      subjectExpiresAt: 1_500,
      grantExpiresAt: 4_000
    })
    const firstHandshake = await fixture.handler.handle(
      request(handshakeMessage(), "Bearer bearer_token")
    )
    expect(firstHandshake.status).toBe(200)

    fixture.subjectExpiresAt = 4_000
    fixture.nowMs = 2_000
    const secondHandshake = await fixture.handler.handle(
      request(handshakeMessage(), "Bearer bearer_token")
    )
    expect(secondHandshake.status).toBe(200)
    expect(fixture.closeCalls).toBe(1)
  })

  it("rejects malformed opaque session headers before session lookup", async () => {
    const fixture = createFixture()
    const response = await fixture.handler.handle(
      request(
        operationMessage("request_1", "assistant.read"),
        "Bearer bearer_token",
        "x".repeat(201)
      )
    )
    expect(response.status).toBe(401)
    expect(fixture.operationCalls).toEqual([])
  })

  it("closes every live endpoint exactly once when the handler closes", async () => {
    const fixture = createFixture()
    await fixture.handler.handle(request(handshakeMessage(), "Bearer bearer_token"))
    await fixture.handler.close()
    await fixture.handler.close()
    expect(fixture.closeCalls).toBe(1)
  })
})

interface FixtureOptions {
  readonly grantDomains?: readonly ("assistant" | "coding")[]
  readonly grantExpiresAt?: number
  readonly maxBodyBytes?: number
  readonly maxResponseBytes?: number
  readonly maxSessions?: number
  readonly maxInFlightRequests?: number
  readonly operationResult?: string
  readonly subjectExpiresAt?: number
  readonly resolveHostGate?: Promise<void>
  readonly resolveHostStarted?: () => void
  readonly handleOperation?: (
    operation: string
  ) => Promise<{ outcome: "completed"; result: { readonly operation: string } }>
}

function createFixture(options: FixtureOptions = {}) {
  const authenticatedTokens: string[] = []
  const endpointSecrets: string[] = []
  const operationCalls: string[] = []
  let closeCalls = 0
  let revoked = false
  let authenticationFailure = false
  let subjectId = "subject_1"
  let subjectExpiresAt = options.subjectExpiresAt ?? 2_000
  let nowMs = 1_000
  let sessionSequence = 0
  const handler: RemoteAgentHostHttpHandler = createRemoteAgentHostHttpHandler({
    authenticateBearerToken: async (token) => {
      authenticatedTokens.push(token)
      if (authenticationFailure) throw new Error("authentication unavailable")
      if (revoked || token !== "bearer_token") return null
      return { subjectId, expiresAt: subjectExpiresAt }
    },
    resolveHost: async () => {
      options.resolveHostStarted?.()
      if (options.resolveHostGate !== undefined) await options.resolveHostGate
      return {
        host: remoteHost(),
        grant: {
          subjectId: "subject_1",
          hostId: "host_1",
          domains: options.grantDomains ?? ["assistant", "coding"],
          expiresAt: options.grantExpiresAt ?? 2_000
        },
        createEndpoint: (accessToken) => {
          endpointSecrets.push(accessToken)
          const endpoint = createInProcessAgentHostEndpoint({
            host: remoteHost(),
            capabilities: capabilities(),
            accessToken,
            handleOperation: async (request) => {
              operationCalls.push(request.operation)
              if (options.handleOperation !== undefined) {
                return await options.handleOperation(request.operation)
              }
              return {
                outcome: "completed",
                result: {
                  operation:
                    options.operationResult ?? request.operation
                }
              }
            },
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
            subscribeEvents: () => () => undefined
          })
          return {
            send: endpoint.send,
            subscribe: endpoint.subscribe,
            close() {
              closeCalls += 1
              endpoint.close()
            }
          }
        }
      }
    },
    createSessionId: () => `session_${++sessionSequence}`,
    createEndpointAccessToken: () => `endpoint_secret_${endpointSecrets.length + 1}`,
    limits: {
      ...(options.maxBodyBytes === undefined ? {} : { maxBodyBytes: options.maxBodyBytes }),
      ...(options.maxResponseBytes === undefined
        ? {}
        : { maxResponseBytes: options.maxResponseBytes }),
      ...(options.maxSessions === undefined ? {} : { maxSessions: options.maxSessions }),
      ...(options.maxInFlightRequests === undefined
        ? {}
        : { maxInFlightRequests: options.maxInFlightRequests })
    },
    now: () => nowMs
  })
  return {
    handler,
    authenticatedTokens,
    endpointSecrets,
    operationCalls,
    get closeCalls() {
      return closeCalls
    },
    get revoked() {
      return revoked
    },
    set revoked(value: boolean) {
      revoked = value
    },
    get authenticationFailure() {
      return authenticationFailure
    },
    set authenticationFailure(value: boolean) {
      authenticationFailure = value
    },
    get subjectId() {
      return subjectId
    },
    set subjectId(value: string) {
      subjectId = value
    },
    get subjectExpiresAt() {
      return subjectExpiresAt
    },
    set subjectExpiresAt(value: number) {
      subjectExpiresAt = value
    },
    set nowMs(value: number) {
      nowMs = value
    }
  }
}

function request(
  body: unknown,
  authorization?: string,
  sessionId?: string,
  nowMs?: number
): RemoteAgentHostHttpRequest {
  return {
    method: "POST",
    path: REMOTE_AGENT_HOST_MESSAGE_PATH,
    headers: {
      ...(authorization === undefined ? {} : { authorization }),
      ...(sessionId === undefined
        ? {}
        : { [REMOTE_AGENT_HOST_SESSION_HEADER]: sessionId })
    },
    body,
    ...(nowMs === undefined ? {} : { nowMs })
  }
}

function handshakeMessage(
  requestedDomains: readonly ("assistant" | "coding")[] = ["assistant"]
) {
  return {
    kind: "wanex.agent-host.handshake.request" as const,
    protocolVersion: 1 as const,
    clientId: "client_1",
    accessToken: "external_handshake_value",
    requestedDomains
  }
}

function operationMessage(
  requestId: string,
  operation: string,
  domain: "assistant" | "coding" = "assistant"
) {
  return {
    kind: "wanex.agent-host.operation.request" as const,
    operationKind: "read" as const,
    requestId,
    domain,
    operation,
    payload: {}
  }
}

function remoteHost() {
  return {
    hostId: "host_1",
    instanceId: "instance_1",
    connectionKind: "remote_tls" as const,
    executionLocation: "remote" as const
  }
}

function capabilities() {
  return {
    revision: 1 as const,
    domains: ["assistant", "coding"] as const,
    features: [
      "canonical_reads",
      "ordered_events",
      "event_replay",
      "idempotent_commands"
    ] as const,
    maxFrameBytes: 16 * 1024 * 1024,
    maxEventPageSize: 100,
    eventReplay: "bounded" as const
  }
}
