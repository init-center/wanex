import { createServer, type Server } from "node:http"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  EnvSecretProvider,
  InMemoryResolvedSecret,
  SecretResolver,
  type SecretResolveContext,
  type SecretStorePort
} from "@wanex/runtime/secrets"
import {
  startAssistantWebApp,
  type AssistantWebApp
} from "../src/index.js"
import { containsSensitiveText } from "../src/sensitive-value.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)
const secretRef = "env://WANEX_ASSISTANT_REAL_PROVIDER_KEY"
const secretValue = "assistant-local-real-provider-secret"
const modelId = "assistant-local-real-provider-model"
const userText = "hello from the Assistant Local real provider"
const assistantText = "real provider response through Assistant Local"

const apps: AssistantWebApp[] = []
const servers: Server[] = []
const tempDirs: string[] = []

afterEach(async () => {
  while (apps.length > 0) await apps.pop()?.close()
  while (servers.length > 0) await closeServer(servers.pop())
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

describe("@wanex/assistant-host real provider", () => {
  it("projects an exact Team pass without creating a public reply", async () => {
    const provider = await listenTeamPassProvider()
    const storeDir = await createTempDir("wanex-local-team-pass-")
    const app = await startRealProviderApp({
      storeDir,
      baseUrl: provider.baseUrl,
      env: { WANEX_ASSISTANT_REAL_PROVIDER_KEY: secretValue }
    })

    await app.shell.submitConversationOperation({
      sessionId: "ses_local_team_pass_agent",
      text: "Initialize pass-capable Team agent"
    })
    await waitForConversationTerminal(app)

    const conversation = await app.teamConversations.createConversation({
      mode: "discussion",
      idempotencyKey: "team-local-pass-conversation"
    })
    const agent = await app.teamConversations.addParticipant({
      conversationId: conversation.conversationId,
      agentSessionId: "ses_local_team_pass_agent",
      idempotencyKey: "team-local-pass-agent"
    })
    const routed = await app.teamConversations.submitRound({
      conversationId: conversation.conversationId,
      text: "Reply only when you have a useful contribution.",
      idempotencyKey: "team-local-pass-message",
    })
    const deliveryId = routed.deliveries[0]?.deliveryId
    if (deliveryId === undefined) throw new Error("Team pass delivery is missing")

    const page = await waitForTeamRound(app, conversation.conversationId)
    expect(page.messages).toHaveLength(1)
    expect(page.deliveries).toMatchObject([{
      deliveryId,
      status: "passed"
    }])
    expect(page.deliveries[0]).not.toHaveProperty("replyMessageId")
    expect(page.rounds).toMatchObject([{
      roundId: routed.round.roundId,
      status: "completed",
      expected: 1,
      replied: 0,
      passed: 1,
      failed: 0,
      cancelled: 0
    }])
    expect(provider.requests.some((request) =>
      requestHasTeamPassTool(request.body, deliveryId)
    )).toBe(true)
  })

  it("continues from first-run provider setup into the first real conversation", async () => {
    const provider = await listenOpenAICompatibleProvider()
    const storeDir = await createTempDir("wanex-assistant-local-first-run-")
    const credentialStore = new MemorySecretStore()
    const app = await startAssistantWebApp({
      storage: {
        kind: "store-dir",
        mode: "persistent",
        storeDir
      },
      serviceBin,
      credentialStore,
      web: {
        hostname: "127.0.0.1",
        port: 0
      }
    })
    apps.push(app)

    const initialHtml = await fetchText(`${app.url}/`)
    expect(initialHtml).toContain("data-app-root")
    expect((await app.readSnapshot()).web.view.providerRunGate).toMatchObject({
      state: "blocked",
      canSubmitConversation: false
    })

    const setupInput = {
      presetId: "openai-compatible",
      conversationModelId: modelId,
      baseUrl: provider.baseUrl,
      credential: secretValue,
      makeConversationActive: true
    }
    const deniedSetup = await fetch(
      `${app.url}/wanex/assistant/providers`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(setupInput)
      }
    )
    expect(deniedSetup.status).toBe(403)
    expect(await deniedSetup.json()).toMatchObject({
      ok: false,
      error: { code: "host_session_required" }
    })
    expect(credentialStore.refs()).toEqual([])

    const hostSessionToken = await readHostSessionToken(app.url)
    const configured = await fetch(
      `${app.url}/wanex/assistant/providers`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-wanex-host-session": hostSessionToken
        },
        body: JSON.stringify(setupInput)
      }
    )
    expect(configured.status).toBe(200)
    const configuredBody = (await configured.json()) as Record<string, unknown>
    expect(configuredBody).toMatchObject({
      ok: true,
      kind: "web.provider-management-response",
      result: {
        kind: "assistant-host.provider.saved",
        provider: {
          credentialConfigured: true,
          endpoints: [{ model: { id: modelId } }]
        },
        readiness: { status: "ready" }
      },
      snapshot: {
        view: {
          providerRunGate: {
            state: "ready",
            canSubmitConversation: true
          }
        }
      }
    })
    expect(credentialStore.refs()).toHaveLength(1)
    const credentialRef = credentialStore.refs()[0]
    if (credentialRef === undefined) {
      throw new Error("first-run provider credential ref is missing")
    }

    const submitted = await postJson(
      `${app.url}/wanex/assistant/request`,
      {
        kind: "web.request",
        operation: "dispatchAction",
        requestId: "assistant_local_first_run_turn",
        action: {
          type: "submit-conversation",
          input: { text: userText }
        }
      }
    )
    expect(submitted).toMatchObject({
      kind: "web.response",
      ok: true,
      operation: "dispatchAction",
      actionResult: { ok: true }
    })

    const snapshot = await waitForConversationTerminal(app)
    const webSnapshot = app.controller.snapshot()
    expect(provider.requests).toHaveLength(1)
    expect(provider.requests[0]).toMatchObject({
      authorization: `Bearer ${secretValue}`,
      body: {
        model: modelId,
        messages: expect.arrayContaining([
          expect.objectContaining({ role: "user", content: userText })
        ])
      }
    })
    expect(snapshot.web.conversation).toMatchObject({
      state: "succeeded",
      operation: {
        result: { assistantText },
        capabilities: { terminal: true, regeneratable: true }
      }
    })
    expect(JSON.stringify(webSnapshot.conversation.historyRows)).toContain(assistantText)

    const rendererValues = [
      initialHtml,
      configuredBody,
      submitted,
      snapshot,
      webSnapshot
    ]
    const rendererSerialized = JSON.stringify(rendererValues)
    expect(rendererSerialized).not.toContain(secretValue)
    expect(rendererSerialized).not.toContain(credentialRef)
    expect(containsSensitiveText(rendererValues, storeDir)).toBe(false)
    expect(containsSensitiveText(rendererValues, serviceBin)).toBe(false)

    const stateDb = await readFile(join(storeDir, "state.db"))
    expect(stateDb.includes(secretValue)).toBe(false)
    expect(stateDb.includes(credentialRef)).toBe(true)
  })

  it("runs through the surviving Provider immediately after active removal", async () => {
    const provider = await listenOpenAICompatibleProvider()
    const credentialStore = new MemorySecretStore()
    const app = await startAssistantWebApp({
      storage: {
        kind: "store-dir",
        mode: "persistent",
        storeDir: await createTempDir("wanex-provider-fallback-run-")
      },
      serviceBin,
      credentialStore,
      web: { hostname: "127.0.0.1", port: 0 }
    })
    apps.push(app)

    const primary = await app.providers.saveProvider({
      presetId: "openai-compatible",
      conversationModelId: "fallback-primary-model",
      baseUrl: `${provider.baseUrl}/primary`,
      credential: "fallback-primary-secret",
      makeConversationActive: true
    })
    const selected = await app.providers.saveProvider({
      presetId: "openai-compatible",
      conversationModelId: "fallback-selected-model",
      baseUrl: `${provider.baseUrl}/selected`,
      credential: "fallback-selected-secret",
      makeConversationActive: false
    })
    const selectedEndpointId = selected.provider.endpoints[0]?.id
    if (selectedEndpointId === undefined) {
      throw new Error("selected Provider endpoint is missing")
    }
    await app.shell.modelEndpoints.setActiveModelEndpoint({
      endpointId: selectedEndpointId
    })

    const first = await app.shell.submitConversationOperation({
      text: "Run through the selected Provider"
    })
    if (first.kind !== "assistant.conversation-operation.found") {
      throw new Error("selected Provider conversation was not admitted")
    }
    await waitForConversationTerminal(app)
    expect(requestModel(provider.requests[0]?.body)).toBe(
      "fallback-selected-model"
    )

    const removed = await app.providers.removeProvider({
      connectionId: selected.provider.connectionId
    })
    expect(removed).toMatchObject({
      removedEndpointIds: [selectedEndpointId],
      readiness: {
        activeEndpointId: primary.provider.endpoints[0]?.id,
        canRun: true
      }
    })

    await app.shell.submitConversationOperation({
      sessionId: first.operation.sessionId,
      text: "Run immediately through the surviving Provider"
    })
    const fallback = await waitForConversationTerminal(app)

    expect(provider.requests).toHaveLength(2)
    expect(requestModel(provider.requests[1]?.body)).toBe(
      "fallback-primary-model"
    )
    expect(fallback.web.conversation).toMatchObject({
      state: "succeeded",
      operation: {
        result: { assistantText },
        capabilities: { terminal: true }
      }
    })
  })

  it("completes a chat-first Web turn through an environment-backed provider", async () => {
    const provider = await listenOpenAICompatibleProvider()
    const storeDir = await createTempDir("wanex-assistant-local-real-provider-")
    const app = await startRealProviderApp({
      storeDir,
      baseUrl: provider.baseUrl,
      env: {
        WANEX_ASSISTANT_REAL_PROVIDER_KEY: secretValue
      }
    })

    const initialHtml = await fetchText(`${app.url}/`)
    const response = await postJson(`${app.url}/wanex/assistant/request`, {
      kind: "web.request",
      operation: "dispatchAction",
      requestId: "assistant_local_real_provider_turn",
      action: {
        type: "submit-conversation",
        input: {
          text: userText
        }
      }
    })
    const snapshot = await waitForConversationTerminal(app)
    const webSnapshot = app.controller.snapshot()

    expect(provider.requests).toHaveLength(1)
    expect(provider.requests[0]).toMatchObject({
      authorization: `Bearer ${secretValue}`,
      body: {
        model: modelId,
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: "user",
            content: userText
          })
        ])
      }
    })
    expect(response).toMatchObject({
      kind: "web.response",
      ok: true,
      operation: "dispatchAction",
      actionResult: {
        ok: true,
        snapshot: {
            conversation: {
              operation: {
                kind: "assistant.conversation-operation"
              }
            },
            view: {
              mode: "chat"
            }
          }
      }
    })
    expect(snapshot.web.conversation).toMatchObject({
      state: "succeeded",
      operation: {
        result: {
          assistantText
        },
        capabilities: {
          terminal: true,
          regeneratable: true
        }
      }
    })
    expect(JSON.stringify(webSnapshot.conversation.historyRows)).toContain(assistantText)

    const rendererValues = [
      initialHtml,
      response,
      snapshot,
      webSnapshot
    ]
    const rendererSerialized = JSON.stringify(rendererValues)
    expect(rendererSerialized).not.toContain(secretRef)
    expect(rendererSerialized).not.toContain(secretValue)
    expect(containsSensitiveText(rendererValues, storeDir)).toBe(false)
    expect(containsSensitiveText(rendererValues, serviceBin)).toBe(false)

    const stateDb = await readFile(join(storeDir, "state.db"))
    expect(stateDb.includes(secretRef)).toBe(true)
    expect(stateDb.includes(secretValue)).toBe(false)
  })

  it("keeps the Assistant Local host alive when environment resolution fails", async () => {
    const storeDir = await createTempDir("wanex-assistant-local-missing-secret-")
    const app = await startRealProviderApp({
      storeDir,
      baseUrl: "http://127.0.0.1:9/v1",
      env: {}
    })

    const response = await postJson(`${app.url}/wanex/assistant/request`, {
      kind: "web.request",
      operation: "dispatchAction",
      requestId: "assistant_local_missing_secret_turn",
      action: {
        type: "submit-conversation",
        input: {
          text: "this turn should fail safely"
        }
      }
    })

    expect(response).toMatchObject({
      kind: "web.response",
      ok: true,
      operation: "dispatchAction",
      actionResult: {
        ok: true,
        snapshot: {
          conversation: {
            operation: {
              kind: "assistant.conversation-operation"
            }
          }
        }
      }
    })
    const failed = await waitForConversationTerminal(app)
    expect(failed.web.conversation).toMatchObject({
      state: "failed",
      operation: {
        error: {
          code: "conversation_operation_failed",
          category: "runtime"
        },
        capabilities: {
          terminal: true
        }
      }
    })
    const serialized = JSON.stringify(response)
    expect(serialized).not.toContain(secretRef)
    expect(serialized).not.toContain("WANEX_ASSISTANT_REAL_PROVIDER_KEY")
    expect(containsSensitiveText(response, storeDir)).toBe(false)
    expect(containsSensitiveText(response, serviceBin)).toBe(false)

    const stillRunning = await fetch(`${app.url}/`)
    expect(stillRunning.status).toBe(200)
    expect(await stillRunning.text()).toContain(
      "data-app-root"
    )
  })
})

