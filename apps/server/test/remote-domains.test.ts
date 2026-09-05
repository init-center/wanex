import { execFile } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import { promisify } from "node:util"
import { afterEach, describe, expect, it } from "vitest"
import {
  createRemoteAssistantAgentHostComposition,
  type RemoteAssistantAgentHostComposition
} from "@wanex/assistant-host"
import {
  createRemoteCodingAgentHostComposition,
  type RemoteCodingAgentHostComposition
} from "@wanex/coding/host"
import {
  InMemoryResolvedSecret,
  type SecretResolveContext,
  type SecretStorePort
} from "@wanex/runtime/secrets"
import { startWanexServer } from "../src/index.js"
import type { WanexServer } from "../src/model.js"
import {
  createHttpsFetch,
  createTestCertificate,
  type TestCertificate
} from "./support/tls.js"

const execFileAsync = promisify(execFile)
const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)

const tempDirs: string[] = []
const certificates: TestCertificate[] = []
const servers: WanexServer[] = []
const assistantClients: RemoteAssistantAgentHostComposition[] = []
const codingClients: RemoteCodingAgentHostComposition[] = []

afterEach(async () => {
  while (assistantClients.length > 0) await assistantClients.pop()?.close()
  while (codingClients.length > 0) await codingClients.pop()?.close()
  while (servers.length > 0) await servers.pop()?.close()
  while (certificates.length > 0) await certificates.pop()?.close()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir !== undefined) await rm(dir, { recursive: true, force: true })
  }
})

describe("Wanex Server Remote Host domain admission", () => {
  it("serves exact Assistant and Coding sessions through one TLS listener", async () => {
    const dataRoot = await createTempDir("wanex-server-domains-data-")
    const repositoryPath = await createRepository()
    const certificate = await createTestCertificate()
    certificates.push(certificate)
    const server = await startWanexServer({
      config: {
        dataRoot,
        profileId: "remote-domains",
        hostId: "server:remote-domains",
        listener: { hostname: "127.0.0.1", port: 0 },
        coding: {
          execution: { kind: "native" },
          projects: [{ repositoryPath }]
        }
      },
      serviceBin,
      tls: certificate,
      authentication: new TestAuthentication(),
      credentialStore: new MemorySecretStore(),
      modelEndpoints: {
        endpoints: [fakeEndpoint()],
        activeEndpointId: "server-remote-domains"
      },
      remoteLimits: { requestTimeoutMs: 2_000, maxEventSubscribers: 2 }
    })
    servers.push(server)

    const fetch = createHttpsFetch(certificate.cert)
    const assistant = await createRemoteAssistantAgentHostComposition({
      messageUrl: server.endpoint.messageUrl,
      getBearerToken: () => "valid-server-token",
      fetch,
      clientId: "shared-listener-assistant"
    })
    assistantClients.push(assistant)
    const coding = await createRemoteCodingAgentHostComposition({
      messageUrl: server.endpoint.messageUrl,
      getBearerToken: () => "valid-server-token",
      fetch,
      clientId: "shared-listener-coding"
    })
    codingClients.push(coding)

    const [status, projects] = await Promise.all([
      assistant.client.readStatus(),
      coding.client.listProjects()
    ])
    expect(status).toMatchObject({ kind: "assistant.status", disposed: false })
    expect(projects).toEqual([
      expect.objectContaining({
        projectId: expect.stringMatching(/^repo_[a-f0-9]{40}$/),
        name: basename(repositoryPath),
        state: "ready"
      })
    ])
    expect(JSON.stringify({ status: server.readStatus(), projects }))
      .not.toContain(repositoryPath)

    const assistantEvents = assistant.startEvents()
    const codingEvents = coding.startEvents()
    await Promise.all([assistantEvents.ready, codingEvents.ready])

    const mixed = await postMessage(fetch, server.endpoint.messageUrl, {
      kind: "wanex.agent-host.handshake.request",
      protocolVersion: 1,
      clientId: "mixed-domain-client",
      accessToken: "client-only-value",
      requestedDomains: ["assistant", "coding"]
    })
    expect(mixed.response.status).toBe(403)
    expect(mixed.body).toMatchObject({ error: { code: "unauthorized" } })
    expect(mixed.response.headers.get("x-wanex-host-session")).toBeNull()

    const assistantHandshake = await handshake(
      fetch,
      server.endpoint.messageUrl,
      "raw-assistant-client",
      "assistant"
    )
    const codingThroughAssistant = await postMessage(
      fetch,
      server.endpoint.messageUrl,
      operation("coding", "coding.read"),
      assistantHandshake
    )
    expect(codingThroughAssistant.response.status).toBe(403)
    expect(codingThroughAssistant.body).toMatchObject({
      error: { code: "unauthorized" }
    })

    const codingHandshake = await handshake(
      fetch,
      server.endpoint.messageUrl,
      "raw-coding-client",
      "coding"
    )
    const assistantThroughCoding = await postMessage(
      fetch,
      server.endpoint.messageUrl,
      operation("assistant", "assistant.surface.read"),
      codingHandshake
    )
    expect(assistantThroughCoding.response.status).toBe(403)
    expect(assistantThroughCoding.body).toMatchObject({
      error: { code: "unauthorized" }
    })

    assistantEvents.close()
    codingEvents.close()
    await Promise.all([assistantEvents.closed, codingEvents.closed])
  })

  it("rejects Coding when the Server has no Coding catalog", async () => {
    const certificate = await createTestCertificate()
    certificates.push(certificate)
    const server = await startWanexServer({
      config: {
        dataRoot: await createTempDir("wanex-server-assistant-only-data-"),
        profileId: "assistant-only",
        listener: { hostname: "127.0.0.1", port: 0 }
      },
      serviceBin,
      tls: certificate,
      authentication: new TestAuthentication(),
      credentialStore: new MemorySecretStore(),
      modelEndpoints: {
        endpoints: [fakeEndpoint()],
        activeEndpointId: "server-remote-domains"
      }
    })
    servers.push(server)

    expect(server.readStatus()).toMatchObject({
      assistant: "ready",
      coding: "disabled"
    })
    const fetch = createHttpsFetch(certificate.cert)
    const rejected = await postMessage(fetch, server.endpoint.messageUrl, {
      kind: "wanex.agent-host.handshake.request",
      protocolVersion: 1,
      clientId: "unavailable-coding-client",
      accessToken: "client-only-value",
      requestedDomains: ["coding"]
    })
    expect(rejected.response.status).toBe(403)
    expect(rejected.body).toMatchObject({ error: { code: "unauthorized" } })
    expect(rejected.response.headers.get("x-wanex-host-session")).toBeNull()

    const assistant = await createRemoteAssistantAgentHostComposition({
      messageUrl: server.endpoint.messageUrl,
      getBearerToken: () => "valid-server-token",
      fetch,
      clientId: "available-assistant-client"
    })
    assistantClients.push(assistant)
    await expect(assistant.client.readStatus()).resolves.toMatchObject({
      kind: "assistant.status",
      disposed: false
    })
  })
})

