import { createServer, type Server } from "node:http"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"
import { WanexMcpHttpServerHost } from "@wanex/mcp/server"
import {
  EnvSecretProvider,
  InMemoryResolvedSecret,
  SecretResolver,
  type SecretResolveContext,
  type SecretStorePort,
} from "@wanex/runtime/secrets"
import {
  AllowAllToolsPolicy,
  EchoTool,
  ToolRegistry,
  type ToolExecutionRequest,
} from "@wanex/runtime/tools"
import type {
  BeginToolExecutionRequest,
  FinishToolExecutionRequest,
  JsonValue,
  ToolExecutionAttemptRecord,
  ToolExecutionRecord,
} from "@wanex/protocol"
import {
  startAssistantWebApp,
  type AssistantWebApp,
} from "../src/index.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)
const stdioFixture = fileURLToPath(new URL(
  "../../../packages/mcp/test/fixtures/stdio-server.mjs",
  import.meta.url
))
const providerSecretRef = "env://WANEX_MCP_PRODUCT_PROVIDER_KEY"
const providerSecret = "mcp-product-provider-secret"
const mcpSecret = "Bearer mcp-product-private-token"
const apps: AssistantWebApp[] = []
const servers: Server[] = []
const mcpHosts: WanexMcpHttpServerHost[] = []
const tempDirs: string[] = []
type McpProductToolStorage = ToolExecutionRequest["storage"]

afterEach(async () => {
  while (apps.length > 0) await apps.pop()?.close()
  while (mcpHosts.length > 0) await mcpHosts.pop()?.dispose()
  while (servers.length > 0) await closeServer(servers.pop())
  while (tempDirs.length > 0) {
    await rm(tempDirs.pop()!, { recursive: true, force: true })
  }
})