async function waitForConversationTerminal(
  app: AssistantWebApp
): Promise<Awaited<ReturnType<AssistantWebApp["readSnapshot"]>>> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const snapshot = await app.readSnapshot()
    if (snapshot.web.conversation.operation?.capabilities.terminal) {
      return snapshot
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error("real-provider conversation did not finish")
}

async function waitForTeamRound(
  app: AssistantWebApp,
  conversationId: string
) {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const result = await app.teamConversations.readConversation({
      conversationId
    })
    if (
      result.kind === "assistant.team-conversation.found" &&
      result.page.rounds.some((round) => round.status !== "running")
    ) {
      return result.page
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error("real-provider Team discussion round did not finish")
}

async function startRealProviderApp(options: {
  readonly storeDir: string
  readonly baseUrl: string
  readonly env: Readonly<Record<string, string | undefined>>
}): Promise<AssistantWebApp> {
  const app = await startAssistantWebApp({
    storage: {
      kind: "store-dir",
      mode: "persistent",
      storeDir: options.storeDir
    },
    serviceBin,
    modelEndpoints: {
      endpoints: [
        {
          id: "assistant-local-real-provider",
          connection: {
            id: "assistant-local-real-provider",
            providerId: "openai-compatible",
            baseUrl: options.baseUrl,
            secretRef
          },
          protocol: { id: "openai-chat-completions" },
          model: {
            id: modelId,
            operations: ["conversation"],
            inputModalities: ["text"],
            outputModalities: ["text"],
            features: ["tool_calling"],
            catalog: {
              source: "custom",
              catalogId: "assistant-host.real-provider-test",
              revision: "1"
            }
          }
        }
      ],
      activeEndpointId: "assistant-local-real-provider"
    },
    secretResolver: new SecretResolver([
      new EnvSecretProvider(options.env)
    ]),
    web: {
      hostname: "127.0.0.1",
      port: 0,
    }
  })
  apps.push(app)
  return app
}

async function listenOpenAICompatibleProvider(): Promise<{
  readonly baseUrl: string
  readonly requests: Array<{
    readonly authorization: string
    readonly body: unknown
  }>
}> {
  const requests: Array<{
    readonly authorization: string
    readonly body: unknown
  }> = []
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    requests.push({
      authorization: request.headers.authorization ?? "",
      body: JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown
    })
    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache"
    })
    response.end([
      `data: ${JSON.stringify({
        choices: [{ delta: { content: assistantText }, finish_reason: null }]
      })}\n\n`,
      `data: ${JSON.stringify({
        choices: [{ delta: {}, finish_reason: "stop" }]
      })}\n\n`,
      "data: [DONE]\n\n"
    ].join(""))
  })
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  servers.push(server)
  const address = server.address()
  if (address === null || typeof address === "string") {
    throw new Error("provider fixture did not expose a TCP address")
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    requests
  }
}

