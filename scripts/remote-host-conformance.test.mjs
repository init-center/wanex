import { execFile } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { promisify } from "node:util"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { createServer, request as httpsRequest } from "node:https"
import { Readable } from "node:stream"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  createAssistantAgentHostClient,
  createAssistantAgentHostEndpoint,
  createRemoteAssistantAgentHostComposition
} from "../apps/assistant-host/src/agent-host/index.js"
import {
  CodingApplicationError,
} from "../apps/coding/src/index.js"
import {
  createCodingAgentHostEndpoint,
  createRemoteCodingAgentHostComposition,
} from "../apps/coding/src/host/agent-host/index.js"
import {
  createRemoteAgentHostHttpClientTransport,
  createRemoteAgentHostHttpHandler,
  createRemoteAgentHostNodeHttpAdapter,
  REMOTE_AGENT_HOST_MESSAGE_PATH,
  REMOTE_AGENT_HOST_SSE_EVENT_PATH
} from "../packages/runtime/src/host/index.js"

const execFileAsync = promisify(execFile)

describe("Remote Agent Host TLS domain conformance", () => {
  let environment

  beforeAll(async () => {
    environment = await createEnvironment()
  })

  afterAll(async () => {
    await environment?.close()
  })

  it("drives the typed Assistant client through TLS, SSE cursor recovery, and canonical read", async () => {
    const requests = []
    const fetch = createHttpsFetch(environment.ca, requests)
    const composition = await createRemoteAssistantAgentHostComposition({
      messageUrl: environment.messageUrl,
      getBearerToken: () => "assistant-bearer",
      fetch,
      limits: { requestTimeoutMs: 2_000 },
      clientId: "assistant-tls-client",
      createRequestId: requestIds("assistant")
    })
    const client = composition.client
    const received = []
    const canonicalReads = []
    const canonicalRead = deferred()
    client.subscribe((event) => received.push(event))

    try {
      await expect(client.connect()).resolves.toMatchObject({
        host: {
          connectionKind: "remote_tls",
          executionLocation: "remote"
        },
        capabilities: { domains: ["assistant"] }
      })
      await expect(client.readStatus()).resolves.toMatchObject({
        kind: "assistant.status"
      })
      await expect(
        client.submitConversation({
          text: "remote assistant admission",
          idempotencyKey: "assistant-admission-once"
        })
      ).resolves.toEqual({ operationId: "assistant-operation-1" })

      const stream = composition.startEvents({
        reconnectInitialDelayMs: 25,
        reconnectMaxDelayMs: 25,
        onCanonicalReadRequired: (reason) => {
          expect(reason).toBe("gap")
          void client.readStatus().then((status) => {
            canonicalReads.push(status)
            canonicalRead.resolve()
          })
        }
      })
      await stream.ready

      environment.assistant.publish(1)
      await waitFor(() => received.some((event) => event.sequence === 1))
      expect(received).toEqual([
        expect.objectContaining({
          domain: "assistant",
          streamId: "assistant:assistant_tls_stream",
          sequence: 1,
          payload: expect.objectContaining({
            type: "assistant.surface.state_changed"
          })
        })
      ])

      environment.dropEventStreams()
      await waitFor(() =>
        requests.some(
          (request) =>
            request.path === REMOTE_AGENT_HOST_SSE_EVENT_PATH &&
            request.headers["last-event-id"] ===
              "assistant:assistant_tls_stream:1"
        )
      )
      environment.assistant.publish(2)
      await waitFor(() => received.some((event) => event.sequence === 2))
      expect(received.map((event) => event.sequence)).toEqual([1, 2])

      environment.assistant.gap = true
      environment.dropEventStreams()
      await canonicalRead.promise
      await stream.closed
      expect(canonicalReads).toHaveLength(1)
      expect(canonicalReads[0]).toMatchObject({ kind: "assistant.status" })
    } finally {
      await composition.close()
    }
  })

  it("drives the typed Coding client through the same TLS Host contract", async () => {
    const requests = []
    const fetch = createHttpsFetch(environment.ca, requests)
    const composition = await createRemoteCodingAgentHostComposition({
      messageUrl: environment.messageUrl,
      getBearerToken: () => "coding-bearer",
      fetch,
      clientId: "coding-tls-client",
      limits: { requestTimeoutMs: 2_000 },
      createRequestId: requestIds("coding")
    })
    const client = composition.client
    const received = []
    client.subscribe((event) => received.push(event))
    const canonicalReads = []
    const canonicalRead = deferred()

    try {
      await expect(client.connect()).resolves.toMatchObject({
        host: {
          connectionKind: "remote_tls",
          executionLocation: "remote"
        },
        capabilities: { domains: ["coding"] }
      })
      await expect(client.listProjects()).resolves.toEqual([
        expect.objectContaining({ projectId: "coding-project-1" })
      ])

      const startRequest = {
        projectId: "coding-project-1",
        sessionId: "coding-session-1",
        content: [{ type: "text", text: "start remote coding" }],
        idempotencyKey: "coding-turn-once"
      }
      const first = await client.startTurn(startRequest)
      const second = await client.startTurn(startRequest)
      expect(first).toMatchObject({ turnId: "coding-turn-1", state: "starting" })
      expect(second).toEqual(first)
      expect(environment.coding.startCalls).toHaveLength(1)

      const stream = composition.startEvents({
        reconnectInitialDelayMs: 25,
        reconnectMaxDelayMs: 25,
        onCanonicalReadRequired: (reason) => {
          expect(reason).toBe("gap")
          void client.readTurn({
            projectId: "coding-project-1",
            turnId: "coding-turn-1"
          }).then((turn) => {
            canonicalReads.push(turn)
            canonicalRead.resolve()
          })
        }
      })
      await stream.ready
      environment.coding.publish(1)
      await waitFor(() => received.some((event) => event.sequence === 1))
      expect(received).toEqual([
        expect.objectContaining({
          domain: "coding",
          streamId: "coding:coding_tls_stream",
          sequence: 1,
          type: "project_invalidated:project_opened"
        })
      ])

      environment.dropEventStreams()
      await waitFor(() =>
        requests.some(
          (request) =>
            request.path === REMOTE_AGENT_HOST_SSE_EVENT_PATH &&
            request.headers["last-event-id"] ===
              "coding:coding_tls_stream:1"
        )
      )
      environment.coding.publish(2)
      await waitFor(() => received.some((event) => event.sequence === 2))
      expect(received.map((event) => event.sequence)).toEqual([1, 2])

      environment.coding.gap = true
      environment.dropEventStreams()
      await canonicalRead.promise
      await stream.closed
      expect(canonicalReads).toHaveLength(1)
      expect(canonicalReads[0]).toMatchObject({
        projectId: "coding-project-1",
        turnId: "coding-turn-1"
      })

      const cancelRequest = {
        projectId: "coding-project-1",
        turnId: "coding-turn-1",
        reason: "remote user stopped the turn",
        idempotencyKey: "coding-cancel-once"
      }
      await expect(client.cancelTurn(cancelRequest)).resolves.toMatchObject({
        state: "cancelled",
        result: "cancelled"
      })
      await expect(client.cancelTurn(cancelRequest)).resolves.toMatchObject({
        state: "cancelled",
        result: "cancelled"
      })
      expect(environment.coding.cancelCalls).toHaveLength(1)

      const otherComposition = await createRemoteCodingAgentHostComposition({
        messageUrl: environment.messageUrl,
        getBearerToken: () => "other-coding-bearer",
        fetch,
        clientId: "other-coding-client",
        createRequestId: requestIds("other-coding")
      })
      try {
        await expect(otherComposition.client.listProjects()).resolves.toEqual([
          expect.objectContaining({ projectId: "other-project-1" })
        ])
        await expect(
          otherComposition.client.startTurn({
            projectId: "coding-project-1",
            content: [{ type: "text", text: "cross-project attempt" }],
            idempotencyKey: "other-cross-project"
          })
        ).rejects.toMatchObject({ code: "not_found" })
        expect(environment.otherCoding.startCalls).toHaveLength(0)
      } finally {
        await otherComposition.close()
      }

      stream.close()
      await stream.closed
    } finally {
      await composition.close()
    }
  })

  it("fails closed for cross-domain handshakes and revoked sessions", async () => {
    const requests = []
    const fetch = createHttpsFetch(environment.ca, requests)
    const crossDomain = await fetch(environment.messageUrl, {
      method: "POST",
      headers: {
        authorization: "Bearer assistant-bearer",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        kind: "wanex.agent-host.handshake.request",
        protocolVersion: 1,
        clientId: "cross-domain-client",
        accessToken: "assistant-handshake",
        requestedDomains: ["coding"]
      })
    })
    expect(crossDomain.status).toBe(403)
    await expect(crossDomain.json()).resolves.toMatchObject({
      error: { code: "unauthorized" }
    })

    const transport = createRemoteAgentHostHttpClientTransport({
      messageUrl: environment.messageUrl,
      getBearerToken: () => "assistant-bearer",
      fetch,
      limits: { requestTimeoutMs: 2_000 }
    })
    const client = createAssistantAgentHostClient(transport, {
      clientId: "revoked-client",
      accessToken: "assistant-handshake",
      createRequestId: requestIds("revoked")
    })
    try {
      await client.connect()
      environment.revoked.add("assistant-bearer")
      await expect(client.readStatus()).rejects.toMatchObject({
        code: "unauthenticated"
      })
      expect(environment.closedEndpointCount).toBeGreaterThan(0)
    } finally {
      client.close()
      await transport.close()
      environment.revoked.delete("assistant-bearer")
    }
  })

  it("keeps remote session serialization while allowing distinct sessions", async () => {
    const fetch = createHttpsFetch(environment.ca, [])
    const first = await createRemoteCodingAgentHostComposition({
      messageUrl: environment.messageUrl,
      getBearerToken: () => "coding-bearer",
      fetch,
      clientId: "coding-concurrency-first",
      createRequestId: requestIds("coding-concurrency-first")
    })
    const second = await createRemoteCodingAgentHostComposition({
      messageUrl: environment.messageUrl,
      getBearerToken: () => "coding-bearer",
      fetch,
      clientId: "coding-concurrency-second",
      createRequestId: requestIds("coding-concurrency-second")
    })

    try {
      const [firstTurn, secondTurn] = await Promise.all([
        first.client.startTurn({
          projectId: "coding-project-1",
          content: [{ type: "text", text: "first remote session" }],
          idempotencyKey: "coding-concurrency-session-first"
        }),
        second.client.startTurn({
          projectId: "coding-project-1",
          content: [{ type: "text", text: "second remote session" }],
          idempotencyKey: "coding-concurrency-session-second"
        })
      ])
      expect(firstTurn.sessionId).not.toBe(secondTurn.sessionId)
      expect(environment.coding.maxConcurrentSessions).toBeGreaterThanOrEqual(2)

      await expect(
        second.client.startTurn({
          projectId: "coding-project-1",
          sessionId: firstTurn.sessionId,
          content: [{ type: "text", text: "first remote session" }],
          idempotencyKey: "coding-concurrency-session-first"
        })
      ).resolves.toEqual(firstTurn)
      expect(environment.coding.startCalls).toHaveLength(3)

      const queued = await second.client.startTurn({
        projectId: "coding-project-1",
        sessionId: firstTurn.sessionId,
        content: [{ type: "text", text: "same session follow-up" }],
        idempotencyKey: "coding-concurrency-same-session"
      })
      expect(queued.sessionId).toBe(firstTurn.sessionId)
      expect(queued.state).toBe("queued")
      expect(environment.coding.maxConcurrentSessions).toBeGreaterThanOrEqual(2)
      expect(environment.coding.activeSessionCount).toBe(2)

      const cancelFirst = {
        projectId: "coding-project-1",
        turnId: firstTurn.turnId,
        reason: "release shared Session",
        idempotencyKey: "coding-concurrency-cancel-first"
      }
      const cancelCallsBefore = environment.coding.cancelCalls.length
      await expect(second.client.cancelTurn(cancelFirst)).resolves.toMatchObject({
        state: "cancelled",
        result: "cancelled"
      })
      await expect(first.client.cancelTurn(cancelFirst)).resolves.toMatchObject({
        state: "cancelled",
        result: "cancelled"
      })
      expect(environment.coding.cancelCalls).toHaveLength(cancelCallsBefore + 1)
    } finally {
      await first.close()
      await second.close()
    }
  })

  it("drains a remote Coding observer without taking ownership of server execution", async () => {
    const drainEnvironment = await createEnvironment()
    const composition = await createRemoteCodingAgentHostComposition({
      messageUrl: drainEnvironment.messageUrl,
      getBearerToken: () => "coding-bearer",
      fetch: createHttpsFetch(drainEnvironment.ca, []),
      clientId: "coding-drain-client",
      createRequestId: requestIds("coding-drain")
    })

    try {
      const stream = composition.startEvents({
        reconnectInitialDelayMs: 10,
        reconnectMaxDelayMs: 10
      })
      await stream.ready
      const started = await composition.client.startTurn({
        projectId: "coding-project-1",
        sessionId: "coding-drain-session",
        content: [{ type: "text", text: "bounded remote coding work" }],
        idempotencyKey: "coding-drain-turn"
      })
      expect(drainEnvironment.coding.activeEndpointCount).toBe(1)
      await drainEnvironment.handler.drain(1_000)
      stream.close()
      await stream.closed
      expect(drainEnvironment.coding.activeEndpointCount).toBe(0)
      expect(drainEnvironment.coding.activeSessionCount).toBe(1)
      expect(drainEnvironment.handler.getStatus()).toMatchObject({
        state: "closed",
        activeSessions: 0,
        activeEventStreams: 0,
        inFlightRequests: 0
      })
      await expect(
        composition.client.readTurn({
          projectId: "coding-project-1",
          turnId: started.turnId
        })
      ).rejects.toMatchObject({ code: "transport_failure" })
      await expect(
        composition.client.startTurn({
          projectId: "coding-project-1",
          sessionId: started.sessionId,
          content: [{ type: "text", text: "must be rejected after drain" }],
          idempotencyKey: "coding-drain-after-close"
        })
      ).rejects.toMatchObject({ code: "transport_failure" })
    } finally {
      await composition.close()
      await drainEnvironment.close()
    }
  })
})

