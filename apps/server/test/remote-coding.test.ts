import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { join } from "node:path"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { afterEach, describe, expect, it } from "vitest"
import {
  createRemoteAssistantAgentHostComposition,
  type RemoteAssistantAgentHostComposition
} from "@wanex/assistant-host"
import {
  createRemoteCodingAgentHostComposition,
  type RemoteCodingAgentHostComposition
} from "@wanex/coding/host"
import type { SecretResolveContext, SecretStorePort } from "@wanex/runtime/secrets"
import { InMemoryResolvedSecret } from "@wanex/runtime/secrets"
import { startWanexServer } from "../src/index.js"
import type { WanexServer } from "../src/model.js"
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
const providers: LocalOpenAIProvider[] = []
const servers: WanexServer[] = []
const clients: Array<RemoteAssistantAgentHostComposition | RemoteCodingAgentHostComposition> = []

afterEach(async () => {
  while (clients.length > 0) await clients.pop()?.close()
  while (servers.length > 0) await servers.pop()?.close()
  while (providers.length > 0) await providers.pop()?.close()
  while (certificates.length > 0) await certificates.pop()?.close()
  while (tempDirs.length > 0) {
    const directory = tempDirs.pop()
    if (directory !== undefined) await rm(directory, { recursive: true, force: true })
  }
})

