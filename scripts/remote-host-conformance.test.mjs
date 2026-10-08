import { execFile } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { promisify } from "node:util"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createServer, request as httpsRequest } from "node:https"
import { Readable } from "node:stream"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  createAssistantAgentHostClient,
  createAssistantAgentHostEndpoint,
  createRemoteAssistantAgentHostComposition
} from "../apps/assistant-host/src/agent-host/index.js"
import {
  createRemoteAgentHostHttpClientTransport,
  createRemoteAgentHostHttpHandler,
  createRemoteAgentHostNodeHttpAdapter,
  REMOTE_AGENT_HOST_MESSAGE_PATH,
  REMOTE_AGENT_HOST_SSE_EVENT_PATH
} from "../packages/runtime/src/host/index.js"

const execFileAsync = promisify(execFile)

describe("Remote Assistant Host TLS conformance", () => {
  let environment
  beforeEach(async () => { environment = await createEnvironment() })
  afterEach(async () => { await environment?.close(); environment = undefined })

  it("supports TLS, SSE cursor recovery, and canonical reads", async () => {
    const requests = []
    const composition = await createRemoteAssistantAgentHostComposition({
      messageUrl: environment.messageUrl,
      getBearerToken: () => "assistant-bearer",
      fetch: createHttpsFetch(environment.ca, requests),
      limits: { requestTimeoutMs: 2_000 },
      clientId: "assistant-tls-client",
      createRequestId: requestIds("assistant")
    })
    const received = []
    const canonicalReads = []
    const canonicalRead = deferred()
    composition.client.subscribeSurfaceEvents((event) => received.push(event))
    try {
      await expect(composition.client.connect()).resolves.toMatchObject({
        host: { connectionKind: "remote_tls", executionLocation: "remote" },
        capabilities: { domains: ["assistant"] }
      })
      await expect(composition.client.status()).resolves.toMatchObject({
        ok: true, value: { kind: "assistant.status" }
      })
      const stream = composition.startEvents({
        reconnectInitialDelayMs: 25,
        reconnectMaxDelayMs: 25,
        onCanonicalReadRequired: (reason) => {
          expect(reason).toBe("gap")
          void composition.client.status().then((status) => {
            canonicalReads.push(status)
            canonicalRead.resolve()
          })
        }
      })
      await stream.ready
      environment.assistant.publish(1)
      await waitFor(() => received.some((event) => event.sequence === 1))
      environment.dropEventStreams()
      await waitFor(() => requests.some((request) =>
        request.path === REMOTE_AGENT_HOST_SSE_EVENT_PATH &&
        request.headers["last-event-id"] === "assistant:assistant_tls_stream:1"
      ))
      environment.assistant.publish(2)
      await waitFor(() => received.some((event) => event.sequence === 2))
      expect(received.map((event) => event.sequence)).toEqual([1, 2])
      environment.assistant.gap = true
      environment.dropEventStreams()
      await canonicalRead.promise
      await stream.closed
      expect(canonicalReads).toHaveLength(1)
    } finally {
      await composition.close()
    }
  })

  it("closes a revoked Assistant session", async () => {
    const transport = createRemoteAgentHostHttpClientTransport({
      messageUrl: environment.messageUrl,
      getBearerToken: () => "assistant-bearer",
      fetch: createHttpsFetch(environment.ca, []),
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
      await expect(client.status()).resolves.toMatchObject({
        ok: false, error: { code: "command_error" }
      })
      expect(environment.closedEndpointCount).toBeGreaterThan(0)
    } finally {
      client.close()
      await transport.close()
      environment.revoked.delete("assistant-bearer")
    }
  })
})

async function createEnvironment() {
  const certificate = await createTestCertificate()
  const assistant = createAssistantFixture()
  const revoked = new Set()
  let closedEndpointCount = 0
  const handler = createRemoteAgentHostHttpHandler({
    authenticateBearerToken: async (token) => token === "assistant-bearer" && !revoked.has(token)
      ? { subjectId: "assistant-subject", expiresAt: Date.now() + 60_000 }
      : null,
    resolveHost: async (subject) => subject.subjectId !== "assistant-subject" ? null : ({
      host: { hostId: "assistant-tls-host", instanceId: "assistant-tls-instance", connectionKind: "remote_tls", executionLocation: "remote" },
      grant: { subjectId: subject.subjectId, hostId: "assistant-tls-host", domains: ["assistant"], expiresAt: Date.now() + 60_000 },
      createEndpoint: (accessToken) => {
        const endpoint = assistant.createEndpoint(accessToken)
        return { send: endpoint.send, subscribe: endpoint.subscribe, close: () => { closedEndpointCount++; endpoint.close() } }
      }
    }),
    createSessionId: () => "tls-session",
    createEndpointAccessToken: () => "tls-endpoint",
    limits: { maxEventSubscribers: 2, requestTimeoutMs: 2_000 }
  })
  const adapter = createRemoteAgentHostNodeHttpAdapter({ handler, keepaliveIntervalMs: 30_000 })
  const activeResponses = new Set()
  const server = createServer(
    { key: await readFile(certificate.keyPath), cert: await readFile(certificate.certPath) },
    (request, response) => {
      const path = new URL(request.url ?? "/", "https://localhost").pathname
      if (path === REMOTE_AGENT_HOST_SSE_EVENT_PATH) { activeResponses.add(response); response.once("close", () => activeResponses.delete(response)) }
      void adapter.handle(request, response).catch(() => response.destroy())
    }
  )
  await listen(server)
  const address = server.address()
  if (address === null || typeof address === "string") throw new Error("TLS server did not bind")
  return {
    ca: await readFile(certificate.certPath),
    messageUrl: `https://localhost:${address.port}${REMOTE_AGENT_HOST_MESSAGE_PATH}`,
    assistant, handler, revoked,
    get closedEndpointCount() { return closedEndpointCount },
    dropEventStreams() { for (const response of [...activeResponses]) response.destroy() },
    async close() { await handler.close(); for (const response of [...activeResponses]) response.destroy(); await closeServer(server); await rm(certificate.directory, { recursive: true, force: true }) }
  }
}

function createAssistantFixture() {
  const listeners = new Set()
  const retained = []
  let gap = false
  return {
    get gap() { return gap }, set gap(value) { gap = value },
    publish(sequence) { const event = assistantEvent(sequence); retained.push(event); for (const listener of listeners) listener(event) },
    createEndpoint(accessToken) {
      return createAssistantAgentHostEndpoint({
        surface: {
          descriptor: () => ({ kind: "assistant.surface-descriptor", transport: "app-owned-ipc-or-api", commandCount: 1, rendererBoundary: {}, commands: [] }),
          dispatchSurfaceCommand: async () => ({ ok: true, command: "status", value: { kind: "assistant.status" }, event: assistantEvent(1) }),
          readSurfaceEvents: (request = {}) => ({ streamId: "assistant_tls_stream", earliestSequence: retained[0]?.sequence ?? 1, latestSequence: retained.at(-1)?.sequence ?? 0, gap, hasMore: false, events: gap ? [] : retained.filter((event) => event.sequence > (request.afterSequence ?? 0)) }),
          subscribeSurfaceEvents: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
          dispose: async () => undefined
        },
        host: { hostId: "assistant-tls-host", instanceId: "assistant-tls-instance", connectionKind: "remote_tls", executionLocation: "remote" },
        accessToken
      })
    }
  }
}

function assistantEvent(sequence) { return { id: `assistant_tls_stream:${sequence}`, sequence, type: "assistant.surface.state_changed", command: "status", at: sequence } }

async function createTestCertificate() {
  const directory = await mkdtemp(join(tmpdir(), "wanex-remote-tls-"))
  const keyPath = join(directory, "localhost.key")
  const certPath = join(directory, "localhost.crt")
  try {
    await execFileAsync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", keyPath, "-out", certPath, "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1"])
    return { directory, keyPath, certPath }
  } catch (error) {
    await rm(directory, { recursive: true, force: true })
    throw new Error("Remote Host TLS conformance requires openssl", { cause: error })
  }
}

function createHttpsFetch(ca, requests) {
  return (input, init = {}) => {
    const url = new URL(String(input))
    const headers = Object.fromEntries(new Headers(init.headers).entries())
    const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined
    requests.push({ path: url.pathname, headers, ...(body === undefined ? {} : { body }) })
    return new Promise((resolve, reject) => {
      const request = httpsRequest(url, { method: init.method ?? "GET", headers, ca, rejectUnauthorized: true, servername: "localhost" })
      let settled = false
      request.on("response", (response) => { settled = true; const responseHeaders = new Headers(); for (const [name, values] of Object.entries(response.headers)) if (values !== undefined) responseHeaders.set(name, Array.isArray(values) ? values.join(", ") : values); resolve(new Response(Readable.toWeb(response), { status: response.statusCode ?? 500, headers: responseHeaders })) })
      request.on("error", (error) => { if (!settled) reject(error) })
      if (init.body !== undefined && init.body !== null) request.write(init.body)
      request.end()
    })
  }
}

function requestIds(prefix) { let sequence = 0; return () => `${prefix}-request-${++sequence}` }
async function listen(server) { await new Promise((resolve, reject) => { server.once("error", reject); server.listen({ host: "127.0.0.1", port: 0 }, resolve) }) }
async function closeServer(server) { await new Promise((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error))) }
async function waitFor(predicate) { const deadline = Date.now() + 2_000; while (!predicate()) { if (Date.now() >= deadline) throw new Error("conformance condition timed out"); await new Promise((resolve) => setTimeout(resolve, 2)) } }
function deferred() { let resolve; const promise = new Promise((nextResolve) => { resolve = nextResolve }); return { promise, resolve } }