async function createEnvironment() {
  const certificate = await createTestCertificate()
  const assistant = createAssistantFixture()
  const coding = createCodingFixture()
  const otherCoding = createCodingFixture("other-project-1")
  const revoked = new Set()
  let sessionSequence = 0
  let closedEndpointCount = 0
  const handler = createRemoteAgentHostHttpHandler({
    authenticateBearerToken: async (token) => {
      if (revoked.has(token)) return null
      const subjectId =
        token === "assistant-bearer"
          ? "assistant-subject"
          : token === "coding-bearer"
            ? "coding-subject"
            : token === "other-coding-bearer"
              ? "other-coding-subject"
            : undefined
      return subjectId === undefined
        ? null
        : { subjectId, expiresAt: Date.now() + 60_000 }
    },
    resolveHost: async (subject) => {
      const fixture =
        subject.subjectId === "assistant-subject"
          ? assistant
          : subject.subjectId === "coding-subject"
            ? coding
            : subject.subjectId === "other-coding-subject"
              ? otherCoding
            : undefined
      if (fixture === undefined) return null
      return {
        host: {
          hostId: `${fixture.domain}-tls-host`,
          instanceId: `${fixture.domain}-tls-instance`,
          connectionKind: "remote_tls",
          executionLocation: "remote"
        },
        grant: {
          subjectId: subject.subjectId,
          hostId: `${fixture.domain}-tls-host`,
          domains: [fixture.domain],
          expiresAt: Date.now() + 60_000
        },
        createEndpoint: (accessToken) => {
          const endpoint = fixture.createEndpoint(accessToken)
          const close = endpoint.close
          return {
            send: endpoint.send,
            subscribe: endpoint.subscribe,
            close: () => {
              closedEndpointCount += 1
              close()
            }
          }
        }
      }
    },
    createSessionId: () => `tls_session_${++sessionSequence}`,
    createEndpointAccessToken: () => `tls_endpoint_${randomUUID()}`,
    limits: {
      maxEventSubscribers: 2,
      requestTimeoutMs: 2_000
    }
  })
  const adapter = createRemoteAgentHostNodeHttpAdapter({
    handler,
    keepaliveIntervalMs: 30_000
  })
  const activeEventResponses = new Set()
  const server = createServer(
    {
      key: await readFile(certificate.keyPath),
      cert: await readFile(certificate.certPath)
    },
    (request, response) => {
      const path = new URL(request.url ?? "/", "https://localhost").pathname
      if (path === REMOTE_AGENT_HOST_SSE_EVENT_PATH) {
        activeEventResponses.add(response)
        response.once("close", () => activeEventResponses.delete(response))
      }
      void adapter.handle(request, response).catch(() => response.destroy())
    }
  )
  await listen(server)
  const address = server.address()
  if (address === null || typeof address === "string") {
    throw new Error("Remote Host TLS conformance server did not bind")
  }
  return {
    ca: await readFile(certificate.certPath),
    messageUrl: `https://localhost:${address.port}${REMOTE_AGENT_HOST_MESSAGE_PATH}`,
    handler,
    assistant,
    coding,
    otherCoding,
    revoked,
    get closedEndpointCount() {
      return closedEndpointCount
    },
    dropEventStreams() {
      for (const response of [...activeEventResponses]) response.destroy()
    },
    async close() {
      await handler.close()
      for (const response of [...activeEventResponses]) response.destroy()
      await closeServer(server)
      await rm(certificate.directory, { recursive: true, force: true })
    }
  }
}