describe("Wanex Server remote Coding acceptance", () => {
  it("executes, reviews, applies, restarts, recovers, and undoes a remote Coding turn", async () => {
    const dataRoot = await tempDir("wanex-server-remote-coding-data-")
    const repositoryPath = await createRepository()
    const certificate = await createTestCertificate()
    certificates.push(certificate)
    const provider = await LocalOpenAIProvider.start()
    providers.push(provider)
    const credentialStore = new MemorySecretStore()
    await credentialStore.put({ ref: "test-secret://server-coding", value: "local-provider-secret" })

    const endpoint = modelEndpoint(provider.url)
    const server = await startWanexServer({
      config: {
        dataRoot,
        profileId: "remote-coding",
        hostId: "server:remote-coding",
        listener: { hostname: "127.0.0.1", port: 0 },
        coding: {
          execution: { kind: "native" },
          projects: [{ repositoryPath }]
        }
      },
      serviceBin,
      tls: certificate,
      authentication: new TestAuthentication(),
      credentialStore,
      modelEndpoints: { endpoints: [endpoint], activeEndpointId: endpoint.id },
      remoteLimits: { requestTimeoutMs: 5_000, maxEventSubscribers: 4 }
    })
    servers.push(server)

    const coding = await createRemoteCodingAgentHostComposition({
      messageUrl: server.endpoint.messageUrl,
      getBearerToken: () => "valid-server-token",
      fetch: createHttpsFetch(certificate.cert),
      clientId: "remote-coding-client",
      createRequestId: requestIds("coding")
    })
    clients.push(coding)
    const codingEvents: unknown[] = []
    coding.client.subscribe((event) => codingEvents.push(event))
    const codingStream = coding.startEvents()
    await codingStream.ready

    const assistant = await createRemoteAssistantAgentHostComposition({
      messageUrl: server.endpoint.messageUrl,
      getBearerToken: () => "valid-server-token",
      fetch: createHttpsFetch(certificate.cert),
      clientId: "remote-assistant-client",
      createRequestId: requestIds("assistant")
    })
    clients.push(assistant)

    const projects = await coding.client.listProjects()
    expect(projects).toHaveLength(1)
    const projectId = projects[0]!.projectId
    expect(JSON.stringify(projects)).not.toContain(repositoryPath)
    expect(JSON.stringify(projects)).not.toContain(dataRoot)

    const codingStart = await coding.client.startTurn({
      projectId,
      idempotencyKey: "remote-coding-turn",
      content: [{ type: "text", text: "create the acceptance file" }],
      title: "Remote Coding acceptance",
      proposalTitle: "Create acceptance file"
    })
    const assistantRequest = await assistant.client.submitConversation({
      text: "run a concurrent assistant request",
      sessionId: "remote-assistant-session",
      idempotencyKey: "remote-assistant-concurrent"
    })
    expect(codingStart.projectId).toBe(projectId)
    expect(assistantRequest).toMatchObject({ operationId: expect.any(String) })

    const approvalTurn = await waitForTurn(coding, projectId, codingStart.turnId, (turn) =>
      turn.approvals.items.length === 1
    )
    const approval = approvalTurn.approvals.items[0]!
    expect(approval.tool.name).toBe("workspace_apply_changeset")
    expect(JSON.stringify(approval)).not.toContain(repositoryPath)
    expect(JSON.stringify(approval)).not.toContain("local-provider-secret")

    await coding.client.resolveTurnApproval({
      projectId,
      turnId: codingStart.turnId,
      executionId: approval.executionId,
      expectedApprovalRevision: approval.approvalRevision,
      decision: "approve_once",
      reason: "acceptance test approval",
      idempotencyKey: "remote-coding-approval"
    })

    const completed = await waitForTurn(coding, projectId, codingStart.turnId, (turn) =>
      turn.result === "proposal_available"
    )
    const proposalId = completed.proposalId
    expect(proposalId).toBeTruthy()
    const openProposal = await coding.client.readProposal({ projectId, proposalId: proposalId! })
    expect(openProposal).toMatchObject({
      state: "open",
      changeState: "submitted",
      files: [{ path: "acceptance.txt", kind: "create" }]
    })
    expect(JSON.stringify(openProposal)).not.toContain(repositoryPath)
    expect(JSON.stringify(openProposal)).not.toContain(dataRoot)

    const approved = await coding.client.decideProposal({
      projectId,
      proposalId: proposalId!,
      decision: "approve",
      reason: "reviewed remotely",
      idempotencyKey: "remote-coding-proposal-approve"
    })
    expect(approved.proposal.state).toBe("approved")
    await coding.client.requestProposalApply({
      projectId,
      proposalId: proposalId!,
      reason: "apply remotely",
      idempotencyKey: "remote-coding-proposal-request-apply"
    })
    const applied = await coding.client.applyProposal({
      projectId,
      proposalId: proposalId!,
      idempotencyKey: "remote-coding-proposal-apply"
    })
    expect(applied.status).toBe("applied")
    expect(applied.mutation?.files).toEqual([
      expect.objectContaining({ path: "acceptance.txt", kind: "create" })
    ])
    await expect(readFile(join(repositoryPath, "acceptance.txt"), "utf8"))
      .resolves.toBe("remote coding\n")
    await expect(coding.client.applyProposal({
      projectId,
      proposalId: proposalId!,
      idempotencyKey: "remote-coding-proposal-apply"
    })).resolves.toMatchObject({ status: "already_terminal" })

    const serializedEvents = JSON.stringify(codingEvents)
    expect(serializedEvents).toContain("proposal_applied")
    expect(serializedEvents).not.toContain(repositoryPath)
    expect(serializedEvents).not.toContain(dataRoot)
    const providerRequests = provider.readRequests()
    expect(providerRequests.length).toBeGreaterThanOrEqual(2)
    expect(providerRequests[0]?.authorization).toBe("Bearer local-provider-secret")
    expect(providerRequests.some((request) =>
      Array.isArray(request.body.messages) &&
      request.body.messages.some((message) =>
        typeof message === "object" && message !== null &&
        (message as { role?: unknown }).role === "tool"
      )
    )).toBe(true)

    codingStream.close()
    await codingStream.closed
    await coding.close()
    clients.splice(clients.indexOf(coding), 1)
    await assistant.close()
    clients.splice(clients.indexOf(assistant), 1)
    await server.close()
    servers.pop()

    const relaunched = await startWanexServer({
      config: {
        dataRoot,
        profileId: "remote-coding",
        hostId: "server:remote-coding",
        listener: { hostname: "127.0.0.1", port: 0 },
        coding: {
          execution: { kind: "native" },
          projects: [{ repositoryPath }]
        }
      },
      serviceBin,
      tls: certificate,
      authentication: new TestAuthentication(),
      credentialStore,
      modelEndpoints: { endpoints: [endpoint], activeEndpointId: endpoint.id }
    })
    servers.push(relaunched)
    const recovered = await createRemoteCodingAgentHostComposition({
      messageUrl: relaunched.endpoint.messageUrl,
      getBearerToken: () => "valid-server-token",
      fetch: createHttpsFetch(certificate.cert),
      clientId: "remote-coding-recovery-client",
      createRequestId: requestIds("recovery")
    })
    clients.push(recovered)
    const recoveredProject = (await recovered.client.listProjects())[0]!
    const recoveredProposal = await recovered.client.readProposal({
      projectId: recoveredProject.projectId,
      proposalId: proposalId!
    })
    expect(recoveredProposal).toMatchObject({ state: "applied", changeState: "applied" })

    const undone = await recovered.client.undoProposal({
      projectId: recoveredProject.projectId,
      proposalId: proposalId!,
      idempotencyKey: "remote-coding-proposal-undo"
    })
    expect(undone).toMatchObject({ status: "applied", replayed: false })
    await expect(recovered.client.undoProposal({
      projectId: recoveredProject.projectId,
      proposalId: proposalId!,
      idempotencyKey: "remote-coding-proposal-undo"
    })).resolves.toMatchObject({ status: "applied", replayed: true })
    await expect(readFile(join(repositoryPath, "acceptance.txt"), "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" })
  }, 30_000)
})