async function listenTeamPassProvider(): Promise<{
  readonly baseUrl: string
  readonly requests: Array<{
    readonly authorization: string
    readonly body: unknown
  }>
}> {
  const requests: Array<{
    readonly authorization: string
    readonly body: unknown
  }> = []
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown
    requests.push({
      authorization: request.headers.authorization ?? "",
      body
    })
    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache"
    })
    const deliveryId = teamPassDeliveryId(body)
    if (deliveryId === undefined) {
      response.end(textStream("Team agent initialized."))
      return
    }
    if (!requestHasToolResult(body, "call_local_team_pass")) {
      response.end([
        `data: ${JSON.stringify({
          choices: [{
            delta: {
              tool_calls: [{
                index: 0,
                id: "call_local_team_pass",
                type: "function",
                function: {
                  name: "team_pass",
                  arguments: JSON.stringify({
                    deliveryId,
                    reason: "No useful contribution"
                  })
                }
              }]
            },
            finish_reason: null
          }]
        })}\n\n`,
        `data: ${JSON.stringify({
          choices: [{ delta: {}, finish_reason: "tool_calls" }]
        })}\n\n`,
        "data: [DONE]\n\n"
      ].join(""))
      return
    }
    response.end(textStream("Pass recorded."))
  })
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  servers.push(server)
  const address = server.address()
  if (address === null || typeof address === "string") {
    throw new Error("Team pass provider fixture did not expose a TCP address")
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    requests
  }
}