function createAssistantFixture() {
  const listeners = new Set()
  const retained = []
  const submissions = new Map()
  let gap = false
  return {
    domain: "assistant",
    get gap() {
      return gap
    },
    set gap(value) {
      gap = value
    },
    publish(sequence) {
      const value = assistantEvent(sequence)
      retained.push(value)
      for (const listener of listeners) listener(value)
    },
    createEndpoint(accessToken) {
      return createAssistantAgentHostEndpoint({
        surface: {
          descriptor: () => ({}),
          dispatchSurfaceCommand: async (request) => ({
            ok: true,
            command: request.command,
            value:
              request.command === "status"
                ? { kind: "assistant.status" }
                : { command: request.command },
            event: assistantEvent(1)
          }),
          readSurfaceEvents: (request = {}) => {
            const events = retained.filter(
              (event) => event.sequence > (request.afterSequence ?? 0)
            )
            return {
              streamId: "assistant_tls_stream",
              earliestSequence: retained[0]?.sequence ?? 1,
              latestSequence: retained.at(-1)?.sequence ?? 0,
              gap,
              hasMore: false,
              events: gap ? [] : events
            }
          },
          subscribeSurfaceEvents: (listener) => {
            listeners.add(listener)
            return () => listeners.delete(listener)
          },
          dispose: async () => undefined
        },
        commands: {
          submitConversationOperation: async (request) => {
            const existing = submissions.get(request.idempotencyKey)
            if (existing !== undefined) return existing
            const result = {
              kind: "assistant.conversation-operation.found",
              operation: { operationId: "assistant-operation-1" }
            }
            submissions.set(request.idempotencyKey, result)
            return result
          },
          cancelTrackedConversationOperation: async () => ({
            kind: "assistant.conversation-operation.found",
            operation: { operationId: "assistant-operation-1" }
          }),
          steerTrackedConversationOperation: async () => ({
            kind: "assistant.conversation-operation.found",
            operation: { operationId: "assistant-operation-1" }
          }),
          resolveTrackedConversationApproval: async () => ({
            kind: "assistant.conversation-operation.found",
            operation: { operationId: "assistant-operation-1" }
          }),
          resolveTrackedConversationRecovery: async () => ({
            kind: "assistant.conversation-operation.found",
            operation: { operationId: "assistant-operation-1" }
          })
        },
        host: {
          hostId: "assistant-tls-host",
          instanceId: "assistant-tls-instance",
          connectionKind: "remote_tls",
          executionLocation: "remote"
        },
        accessToken
      })
    }
  }
}