async function waitForTurn(
  client: RemoteCodingAgentHostComposition,
  projectId: string,
  turnId: string,
  predicate: (turn: NonNullable<Awaited<ReturnType<RemoteCodingAgentHostComposition["client"]["readTurn"]>>>) => boolean
) {
  const deadline = Date.now() + 10_000
  while (true) {
    const turn = await client.client.readTurn({ projectId, turnId })
    if (turn !== null && predicate(turn)) return turn
    if (Date.now() >= deadline) throw new Error(`remote Coding turn did not reach expected state: ${turn?.state}`)
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

async function tempDir(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(directory)
  return directory
}

async function createRepository(): Promise<string> {
  const repositoryPath = await tempDir("wanex-server-remote-coding-repository-")
  await runGit(repositoryPath, ["init", "--initial-branch=main"])
  await runGit(repositoryPath, ["config", "user.name", "Wanex Test"])
  await runGit(repositoryPath, ["config", "user.email", "wanex@example.test"])
  await writeFile(join(repositoryPath, "README.md"), "base\n")
  await runGit(repositoryPath, ["add", "README.md"])
  await runGit(repositoryPath, ["commit", "-m", "initial"])
  return repositoryPath
}

async function runGit(directory: string, args: string[]): Promise<void> {
  const { execFile } = await import("node:child_process")
  await new Promise<void>((resolve, reject) => {
    const child = execFile("git", ["-C", directory, ...args], (error) => error == null ? resolve() : reject(error))
    child.stdin?.end()
  })
}

function modelEndpoint(baseUrl: string) {
  return {
    id: "remote-coding-model",
    connection: {
      id: "remote-coding-connection",
      providerId: "local-acceptance-provider",
      baseUrl,
      secretRef: "test-secret://server-coding"
    },
    protocol: { id: "openai-chat-completions" as const },
    model: {
      id: "remote-coding-model",
      operations: ["conversation" as const],
      inputModalities: ["text" as const],
      outputModalities: ["text" as const],
      features: ["tool_calling" as const],
      catalog: {
        source: "custom" as const,
        catalogId: "wanex.server.remote-coding.acceptance",
        revision: "1"
      }
    }
  }
}

function requestIds(prefix: string): () => string {
  let sequence = 0
  return () => `${prefix}-${++sequence}`
}

class TestAuthentication {
  async authenticateBearerToken(token: string) {
    return token === "valid-server-token"
      ? { subjectId: "server-acceptance-subject", expiresAt: Date.now() + 60_000 }
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

  async resolve(ref: string, _context?: SecretResolveContext): Promise<InMemoryResolvedSecret> {
    const value = this.#values.get(ref)
    if (value === undefined) throw new Error("acceptance provider secret is missing")
    return new InMemoryResolvedSecret({ ref, provider: this.scheme, value })
  }
}

class LocalOpenAIProvider {
  readonly #server: ReturnType<typeof createServer>
  readonly #requests: Array<{
    readonly body: Record<string, unknown>
    readonly authorization: string | undefined
  }> = []
  readonly url: string

  private constructor(server: ReturnType<typeof createServer>, url: string) {
    this.#server = server
    this.url = url
  }

  static async start(): Promise<LocalOpenAIProvider> {
    let provider!: LocalOpenAIProvider
    const server = createServer((request, response) => {
      void provider.handle(request, response)
    })
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject)
      server.listen(0, "127.0.0.1", () => resolve())
    })
    const address = server.address()
    if (address === null || typeof address === "string") throw new Error("provider did not bind")
    provider = new LocalOpenAIProvider(server, `http://127.0.0.1:${address.port}`)
    return provider
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve, reject) => this.#server.close((error) => error === undefined ? resolve() : reject(error)))
  }

  readRequests() {
    return this.#requests.map((request) => ({ ...request }))
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.method !== "POST" || request.url !== "/chat/completions") {
      response.writeHead(404).end()
      return
    }
    const body = await readRequestBody(request)
    const parsed = JSON.parse(body) as { messages?: unknown; tools?: unknown; model?: unknown }
    this.#requests.push({
      body: parsed as Record<string, unknown>,
      authorization: request.headers.authorization
    })
    const messages = Array.isArray(parsed.messages) ? parsed.messages : []
    const hasToolResult = messages.some((message) =>
      typeof message === "object" && message !== null && (message as { role?: unknown }).role === "tool"
    )
    const payload = hasToolResult
      ? [
          sse({ choices: [{ delta: { content: "remote coding complete" }, finish_reason: null }] }),
          sse({ choices: [{ delta: {}, finish_reason: "stop" }] }),
          "data: [DONE]\n\n"
        ]
      : [
          sse({ choices: [{ delta: { tool_calls: [{ index: 0, id: "call_acceptance", function: { name: "workspace_apply_changeset", arguments: JSON.stringify({ title: "Create acceptance file", changes: [{ path: "acceptance.txt", kind: "create", targetText: "remote coding\n" }] }) } }] }, finish_reason: null }] }),
          sse({ choices: [{ delta: {}, finish_reason: "tool_calls" }] }),
          "data: [DONE]\n\n"
        ]
    response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" })
    for (const chunk of payload) {
      response.write(chunk)
      await new Promise((resolve) => setImmediate(resolve))
    }
    response.end()
  }
}

function sse(value: unknown): string {
  return `data: ${JSON.stringify(value)}\n\n`
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString("utf8")
}
