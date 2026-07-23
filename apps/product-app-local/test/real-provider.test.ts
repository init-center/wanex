import { createServer, type Server } from "node:http"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  EnvSecretProvider,
  SecretResolver
} from "@wanex/runtime/secrets"
import {
  startProductAppLocalWebApp,
  type ProductAppLocalWebApp
} from "../src/index.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)
const secretRef = "env://WANEX_PRODUCT_REAL_PROVIDER_KEY"
const secretValue = "product-local-real-provider-secret"
const modelId = "product-local-real-provider-model"
const userText = "hello from the Product Local real provider"
const assistantText = "real provider response through Product Local"

const apps: ProductAppLocalWebApp[] = []
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

describe("@wanex/product-app-local real provider", () => {
  it("completes a chat-first Web turn through an environment-backed provider", async () => {
    const provider = await listenOpenAICompatibleProvider()
    const storeDir = await createTempDir("wanex-product-local-real-provider-")
    const app = await startRealProviderApp({
      storeDir,
      baseUrl: provider.baseUrl,
      env: {
        WANEX_PRODUCT_REAL_PROVIDER_KEY: secretValue
      }
    })

    const initialHtml = await fetchText(`${app.url}/`)
    const response = await postJson(`${app.url}/wanex/product-app-web/request`, {
      kind: "product-app-web.request",
      operation: "submitActionInput",
      requestId: "product_local_real_provider_turn",
      input: {
        action: "submit-conversation",
        fields: {
          text: userText
        }
      },
      options: {
        pollAfterAction: false
      }
    })
    const snapshot = await waitForConversationTerminal(app)
    const document = app.webController.document()

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
      kind: "product-app-web.response",
      ok: true,
      operation: "submitActionInput",
      submitResult: {
        ok: true
      },
      document: {
        snapshot: {
          conversation: {
            operation: {
              kind: "product-app.conversation-operation"
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
    expect(document.html).toContain(assistantText)

    const rendererSerialized = JSON.stringify([
      initialHtml,
      response,
      snapshot,
      document
    ])
    expect(rendererSerialized).not.toContain(secretRef)
    expect(rendererSerialized).not.toContain(secretValue)
    expect(rendererSerialized).not.toContain(storeDir)
    expect(rendererSerialized).not.toContain(serviceBin)

    const stateDb = await readFile(join(storeDir, "state.db"))
    expect(stateDb.includes(secretRef)).toBe(true)
    expect(stateDb.includes(secretValue)).toBe(false)
  })

  it("keeps the Product Local host alive when environment resolution fails", async () => {
    const storeDir = await createTempDir("wanex-product-local-missing-secret-")
    const app = await startRealProviderApp({
      storeDir,
      baseUrl: "http://127.0.0.1:9/v1",
      env: {}
    })

    const response = await postJson(`${app.url}/wanex/product-app-web/request`, {
      kind: "product-app-web.request",
      operation: "submitActionInput",
      requestId: "product_local_missing_secret_turn",
      input: {
        action: "submit-conversation",
        fields: {
          text: "this turn should fail safely"
        }
      },
      options: {
        pollAfterAction: false
      }
    })

    expect(response).toMatchObject({
      kind: "product-app-web.response",
      ok: true,
      operation: "submitActionInput",
      submitResult: {
        ok: true
      },
      document: {
        snapshot: {
          conversation: {
            operation: {
              kind: "product-app.conversation-operation"
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
    expect(serialized).not.toContain("WANEX_PRODUCT_REAL_PROVIDER_KEY")
    expect(serialized).not.toContain(storeDir)
    expect(serialized).not.toContain(serviceBin)

    const stillRunning = await fetch(`${app.url}/`)
    expect(stillRunning.status).toBe(200)
    expect(await stillRunning.text()).toContain(
      'data-wanex-product-app-web="surface"'
    )
  })
})

async function waitForConversationTerminal(
  app: ProductAppLocalWebApp
): Promise<Awaited<ReturnType<ProductAppLocalWebApp["readSnapshot"]>>> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const snapshot = await app.readSnapshot()
    if (snapshot.web.conversation.operation?.capabilities.terminal) {
      return snapshot
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error("real-provider conversation did not finish")
}

async function startRealProviderApp(options: {
  readonly storeDir: string
  readonly baseUrl: string
  readonly env: Readonly<Record<string, string | undefined>>
}): Promise<ProductAppLocalWebApp> {
  const app = await startProductAppLocalWebApp({
    storage: {
      kind: "store-dir",
      mode: "persistent",
      storeDir: options.storeDir
    },
    serviceBin,
    providerProfiles: {
      profiles: [
        {
          id: "product-local-real-provider",
          kind: "openai-compatible",
          capabilities: { input: ["text"], output: ["text"] },
          providerId: "openai-compatible",
          modelId,
          baseUrl: options.baseUrl,
          secretRef
        }
      ],
      activeProfileId: "product-local-real-provider"
    },
    secretResolver: new SecretResolver([
      new EnvSecretProvider(options.env)
    ]),
    web: {
      hostname: "127.0.0.1",
      port: 0,
      pollIntervalMs: 0
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
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  })
  expect(response.status).toBe(200)
  return await response.json()
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