function createCodingFixture(projectId = "coding-project-1") {
  const listeners = new Set()
  const retained = []
  const startCalls = []
  const cancelCalls = []
  const turns = new Map()
  const turnsById = new Map()
  const activeSessions = new Set()
  const endpoints = new Set()
  let turnSequence = 0
  let maxConcurrentSessions = 0
  let gap = false
  const application = {
    state: "open",
    listProjects: async () => [codingProject(projectId)],
    readTurn: async (request) => {
      if (request.projectId !== projectId) {
        throw new CodingApplicationError(
          "project_unavailable",
          "coding project is unavailable"
        )
      }
      const found = turnsById.get(request.turnId)
      if (found === undefined) {
        throw new CodingApplicationError(
          "turn_unavailable",
          "coding Turn is unavailable"
        )
      }
      return found
    },
    startTurn: async (request) => {
      if (request.projectId !== projectId) {
        throw new CodingApplicationError(
          "project_unavailable",
          "coding project is unavailable"
        )
      }
      const existing = turns.get(request.idempotencyKey)
      if (existing !== undefined) return existing
      const sessionId =
        request.sessionId ?? `coding-session-${request.idempotencyKey}`
      const isQueued = activeSessions.has(sessionId)
      const result = codingTurn(projectId, {
        sessionId,
        turnId: `coding-turn-${++turnSequence}`,
        state: isQueued ? "queued" : "starting"
      })
      turns.set(request.idempotencyKey, result)
      turnsById.set(result.turnId, result)
      if (!isQueued) {
        activeSessions.add(sessionId)
        maxConcurrentSessions = Math.max(
          maxConcurrentSessions,
          activeSessions.size
        )
      }
      startCalls.push(request)
      return result
    },
    cancelTurn: async (request) => {
      if (request.projectId !== projectId) {
        throw new CodingApplicationError(
          "project_unavailable",
          "coding project is unavailable"
        )
      }
      const current = turnsById.get(request.turnId)
      if (current === undefined) {
        throw new CodingApplicationError(
          "turn_unavailable",
          "coding Turn is unavailable"
        )
      }
      if (current.state === "cancelled") return current
      const result = {
        ...current,
        state: "cancelled",
        result: "cancelled",
        canCancel: false
      }
      turnsById.set(result.turnId, result)
      if (current.state !== "queued") activeSessions.delete(result.sessionId)
      cancelCalls.push(request)
      return result
    },
    readEvents: async (request = {}) => {
      const events = retained.filter(
        (event) => event.sequence > (request.afterSequence ?? 0)
      )
      return {
        streamId: "coding_tls_stream",
        events: gap ? [] : events,
        firstRetainedSequence: retained[0]?.sequence ?? 1,
        lastSequence: retained.at(-1)?.sequence ?? 0,
        gap,
        hasMore: false
      }
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
  return {
    domain: "coding",
    startCalls,
    cancelCalls,
    get maxConcurrentSessions() {
      return maxConcurrentSessions
    },
    get activeSessionCount() {
      return activeSessions.size
    },
    get activeEndpointCount() {
      return endpoints.size
    },
    get gap() {
      return gap
    },
    set gap(value) {
      gap = value
    },
    publish(sequence) {
      const value = codingEvent(sequence)
      retained.push(value)
      for (const listener of listeners) listener(value)
    },
    createEndpoint(accessToken) {
      const endpoint = createCodingAgentHostEndpoint({
        application,
        host: {
          hostId: "coding-tls-host",
          instanceId: "coding-tls-instance",
          connectionKind: "remote_tls",
          executionLocation: "remote"
        },
        accessToken
      })
      endpoints.add(endpoint)
      let closed = false
      return {
        send: endpoint.send,
        subscribe: endpoint.subscribe,
        close: () => {
          if (closed) return
          closed = true
          endpoints.delete(endpoint)
          endpoint.close()
        }
      }
    }
  }
}

function assistantEvent(sequence) {
  return {
    id: `assistant_tls_stream:${sequence}`,
    sequence,
    type: "assistant.surface.state_changed",
    command: "status",
    at: sequence
  }
}

function codingEvent(sequence, projectId = "coding-project-1") {
  return {
    kind: "project_invalidated",
    streamId: "coding_tls_stream",
    sequence,
    occurredAt: sequence,
    projectId,
    reason: "project_opened"
  }
}

function codingProject(projectId = "coding-project-1") {
  return {
    projectId,
    name: "Remote Coding Project",
    state: "ready",
    openedAt: 1,
    recovery: {
      transactionAttention: false,
      taskAttentionCount: 0,
      taskFailureCount: 0,
      moreTasksPending: false
    }
  }
}

function codingTurn(projectId = "coding-project-1", overrides = {}) {
  return {
    projectId,
    sessionId: "coding-session-1",
    turnId: "coding-turn-1",
    state: "starting",
    createdAt: 1,
    updatedAt: 1,
    canCancel: true,
    approvals: {
      totalCount: 0,
      returnedCount: 0,
      omittedCount: 0,
      items: []
    },
    recovery: {
      totalCount: 0,
      returnedCount: 0,
      omittedCount: 0,
      items: []
    },
    ...overrides
  }
}

async function createTestCertificate() {
  const directory = await mkdtemp(join(tmpdir(), "wanex-remote-tls-"))
  const keyPath = join(directory, "localhost.key")
  const certPath = join(directory, "localhost.crt")
  try {
    await execFileAsync("openssl", [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      keyPath,
      "-out",
      certPath,
      "-days",
      "1",
      "-subj",
      "/CN=localhost",
      "-addext",
      "subjectAltName=DNS:localhost,IP:127.0.0.1"
    ])
    return { directory, keyPath, certPath }
  } catch (error) {
    await rm(directory, { recursive: true, force: true })
    throw new Error("Remote Host TLS conformance requires openssl", {
      cause: error
    })
  }
}

function createHttpsFetch(ca, requests) {
  return (input, init = {}) => {
    const url = new URL(String(input))
    const headers = Object.fromEntries(new Headers(init.headers).entries())
    requests.push({
      path: url.pathname,
      headers: { ...headers }
    })
    return new Promise((resolve, reject) => {
      const request = createServerRequest(url, {
        method: init.method ?? "GET",
        headers,
        ca,
        rejectUnauthorized: true,
        servername: "localhost"
      })
      let settled = false
      let responseStream
      const signal = init.signal
      const abort = () => {
        responseStream?.destroy()
        request.destroy(new Error("request aborted"))
        if (!settled) reject(new Error("request aborted"))
      }
      signal?.addEventListener("abort", abort, { once: true })
      request.on("response", (response) => {
        responseStream = response
        settled = true
        response.once("close", () => signal?.removeEventListener("abort", abort))
        const responseHeaders = new Headers()
        for (const [name, values] of Object.entries(response.headers)) {
          if (values === undefined) continue
          responseHeaders.set(name, Array.isArray(values) ? values.join(", ") : values)
        }
        resolve(
          new Response(Readable.toWeb(response), {
            status: response.statusCode ?? 500,
            headers: responseHeaders
          })
        )
      })
      request.on("error", (error) => {
        if (!settled) reject(error)
      })
      if (init.body !== undefined && init.body !== null) request.write(init.body)
      request.end()
    })
  }
}

function createServerRequest(url, options) {
  return httpsRequest(url, options)
}

function requestIds(prefix) {
  let sequence = 0
  return () => `${prefix}-request-${++sequence}`
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen({ host: "127.0.0.1", port: 0 }, resolve)
  })
}

async function closeServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)))
  })
}

async function waitFor(predicate) {
  const deadline = Date.now() + 2_000
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("conformance condition timed out")
    await new Promise((resolve) => setTimeout(resolve, 2))
  }
}

function deferred() {
  let resolve
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}
