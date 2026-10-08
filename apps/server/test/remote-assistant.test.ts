import { join } from "node:path"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { afterEach, describe, expect, it } from "vitest"
import {
  createRemoteAssistantAgentHostComposition,
  type RemoteAssistantAgentHostComposition
} from "@wanex/assistant-host"
import {
  InMemoryResolvedSecret,
  type SecretResolveContext,
  type SecretStorePort
} from "@wanex/runtime/secrets"
import { startWanexServer } from "../src/index.js"
import {
  listenWanexServer,
  type WanexServerListener
} from "../src/listener.js"
import type { WanexServer } from "../src/model.js"
import { startWanexServerInternal } from "../src/start.js"
import {
  createHttpsFetch,
  createTestCertificate,
  type TestCertificate
} from "./support/tls.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)

const tempDirs: string[] = []
const certificates: TestCertificate[] = []
const servers: WanexServer[] = []
const clients: RemoteAssistantAgentHostComposition[] = []

afterEach(async () => {
  while (clients.length > 0) await clients.pop()?.close()
  while (servers.length > 0) await servers.pop()?.close()
  while (certificates.length > 0) await certificates.pop()?.close()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir !== undefined) await rm(dir, { recursive: true, force: true })
  }
})

describe("Wanex Server Remote Assistant", () => {
  it("rejects a fresh connection by another authenticated account", async () => {
    const certificate = await createTestCertificate()
    certificates.push(certificate)
    const server = await startWanexServer({
      config: { dataRoot: await createTempDir(), listener: { hostname: "127.0.0.1", port: 0 } },
      serviceBin, tls: certificate,
      authentication: new TestAuthentication(),
      credentialStore: new MemorySecretStore(),
      modelEndpoints: { endpoints: [fakeEndpoint()], activeEndpointId: "server-remote-assistant" }
    })
    servers.push(server)
    const owner = await createRemoteAssistantAgentHostComposition({
      messageUrl: server.endpoint.messageUrl, getBearerToken: () => "valid-server-token",
      fetch: createHttpsFetch(certificate.cert), clientId: "owner-first-device"
    })
    clients.push(owner)
    const sessionId = "account-private-history"
    await expect(owner.client.submitConversationOperation({
      sessionId, text: "account-private-message", idempotencyKey: "private-message"
    })).resolves.toMatchObject({ ok: true })
    const second = await createRemoteAssistantAgentHostComposition({
      messageUrl: server.endpoint.messageUrl, getBearerToken: () => "second-owner-token",
      fetch: createHttpsFetch(certificate.cert), clientId: "owner-second-device"
    })
    clients.push(second)
    await waitFor(async () => {
      const transcript = await second.client.readSessionTranscript({ sessionId })
      return transcript.ok && JSON.stringify(transcript.value).includes("account-private-message")
    })
    const connection = createRemoteAssistantAgentHostComposition({
      messageUrl: server.endpoint.messageUrl,
      getBearerToken: () => "other-server-token",
      fetch: createHttpsFetch(certificate.cert),
      clientId: "different-account-fresh-connection"
    }).then((client) => { clients.push(client); return client })
    await expect(connection).rejects.toThrow()
  })

  it("serves the typed Assistant client through its real TLS listener", async () => {
    const certificate = await createTestCertificate()
    certificates.push(certificate)
    const server = await startWanexServerInternal({
      config: {
        dataRoot: await createTempDir(),
        profileId: "remote-assistant",
        hostId: "server:remote-assistant",
        listener: { hostname: "127.0.0.1", port: 0 }
      },
      serviceBin,
      tls: certificate,
      authentication: new TestAuthentication(),
      credentialStore: new MemorySecretStore(),
      modelEndpoints: {
        endpoints: [fakeEndpoint()],
        activeEndpointId: "server-remote-assistant"
      },
      remoteLimits: {
        requestTimeoutMs: 2_000,
        maxEventSubscribers: 2
      }
    })
    servers.push(server)

    expect(server.endpoint).toMatchObject({
      kind: "wanex.server.endpoint",
      transport: "https",
      hostname: "127.0.0.1",
      port: expect.any(Number)
    })
    expect(server.endpoint.port).toBeGreaterThan(0)
    expect(server.readStatus()).toMatchObject({
      state: "open",
      assistant: "ready",
      listener: "ready",
      endpoint: server.endpoint
    })

    const composition = await createRemoteAssistantAgentHostComposition({
      messageUrl: server.endpoint.messageUrl,
      getBearerToken: () => "valid-server-token",
      fetch: createHttpsFetch(certificate.cert),
      clientId: "server-product-client",
      createRequestId: requestIds("server-product")
    })
    clients.push(composition)
    const received: unknown[] = []
    composition.client.subscribeSurfaceEvents((event) => received.push(event))
    const stream = composition.startEvents()
    await stream.ready

    await expect(composition.client.status()).resolves.toMatchObject({
      ok: true,
      value: {
        kind: "assistant.status",
        disposed: false,
        assistant: {
          started: true,
          disposed: false,
          activeModelEndpointId: "server-remote-assistant"
        }
      }
    })
    const request = {
      text: "hello through the real Wanex Server",
      sessionId: "server_remote_session",
      idempotencyKey: "server_remote_submit_once"
    }
    const first = await composition.client.submitConversationOperation(request)
    const duplicate = await composition.client.submitConversationOperation(request)
    expect(duplicate).toEqual(first)

    await waitFor(async () => {
      const transcript = await composition.client.readSessionTranscript({
        sessionId: request.sessionId
      })
      return transcript.ok &&
        transcript.value.kind === "assistant.session-transcript.found" &&
        transcript.value.transcript.rows.some((row) =>
          row.role === "assistant" &&
          row.parts.some((part) =>
            part.type === "text" &&
            part.text === "Fake response from server-remote-assistant-model"
          )
        )
    })
    await expect(composition.client.cancelTrackedConversationOperation({
      sessionId: request.sessionId,
      reason: "server remote terminal cancellation"
    })).resolves.toMatchObject({
      ok: true,
      value: { status: "already_terminal" }
    })
    expect(received).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "assistant.surface.conversation.operation-invalidated"
      })
    ]))

    stream.close()
    await stream.closed
    await server.close()
    servers.pop()
    await expect(composition.client.status()).resolves.toMatchObject({
      ok: false,
      error: { code: "command_error" }
    })
    await composition.close()
    clients.pop()
    expect(server.readStatus()).toMatchObject({
      state: "closed",
      assistant: "closed",
      listener: "closed"
    })
  })

  it("keeps Workspace capability execution on the remote Server machine", async () => {
    const certificate = await createTestCertificate()
    certificates.push(certificate)
    const root = await createTempDir()
    const server = await startWanexServerInternal({
      config: {
        dataRoot: await createTempDir(),
        profileId: "remote-workspace",
        listener: { hostname: "127.0.0.1", port: 0 },
        workspace: {
          initialRoots: [{ id: "server-root", path: root }]
        }
      },
      serviceBin,
      tls: certificate,
      authentication: new TestAuthentication(),
      credentialStore: new MemorySecretStore(),
      modelEndpoints: {
        endpoints: [fakeEndpoint()],
        activeEndpointId: "server-remote-assistant"
      }
    })
    servers.push(server)

    expect(server.assistantHost.workspace).toBeDefined()
    const prepared = await server.assistantHost.shell.trustedExecution.prepareExecutionBinding({
      sessionId: "remote-workspace-session",
      inputId: "remote-workspace-input",
      turnId: "remote-workspace-turn",
      content: [{ id: "remote-workspace-part", type: "text", text: "inspect workspace" }]
    })
    const names = ((prepared.binding.toolSnapshot as { tools?: readonly { descriptor?: { name?: string } }[] }).tools ?? [])
      .map((tool) => tool.descriptor?.name)
    expect(names).toContain("workspace_git_capability")
    prepared.context.rollback()
  })

  it("rejects an unknown bearer before exposing the Assistant Host", async () => {
    const certificate = await createTestCertificate()
    certificates.push(certificate)
    const server = await startWanexServer({
      config: {
        dataRoot: await createTempDir(),
        listener: { hostname: "127.0.0.1", port: 0 }
      },
      serviceBin,
      tls: certificate,
      authentication: new TestAuthentication(),
      credentialStore: new MemorySecretStore(),
      modelEndpoints: {
        endpoints: [fakeEndpoint()],
        activeEndpointId: "server-remote-assistant"
      }
    })
    servers.push(server)

    await expect(createRemoteAssistantAgentHostComposition({
      messageUrl: server.endpoint.messageUrl,
      getBearerToken: () => "unknown-server-token",
      fetch: createHttpsFetch(certificate.cert),
      clientId: "rejected-server-client"
    })).rejects.toMatchObject({ code: "unauthenticated" })

    expect(JSON.stringify(server.readStatus())).not.toContain(
      "unknown-server-token"
    )
  })

  it("reconnects with its cursor and requires a canonical read after a real gap", async () => {
    const certificate = await createTestCertificate()
    certificates.push(certificate)
    let listener: WanexServerListener | undefined
    const server = await startWanexServerInternal({
      config: {
        dataRoot: await createTempDir(),
        profileId: "remote-assistant-replay",
        listener: { hostname: "127.0.0.1", port: 0 }
      },
      serviceBin,
      tls: certificate,
      authentication: new TestAuthentication(),
      credentialStore: new MemorySecretStore(),
      modelEndpoints: {
        endpoints: [fakeEndpoint()],
        activeEndpointId: "server-remote-assistant"
      },
      remoteLimits: { requestTimeoutMs: 2_000 }
    }, {
      async listen(options) {
        listener = await listenWanexServer(options)
        return listener
      }
    })
    servers.push(server)
    const composition = await createRemoteAssistantAgentHostComposition({
      messageUrl: server.endpoint.messageUrl,
      getBearerToken: () => "valid-server-token",
      fetch: createHttpsFetch(certificate.cert),
      clientId: "server-replay-client",
      createRequestId: requestIds("server-replay")
    })
    clients.push(composition)
    const received: Array<{ readonly sequence?: number }> = []
    const resets: string[] = []
    const states: string[] = []
    composition.client.subscribeSurfaceEvents((event) => received.push(event))
    const stream = composition.startEvents({
      reconnectInitialDelayMs: 500,
      reconnectMaxDelayMs: 500,
      onStateChange: (state) => states.push(state),
      onCanonicalReadRequired: (reason) => resets.push(reason)
    })
    await stream.ready

    await server.assistantHost.surface.dispatchSurfaceCommand({ command: "status" })
    await waitFor(async () => received.some((event) => event.sequence === 1))
    listener!.destroyConnections()
    for (let index = 0; index < 257; index += 1) {
      await server.assistantHost.surface.dispatchSurfaceCommand({ command: "status" })
    }

    await waitFor(async () => resets.length === 1)
    await stream.closed
    expect(states).toContain("reconnecting")
    expect(resets).toEqual(["gap"])
    await expect(composition.client.status()).resolves.toMatchObject({
      ok: true,
      value: { kind: "assistant.status", disposed: false }
    })
  })

  it("invalidates a session when another authenticated subject reuses it", async () => {
    const certificate = await createTestCertificate()
    certificates.push(certificate)
    const server = await startWanexServer({
      config: {
        dataRoot: await createTempDir(),
        profileId: "remote-assistant-subject",
        listener: { hostname: "127.0.0.1", port: 0 }
      },
      serviceBin,
      tls: certificate,
      authentication: new TestAuthentication(),
      credentialStore: new MemorySecretStore(),
      modelEndpoints: {
        endpoints: [fakeEndpoint()],
        activeEndpointId: "server-remote-assistant"
      }
    })
    servers.push(server)
    let bearer = "valid-server-token"
    const composition = await createRemoteAssistantAgentHostComposition({
      messageUrl: server.endpoint.messageUrl,
      getBearerToken: () => bearer,
      fetch: createHttpsFetch(certificate.cert),
      clientId: "server-subject-client"
    })
    clients.push(composition)

    bearer = "other-server-token"
    await expect(composition.client.status()).resolves.toMatchObject({
      ok: false,
      error: { code: "command_error" }
    })
    bearer = "valid-server-token"
    await expect(composition.client.status()).resolves.toMatchObject({
      ok: false,
      error: { code: "command_error" }
    })
  })
})

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "wanex-server-remote-"))
  tempDirs.push(dir)
  return dir
}