function textStream(text: string): string {
  return [
    `data: ${JSON.stringify({
      choices: [{ delta: { content: text }, finish_reason: null }]
    })}\n\n`,
    `data: ${JSON.stringify({
      choices: [{ delta: {}, finish_reason: "stop" }]
    })}\n\n`,
    "data: [DONE]\n\n"
  ].join("")
}

function requestHasTeamPassTool(body: unknown, deliveryId: string): boolean {
  if (!isRecord(body) || !Array.isArray(body.tools)) return false
  return body.tools.some((tool) =>
    isRecord(tool) &&
    isRecord(tool.function) &&
    tool.function.name === "team_pass" &&
    isRecord(tool.function.parameters) &&
    isRecord(tool.function.parameters.properties) &&
    isRecord(tool.function.parameters.properties.deliveryId) &&
    tool.function.parameters.properties.deliveryId.const === deliveryId
  )
}

function teamPassDeliveryId(body: unknown): string | undefined {
  if (!isRecord(body) || !Array.isArray(body.tools)) return undefined
  for (const tool of body.tools) {
    if (
      isRecord(tool) &&
      isRecord(tool.function) &&
      tool.function.name === "team_pass" &&
      isRecord(tool.function.parameters) &&
      isRecord(tool.function.parameters.properties) &&
      isRecord(tool.function.parameters.properties.deliveryId) &&
      typeof tool.function.parameters.properties.deliveryId.const === "string"
    ) {
      return tool.function.parameters.properties.deliveryId.const
    }
  }
  return undefined
}