describe("Assistant Host MCP product acceptance", () => {
  it("configures, runs, restores, and removes HTTP and stdio tool servers", async () => {
    const provider = await listenToolCallingProvider()
    const mcp = await listenHttpMcpServer()
    const storeDir = await createTempDir("wanex-mcp-product-")
    const credentialStore = new MemorySecretStore()
    let app = await startProductApp({
      storeDir,
      providerBaseUrl: provider.baseUrl,
      credentialStore,
    })
    apps.push(app)

    const token = await readHostSessionToken(app.url)
    const setup = await postMcp(app.url, token, "stage-credential", {
      serverId: "remote-tools",
      transport: "streamable_http",
      name: "Authorization",
      value: mcpSecret,
    }) as {
      readonly ok: boolean
      readonly result: { readonly setupId: string }
    }
    expect(setup).toMatchObject({
      ok: true,
      result: { kind: "assistant-host.mcp-credential-setup" },
    })
    expect(JSON.stringify(setup)).not.toContain(mcpSecret)
    expect(JSON.stringify(setup)).not.toContain("secretRef")

    const configuredHttp = await postMcp(app.url, token, "save-server", {
      serverId: "remote-tools",
      expectedRevision: null,
      label: "Remote tools",
      enabled: true,
      connectTimeoutMs: 5_000,
      requestTimeoutMs: 5_000,
      transport: {
        kind: "streamable_http",
        url: mcp.url,
        headers: [{
          name: "Authorization",
          source: { kind: "credential", setupId: setup.result.setupId },
        }],
      },
    })
    expect(configuredHttp).toMatchObject({
      ok: true,
      result: {
        kind: "applied",
        reloadOutcome: "published",
        credentialCleanupPending: false,
      },
    })
    const configuredStdio = await postMcp(app.url, token, "save-server", {
      serverId: "local-tools",
      expectedRevision: null,
      label: "Local tools",
      enabled: true,
      connectTimeoutMs: 5_000,
      requestTimeoutMs: 5_000,
      transport: {
        kind: "stdio",
        command: process.execPath,
        args: [stdioFixture],
        cwd: dirname(stdioFixture),
        environment: [],
      },
    })
    expect(configuredStdio).toMatchObject({
      ok: true,
      result: { kind: "applied", reloadOutcome: "published" },
    })

    const listed = await getMcp(app.url, token)
    expect(listed).toMatchObject({
      ok: true,
      servers: {
        servers: expect.arrayContaining([
          expect.objectContaining({
            serverId: "local-tools",
            runtimeState: "ready",
            toolCount: 5,
          }),
          expect.objectContaining({
            serverId: "remote-tools",
            runtimeState: "ready",
            toolCount: 1,
            credentialState: "configured",
          }),
        ]),
      },
    })
    const safeList = JSON.stringify(listed)
    for (const forbidden of [
      process.execPath,
      stdioFixture,
      mcp.url,
      mcpSecret,
      "secretRef",
      "headers",
      "environment",
    ]) expect(safeList).not.toContain(forbidden)

    await expect(postMcp(app.url, token, "update-server", {
      serverId: "remote-tools",
      expectedRevision: 2,
      label: "Stale rename",
    })).resolves.toMatchObject({
      result: {
        kind: "conflict",
        currentRevision: 1,
        servers: {
          servers: expect.arrayContaining([
            expect.objectContaining({
              serverId: "remote-tools",
              label: "Remote tools",
              revision: 1,
            }),
          ]),
        },
      },
    })
    await expect(postMcp(app.url, token, "set-server-enabled", {
      serverId: "local-tools",
      expectedRevision: 2,
      enabled: false,
    })).resolves.toMatchObject({
      result: { kind: "conflict", currentRevision: 1 },
    })
    await expect(postMcp(app.url, token, "remove-server", {
      serverId: "local-tools",
      expectedRevision: 2,
    })).resolves.toMatchObject({
      result: { kind: "conflict", currentRevision: 1 },
    })

    await submitConversation(app, "Use both configured echo tools.")
    const first = await waitForConversationTerminal(app)
    expect(first.web.conversation).toMatchObject({
      state: "succeeded",
      operation: {
        result: { assistantText: "Both tool servers replied." },
        capabilities: { terminal: true },
      },
    })
    expect(provider.toolResults()).toEqual([
      ["call_remote_echo", "call_local_echo"],
    ])

    await expect(postMcp(app.url, token, "set-server-enabled", {
      serverId: "local-tools",
      expectedRevision: 1,
      enabled: false,
    })).resolves.toMatchObject({
      result: {
        kind: "applied",
        reloadOutcome: "published",
        servers: {
          servers: expect.arrayContaining([
            expect.objectContaining({
              serverId: "local-tools",
              runtimeState: "stopped",
              revision: 2,
            }),
          ]),
        },
      },
    })

    const rejectedSetup = await postMcp(app.url, token, "stage-credential", {
      serverId: "remote-tools",
      transport: "streamable_http",
      name: "Authorization",
      value: mcpSecret,
    }) as { readonly result: { readonly setupId: string } }
    const rejected = await postMcp(app.url, token, "save-server", {
      serverId: "remote-tools",
      expectedRevision: 1,
      label: "Rejected remote tools",
      enabled: true,
      connectTimeoutMs: 500,
      requestTimeoutMs: 5_000,
      transport: {
        kind: "streamable_http",
        url: "http://127.0.0.1:1/mcp",
        headers: [{
          name: "Authorization",
          source: {
            kind: "credential",
            setupId: rejectedSetup.result.setupId,
          },
        }],
      },
    })
    expect(rejected).toMatchObject({
      result: {
        kind: "applied",
        reloadOutcome: "rejected",
        servers: {
          servers: expect.arrayContaining([
            expect.objectContaining({
              serverId: "remote-tools",
              label: "Rejected remote tools",
              revision: 2,
              configurationState: "rejected",
              runtimeState: "ready",
            }),
          ]),
        },
      },
    })

    const repairedSetup = await postMcp(app.url, token, "stage-credential", {
      serverId: "remote-tools",
      transport: "streamable_http",
      name: "Authorization",
      value: mcpSecret,
    }) as { readonly result: { readonly setupId: string } }
    await expect(postMcp(app.url, token, "save-server", {
      serverId: "remote-tools",
      expectedRevision: 2,
      label: "Remote tools",
      enabled: true,
      connectTimeoutMs: 5_000,
      requestTimeoutMs: 5_000,
      transport: {
        kind: "streamable_http",
        url: mcp.url,
        headers: [{
          name: "Authorization",
          source: {
            kind: "credential",
            setupId: repairedSetup.result.setupId,
          },
        }],
      },
    })).resolves.toMatchObject({
      result: {
        kind: "applied",
        reloadOutcome: "published",
        credentialCleanupPending: false,
      },
    })
    await expect(postMcp(app.url, token, "set-server-enabled", {
      serverId: "local-tools",
      expectedRevision: 2,
      enabled: true,
    })).resolves.toMatchObject({
      result: { kind: "applied", reloadOutcome: "published" },
    })
    expect(credentialStore.refs()).toHaveLength(1)
    const credentialRef = credentialStore.refs()[0]!
    expect(await readFile(join(storeDir, "state.db"))).not.toContain(mcpSecret)

    apps.pop()
    await app.close()
    app = await startProductApp({
      storeDir,
      providerBaseUrl: provider.baseUrl,
      credentialStore,
    })
    apps.push(app)
    const restartedToken = await readHostSessionToken(app.url)
    const restored = await getMcp(app.url, restartedToken)
    expect(restored).toMatchObject({
      servers: {
        servers: expect.arrayContaining([
          expect.objectContaining({ serverId: "local-tools", runtimeState: "ready" }),
          expect.objectContaining({ serverId: "remote-tools", runtimeState: "ready" }),
        ]),
      },
    })
    expect(JSON.stringify(restored)).not.toContain(credentialRef)

    await submitConversation(app, "Use both echo tools again.")
    await expect(waitForConversationTerminal(app)).resolves.toMatchObject({
      web: {
        conversation: {
          state: "succeeded",
          operation: { result: { assistantText: "Both tool servers replied." } },
        },
      },
    })
    expect(provider.toolResults()).toEqual([
      ["call_remote_echo", "call_local_echo"],
      ["call_remote_echo", "call_local_echo"],
    ])

    const revisions = serverRevisions(restored)
    await expect(postMcp(app.url, restartedToken, "remove-server", {
      serverId: "remote-tools",
      expectedRevision: revisions.get("remote-tools"),
    })).resolves.toMatchObject({
      result: { kind: "applied", credentialCleanupPending: false },
    })
    expect(credentialStore.refs()).toEqual([])
    await expect(postMcp(app.url, restartedToken, "remove-server", {
      serverId: "local-tools",
      expectedRevision: revisions.get("local-tools"),
    })).resolves.toMatchObject({ result: { kind: "applied" } })
    await expect(getMcp(app.url, restartedToken)).resolves.toMatchObject({
      servers: { servers: [] },
    })
  })
})