async function handshake(
  fetch: typeof globalThis.fetch,
  messageUrl: string,
  clientId: string,
  domain: "assistant" | "coding"
): Promise<string> {
  const result = await postMessage(fetch, messageUrl, {
    kind: "wanex.agent-host.handshake.request",
    protocolVersion: 1,
    clientId,
    accessToken: "client-only-value",
    requestedDomains: [domain]
  })
  expect(result.response.status).toBe(200)
  const sessionId = result.response.headers.get("x-wanex-host-session")
  expect(sessionId).toBeTruthy()
  return sessionId!
}

async function postMessage(
  fetch: typeof globalThis.fetch,
  messageUrl: string,
  body: unknown,
  sessionId?: string
): Promise<{ readonly response: Response; readonly body: unknown }> {
  const response = await fetch(messageUrl, {
    method: "POST",
    headers: {
      authorization: "Bearer valid-server-token",
      "content-type": "application/json",
      ...(sessionId === undefined
        ? {}
        : { "x-wanex-host-session": sessionId })
    },
    body: JSON.stringify(body)
  })
  return { response, body: await response.json() }
}

function operation(domain: "assistant" | "coding", operation: string) {
  return {
    kind: "wanex.agent-host.operation.request",
    operationKind: "read",
    requestId: `cross-${domain}`,
    domain,
    operation,
    payload: {}
  }
}

async function createTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

async function createRepository(): Promise<string> {
  const repositoryPath = await createTempDir("wanex-server-domains-repository-")
  await execFileAsync("git", ["init", "--initial-branch=main", repositoryPath])
  await writeFile(join(repositoryPath, "README.md"), "# Remote Domains Test\n")
  await execFileAsync("git", ["-C", repositoryPath, "add", "README.md"])
  await execFileAsync("git", [
    "-c",
    "user.name=Wanex Test",
    "-c",
    "user.email=wanex@example.test",
    "-C",
    repositoryPath,
    "commit",
    "-m",
    "initial"
  ])
  return repositoryPath
}

function fakeEndpoint() {
  return {
    id: "server-remote-domains",
    connection: { id: "server-remote-domains", providerId: "fake" },
    protocol: { id: "fake" as const },
    model: {
      id: "server-remote-domains-model",
      operations: ["conversation" as const],
      inputModalities: ["text" as const],
      outputModalities: ["text" as const],
      features: ["tool_calling" as const],
      catalog: {
        source: "custom" as const,
        catalogId: "wanex.server.remote-domains.test",
        revision: "1"
      }
    }
  }
}

class TestAuthentication {
  async authenticateBearerToken(token: string) {
    return token === "valid-server-token"
      ? { subjectId: "server-product-subject", expiresAt: Date.now() + 60_000 }
      : null
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