function fakeEndpoint() {
  return {
    id: "server-remote-assistant",
    connection: { id: "server-remote-assistant", providerId: "fake" },
    protocol: { id: "fake" as const },
    model: {
      id: "server-remote-assistant-model",
      operations: ["conversation" as const],
      inputModalities: ["text" as const],
      outputModalities: ["text" as const],
      features: ["tool_calling" as const],
      catalog: {
        source: "custom" as const,
        catalogId: "wanex.server.remote-assistant.test",
        revision: "1"
      }
    }
  }
}

function requestIds(prefix: string): () => string {
  let sequence = 0
  return () => `${prefix}-${++sequence}`
}

async function waitFor(predicate: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 3_000
  while (!await predicate()) {
    if (Date.now() >= deadline) {
      throw new Error("Wanex Server Remote Assistant condition timed out")
    }
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

class TestAuthentication {
  readonly ownerSubjectId = "server-product-subject"
  async authenticateBearerToken(token: string) {
    const subjectId = token === "valid-server-token" || token === "second-owner-token"
      ? "server-product-subject"
      : token === "other-server-token"
        ? "server-other-subject"
        : undefined
    return subjectId === undefined
      ? null
      : { subjectId, expiresAt: Date.now() + 60_000 }
  }
}

class MemorySecretStore implements SecretStorePort {
  readonly scheme = "test-secret"
  readonly #values = new Map<string, string>()

  async put(request: { readonly ref: string; readonly value: string }): Promise<void> {
    this.#values.set(request.ref, request.value)
  }

  async delete(ref: string): Promise<void> {
    this.#values.delete(ref)
  }

  async resolve(
    ref: string,
    _context?: SecretResolveContext
  ): Promise<InMemoryResolvedSecret> {
    const value = this.#values.get(ref)
    if (value === undefined) throw new Error("test secret is not configured")
    return new InMemoryResolvedSecret({ ref, provider: this.scheme, value })
  }
}