async function listenHttpMcpServer(): Promise<{
  readonly url: string
}> {
  const storage = new McpEchoExecutionStore()
  const registry = new ToolRegistry()
  registry.register(new EchoTool())
  let invocation = 0
  const host = new WanexMcpHttpServerHost({
    registry,
    async resolveExecutionContext() {
      invocation += 1
      return {
        principalId: "mcp-product-server",
        sessionId: "mcp-product-server-session",
        inputId: `mcp-product-server-input-${invocation}`,
        turnId: `mcp-product-server-turn-${invocation}`,
        attemptId: `mcp-product-server-attempt-${invocation}`,
        sourceMessageId: `mcp-product-server-message-${invocation}`,
        jobId: `mcp-product-server-job-${invocation}`,
        workerId: "mcp-product-server-worker",
        leaseToken: `mcp-product-server-lease-${invocation}`,
        idempotencyKey: `mcp-product-server:${invocation}`,
        permissionPolicy: new AllowAllToolsPolicy(),
        storage,
      }
    },
  })
  await host.start()
  mcpHosts.push(host)
  return { url: host.url() }
}

async function listenToolCallingProvider(): Promise<{
  readonly baseUrl: string
  toolResults(): readonly (readonly string[])[]
}> {
  const completedTurns: string[][] = []
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown
    const results = observedToolResults(body)
    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
    })
    if (!results.includes("call_remote_echo")) {
      response.end(toolCallStream(
        "call_remote_echo",
        "remote-tools__echo",
        { source: "remote" }
      ))
      return
    }
    if (!results.includes("call_local_echo")) {
      response.end(toolCallStream(
        "call_local_echo",
        "local-tools__echo",
        { source: "local" }
      ))
      return
    }
    completedTurns.push(results)
    response.end(textStream("Both tool servers replied."))
  })
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  servers.push(server)
  const address = server.address()
  if (address === null || typeof address === "string") {
    throw new Error("MCP product Provider did not bind a TCP address")
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    toolResults: () => completedTurns,
  }
}