function requestHasToolResult(body: unknown, toolCallId: string): boolean {
  if (!isRecord(body) || !Array.isArray(body.messages)) return false
  return body.messages.some((message) =>
    isRecord(message) &&
    message.role === "tool" &&
    message.tool_call_id === toolCallId
  )
}

function requestModel(body: unknown): string | undefined {
  return isRecord(body) && typeof body.model === "string"
    ? body.model
    : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

async function createTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url)
  expect(response.status).toBe(200)
  return await response.text()
}

async function postJson(url: string, body: unknown): Promise<unknown> {
  const hostSessionToken = await readHostSessionToken(url)
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-wanex-host-session": hostSessionToken
    },
    body: JSON.stringify(body)
  })
  expect(response.status).toBe(200)
  return await response.json()
}

async function readHostSessionToken(url: string): Promise<string> {
  const root = new URL("/", url)
  const response = await fetch(root)
  expect(response.status).toBe(200)
  const html = await response.text()
  const match = /data-host-session-token="([^"]+)"/.exec(html)
  if (match?.[1] === undefined) {
    throw new Error("assistant host document did not include a session token")
  }
  return match[1]
}

async function closeServer(server: Server | undefined): Promise<void> {
  if (server === undefined || !server.listening) return
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) resolve()
      else reject(error)
    })
  })
}

class MemorySecretStore implements SecretStorePort {
  readonly scheme = "test-secret"
  private readonly values = new Map<string, string>()

  async put(request: {
    readonly ref: string
    readonly value: string
  }): Promise<void> {
    this.values.set(request.ref, request.value)
  }

  async delete(ref: string): Promise<void> {
    this.values.delete(ref)
  }

  async resolve(
    ref: string,
    _context?: SecretResolveContext
  ): Promise<InMemoryResolvedSecret> {
    const value = this.values.get(ref)
    if (value === undefined) {
      throw new Error("test credential is not configured")
    }
    return new InMemoryResolvedSecret({
      ref,
      provider: this.scheme,
      value
    })
  }

  refs(): string[] {
    return [...this.values.keys()].sort()
  }
}