async function startProductApp(request: {
  readonly storeDir: string
  readonly providerBaseUrl: string
  readonly credentialStore: SecretStorePort
}): Promise<AssistantWebApp> {
  return await startAssistantWebApp({
    storage: {
      kind: "store-dir",
      mode: "persistent",
      storeDir: request.storeDir,
    },
    serviceBin,
    credentialStore: request.credentialStore,
    secretResolver: new SecretResolver([
      new EnvSecretProvider({ WANEX_MCP_PRODUCT_PROVIDER_KEY: providerSecret }),
    ]),
    modelEndpoints: {
      endpoints: [{
        id: "mcp-product-provider",
        connection: {
          id: "mcp-product-provider",
          providerId: "openai-compatible",
          baseUrl: request.providerBaseUrl,
          secretRef: providerSecretRef,
        },
        protocol: { id: "openai-chat-completions" },
        model: {
          id: "mcp-product-model",
          operations: ["conversation"],
          inputModalities: ["text"],
          outputModalities: ["text"],
          features: ["tool_calling"],
          catalog: {
            source: "custom",
            catalogId: "assistant-host.test.mcp-product",
            revision: "1",
          },
        },
      }],
      activeEndpointId: "mcp-product-provider",
    },
    web: { hostname: "127.0.0.1", port: 0 },
  })
}

async function submitConversation(app: AssistantWebApp, text: string): Promise<void> {
  const token = await readHostSessionToken(app.url)
  const response = await fetch(`${app.url}/wanex/assistant/request`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-wanex-host-session": token,
    },
    body: JSON.stringify({
      kind: "web.request",
      operation: "dispatchAction",
      requestId: globalThis.crypto.randomUUID(),
      action: { type: "submit-conversation", input: { text } },
    }),
  })
  expect(response.status).toBe(200)
  await expect(response.json()).resolves.toMatchObject({
    ok: true,
    operation: "dispatchAction",
    actionResult: { ok: true },
  })
}

async function waitForConversationTerminal(app: AssistantWebApp) {
  let latest: Awaited<ReturnType<AssistantWebApp["readSnapshot"]>> | undefined
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const snapshot = await app.readSnapshot()
    latest = snapshot
    if (snapshot.web.conversation.operation?.capabilities.terminal) return snapshot
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(
    `MCP product conversation did not finish: ${JSON.stringify(latest?.web.conversation)}`
  )
}

async function postMcp(
  url: string,
  token: string,
  operation: string,
  request: unknown
): Promise<unknown> {
  const response = await fetch(`${url}/wanex/assistant/mcp-settings`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-wanex-host-session": token,
    },
    body: JSON.stringify({ operation, request }),
  })
  expect(response.status).toBe(200)
  return await response.json()
}

async function getMcp(url: string, token: string): Promise<unknown> {
  const response = await fetch(`${url}/wanex/assistant/mcp-settings`, {
    headers: { "x-wanex-host-session": token },
  })
  expect(response.status).toBe(200)
  return await response.json()
}

function serverRevisions(value: unknown): Map<string, number> {
  if (!isRecord(value) || !isRecord(value.servers) ||
    !Array.isArray(value.servers.servers)) {
    throw new Error("MCP product server list is invalid")
  }
  return new Map(value.servers.servers.flatMap((server) =>
    isRecord(server) && typeof server.serverId === "string" &&
      typeof server.revision === "number"
      ? [[server.serverId, server.revision] as const]
      : []
  ))
}

function observedToolResults(body: unknown): string[] {
  if (!isRecord(body) || !Array.isArray(body.messages)) return []
  return body.messages.flatMap((message) =>
    isRecord(message) && message.role === "tool" &&
      typeof message.tool_call_id === "string"
      ? [message.tool_call_id]
      : []
  )
}

function toolCallStream(
  id: string,
  name: string,
  input: Record<string, unknown>
): string {
  return [
    `data: ${JSON.stringify({
      choices: [{
        delta: {
          tool_calls: [{
            index: 0,
            id,
            type: "function",
            function: { name, arguments: JSON.stringify(input) },
          }],
        },
        finish_reason: null,
      }],
    })}\n\n`,
    `data: ${JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    })}\n\n`,
    "data: [DONE]\n\n",
  ].join("")
}

function textStream(text: string): string {
  return [
    `data: ${JSON.stringify({
      choices: [{ delta: { content: text }, finish_reason: null }],
    })}\n\n`,
    `data: ${JSON.stringify({
      choices: [{ delta: {}, finish_reason: "stop" }],
    })}\n\n`,
    "data: [DONE]\n\n",
  ].join("")
}

async function readHostSessionToken(url: string): Promise<string> {
  const response = await fetch(new URL("/", url))
  const html = await response.text()
  const token = /data-host-session-token="([^"]+)"/u.exec(html)?.[1]
  if (token === undefined) throw new Error("Assistant Host session token is missing")
  return token
}

async function createTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

async function closeServer(server: Server | undefined): Promise<void> {
  if (server === undefined || !server.listening) return
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error === undefined ? resolve() : reject(error))
    server.closeAllConnections()
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

class MemorySecretStore implements SecretStorePort {
  readonly scheme = "test-secret"
  private readonly stored = new Map<string, string>()

  async put(request: { readonly ref: string; readonly value: string }): Promise<void> {
    this.stored.set(request.ref, request.value)
  }

  async delete(ref: string): Promise<void> {
    this.stored.delete(ref)
  }

  async resolve(
    ref: string,
    _context?: SecretResolveContext
  ): Promise<InMemoryResolvedSecret> {
    const value = this.stored.get(ref)
    if (value === undefined) throw new Error("MCP product credential is unavailable")
    return new InMemoryResolvedSecret({ ref, provider: this.scheme, value })
  }

  refs(): string[] {
    return [...this.stored.keys()].sort()
  }
}

class McpEchoExecutionStore implements McpProductToolStorage {
  private readonly executions = new Map<string, ToolExecutionRecord>()
  private readonly attempts = new Map<string, ToolExecutionAttemptRecord>()

  async beginToolExecution(request: BeginToolExecutionRequest) {
    const existing = [...this.executions.values()].find((record) =>
      record.turnId === request.turnId &&
      record.sourceMessageId === request.sourceMessageId &&
      record.toolCallId === request.toolCallId
    )
    if (existing !== undefined) {
      const invocationAttempt = existing.currentInvocationAttemptId === undefined
        ? undefined
        : this.attempts.get(existing.currentInvocationAttemptId)
      return {
        execution: existing,
        ...(invocationAttempt === undefined ? {} : { invocationAttempt }),
        created: false,
      }
    }
    const now = Date.now()
    const id = `mcp_product_execution_${this.executions.size + 1}`
    const invocationAttempt = request.state === "running"
      ? this.createAttempt(id, request, now)
      : undefined
    const execution: ToolExecutionRecord = {
      id,
      sessionId: request.sessionId,
      turnId: request.turnId,
      inputId: request.inputId,
      sourceMessageId: request.sourceMessageId,
      principalId: request.principalId,
      toolCallId: request.toolCallId,
      toolName: request.toolName,
      input: request.input,
      descriptor: request.descriptor,
      permission: request.permission,
      state: request.state,
      attemptCount: invocationAttempt === undefined ? 0 : 1,
      idempotencyKey: request.idempotencyKey,
      approvalRevision: 0,
      recoveryRevision: 0,
      ...(invocationAttempt === undefined
        ? {}
        : { currentInvocationAttemptId: invocationAttempt.id }),
      createdAt: now,
      updatedAt: now,
    }
    this.executions.set(id, execution)
    return {
      execution,
      ...(invocationAttempt === undefined ? {} : { invocationAttempt }),
      created: true,
    }
  }

  async finishToolExecution(request: FinishToolExecutionRequest) {
    const execution = this.executions.get(request.executionId)
    const attempt = this.attempts.get(request.invocationAttemptId)
    if (execution === undefined || attempt === undefined ||
      attempt.executionId !== execution.id) return null
    const now = Date.now()
    this.attempts.set(attempt.id, {
      ...attempt,
      state: request.state,
      ...(request.error === undefined ? {} : { error: request.error }),
      finishedAt: now,
      updatedAt: now,
    })
    const finished: ToolExecutionRecord = {
      ...execution,
      state: request.state,
      ...(request.content === undefined ? {} : { content: request.content }),
      ...(request.contentDigest === undefined
        ? {}
        : { contentDigest: request.contentDigest }),
      ...(request.isError === undefined ? {} : { isError: request.isError }),
      ...(request.error === undefined ? {} : { error: request.error }),
      finishedAt: now,
      updatedAt: now,
    }
    this.executions.set(finished.id, finished)
    return finished
  }

  async getToolExecutionByCall(request: {
    readonly turnId: string
    readonly sourceMessageId: string
    readonly toolCallId: string
  }) {
    return [...this.executions.values()].find((record) =>
      record.turnId === request.turnId &&
      record.sourceMessageId === request.sourceMessageId &&
      record.toolCallId === request.toolCallId
    ) ?? null
  }

  async deferToolExecution(): Promise<never> {
    throw new Error("MCP product Echo fixture does not support deferred tools")
  }

  async requireToolExecutionRecovery(): Promise<never> {
    throw new Error("MCP product Echo fixture unexpectedly required recovery")
  }

  async getResource(): Promise<null> {
    return null
  }

  async ingestResource(): Promise<never> {
    throw new Error("MCP product Echo fixture does not publish resources")
  }

  async recordResourceProvenance(): Promise<never> {
    throw new Error("MCP product Echo fixture does not publish provenance")
  }

  private createAttempt(
    executionId: string,
    request: BeginToolExecutionRequest,
    now: number
  ): ToolExecutionAttemptRecord {
    const attempt: ToolExecutionAttemptRecord = {
      id: `mcp_product_attempt_${this.attempts.size + 1}`,
      executionId,
      sessionAttemptId: request.attemptId,
      jobId: request.jobId,
      workerId: request.workerId,
      attemptNumber: 1,
      state: "running",
      startedAt: now,
      updatedAt: now,
    }
    this.attempts.set(attempt.id, attempt)
    return attempt
  }
}
