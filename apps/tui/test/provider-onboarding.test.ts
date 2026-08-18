import { mkdtemp, rm } from "node:fs/promises"
import { createServer, type Server } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  InMemoryResolvedSecret,
  type SecretResolveContext,
  type SecretStorePort
} from "@wanex/runtime/secrets"
import { WANEX_LOCAL_KEYCHAIN_SECRET_SCHEME } from "@wanex/local-credential-store"
import { main as runTuiCli } from "../src/cli/index.js"
import { collectTuiProviderSetup } from "../src/provider/onboarding.js"
import { TuiVirtualTerminal } from "./full-screen/virtual-terminal.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)
const tempDirs: string[] = []
const servers: Server[] = []

afterEach(async () => {
  while (servers.length > 0) await closeServer(servers.pop()!)
  while (tempDirs.length > 0) {
    await rm(tempDirs.pop()!, { recursive: true, force: true })
  }
})

describe("TUI trusted Provider onboarding", () => {
  it("configures, chats, and relaunches without restart or credential replay", async () => {
    const assistantText = "Provider onboarding reached canonical chat"
    const userText = "hello after terminal onboarding"
    const credential = "terminal-onboarding-secret"
    const provider = await listenProvider(assistantText)
    const storeDir = await createStoreDir()
    const env = {
      WANEX_STORE_DIR: storeDir,
      WANEX_SYSTEM_SERVICE_BIN: serviceBin
    }
    const credentialStore = new TestCredentialStore()
    const terminal = new TuiVirtualTerminal(96, 26)
    const shutdown = new AbortController()
    const running = runTuiCli(["fullscreen"], env, {
      signal: shutdown.signal,
      fullScreenTerminal: terminal,
      credentialStore
    })

    await waitForText(terminal, "Wanex Provider Setup")
    terminal.sendInput("4\r")
    await waitForText(terminal, "Model ID:")
    terminal.sendInput("onboarded-model\r")
    await waitForText(terminal, "Base URL:")
    terminal.sendInput(`${provider.baseUrl}\r`)
    await waitForText(terminal, "API key:")
    terminal.sendInput(`${credential}\r`)

    await waitForCondition(
      () => terminal.titles.at(-1) === "Wanex" && terminal.lifecycle().active,
      "full-screen startup after onboarding"
    )
    terminal.sendInput(userText)
    terminal.sendInput("\r")
    await waitForText(terminal, assistantText)
    expect(provider.requests).toEqual([
      expect.objectContaining({
        authorization: `Bearer ${credential}`,
        body: expect.objectContaining({
          model: "onboarded-model",
          messages: expect.arrayContaining([
            expect.objectContaining({ role: "user", content: userText })
          ])
        })
      })
    ])

    shutdown.abort(new Error("finish onboarding acceptance"))
    await expect(withTimeout(running, "first TUI shutdown")).resolves.toEqual({
      exitCode: 0,
      stdout: "",
      stderr: ""
    })
    const output = await terminal.text()
    expect(output).toContain(assistantText)
    expect(output).not.toContain(credential)
    expect(output).not.toContain(storeDir)
    expect(terminal.outputHistory()).not.toContain(credential)
    expect(terminal.outputHistory()).not.toContain(storeDir)
    expect(credentialStore.putCount).toBe(1)
    expect(credentialStore.entries()).toHaveLength(1)
    expect(terminal.lifecycle()).toEqual({
      active: false,
      drainCount: 2,
      stopCount: 2
    })

    const relaunchedTerminal = new TuiVirtualTerminal(96, 26)
    const relaunchShutdown = new AbortController()
    const relaunched = runTuiCli(["fullscreen"], env, {
      signal: relaunchShutdown.signal,
      fullScreenTerminal: relaunchedTerminal,
      credentialStore
    })
    await waitForCondition(
      () => relaunchedTerminal.titles.at(-1) === "Wanex",
      "configured full-screen relaunch"
    )
    expect(await relaunchedTerminal.text()).not.toContain("Provider Setup")
    relaunchShutdown.abort(new Error("finish onboarding relaunch"))
    await expect(withTimeout(relaunched, "second TUI shutdown")).resolves
      .toEqual({ exitCode: 0, stdout: "", stderr: "" })
    expect(credentialStore.putCount).toBe(1)
    expect(relaunchedTerminal.lifecycle()).toEqual({
      active: false,
      drainCount: 1,
      stopCount: 1
    })
  })

  it("retries invalid non-secret input before requesting the credential", async () => {
    const credential = "retry-secret"
    const terminal = new TuiVirtualTerminal(96, 26)
    const collecting = collectTuiProviderSetup({ terminal })

    await waitForHistory(terminal, "Wanex Provider Setup")
    terminal.sendInput("4\r")
    await waitForHistory(terminal, "Model ID:")
    terminal.sendInput("invalid-endpoint-model\r")
    await waitForHistory(terminal, "Base URL:")
    terminal.sendInput("http://example.com/v1\r")
    await waitForHistory(terminal, "Please try again.")
    expect(terminal.outputHistory()).not.toContain("API key:")

    terminal.sendInput("4\r")
    await waitForHistoryCount(terminal, "Model ID:", 2)
    const boundedModelId = "m".repeat(256)
    terminal.sendInput(`${boundedModelId}${"x".repeat(64)}\r`)
    await waitForHistoryCount(terminal, "Base URL:", 2)
    terminal.sendInput("http://127.0.0.1:9876/v1\r")
    await waitForHistory(terminal, "API key:")
    terminal.sendInput(`${credential}\r`)

    await expect(collecting).resolves.toEqual({
      presetId: "openai-compatible",
      conversationModelId: boundedModelId,
      baseUrl: "http://127.0.0.1:9876/v1",
      credential
    })
    expect(terminal.outputHistory()).not.toContain(credential)
    expect(terminal.outputHistory()).toContain("\u0007")
    expect(terminal.lifecycle()).toEqual({
      active: false,
      drainCount: 1,
      stopCount: 1
    })
  })

  it("cancels onboarding, restores the terminal, and writes no credential", async () => {
    const storeDir = await createStoreDir()
    const credentialStore = new TestCredentialStore()
    const terminal = new TuiVirtualTerminal(96, 26)
    const shutdown = new AbortController()
    const running = runTuiCli(
      ["fullscreen"],
      {
        WANEX_STORE_DIR: storeDir,
        WANEX_SYSTEM_SERVICE_BIN: serviceBin
      },
      {
        signal: shutdown.signal,
        fullScreenTerminal: terminal,
        credentialStore
      }
    )

    await waitForHistory(terminal, "Wanex Provider Setup")
    shutdown.abort(new Error("cancel first-use setup"))

    await expect(withTimeout(running, "cancelled onboarding")).resolves.toEqual({
      exitCode: 1,
      stdout: "",
      stderr: expect.stringContaining("Provider onboarding was cancelled")
    })
    expect(credentialStore.putCount).toBe(0)
    expect(credentialStore.entries()).toHaveLength(0)
    expect(terminal.lifecycle()).toEqual({
      active: false,
      drainCount: 1,
      stopCount: 1
    })
  })
})

class TestCredentialStore implements SecretStorePort {
  readonly scheme = WANEX_LOCAL_KEYCHAIN_SECRET_SCHEME
  private readonly secrets = new Map<string, string>()
  putCount = 0

  async put(request: { readonly ref: string; readonly value: string }) {
    this.putCount += 1
    this.secrets.set(request.ref, request.value)
  }

  async delete(ref: string) {
    this.secrets.delete(ref)
  }

  async resolve(ref: string, _context?: SecretResolveContext) {
    const value = this.secrets.get(ref)
    if (value === undefined) throw new Error("test credential is missing")
    return new InMemoryResolvedSecret({ ref, provider: this.scheme, value })
  }

  entries(): readonly (readonly [string, string])[] {
    return [...this.secrets.entries()]
  }
}

async function createStoreDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "wanex-tui-onboarding-"))
  tempDirs.push(dir)
  return dir
}

async function listenProvider(assistantText: string): Promise<{
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
    throw new Error("Provider fixture did not expose a TCP address")
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    requests
  }
}

async function waitForText(
  terminal: TuiVirtualTerminal,
  text: string
): Promise<void> {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    if ((await terminal.text()).includes(text)) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`timed out waiting for terminal text: ${text}`)
}

async function waitForHistory(
  terminal: TuiVirtualTerminal,
  text: string
): Promise<void> {
  await waitForCondition(
    () => terminal.outputHistory().includes(text),
    `terminal history text: ${text}`
  )
}

async function waitForHistoryCount(
  terminal: TuiVirtualTerminal,
  text: string,
  count: number
): Promise<void> {
  await waitForCondition(
    () => terminal.outputHistory().split(text).length - 1 >= count,
    `terminal history occurrence ${count}: ${text}`
  )
}

async function waitForCondition(
  condition: () => boolean | Promise<boolean>,
  description: string
): Promise<void> {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    if (await condition()) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`timed out waiting for ${description}`)
}

async function withTimeout<T>(value: Promise<T>, description: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      value,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`timed out waiting for ${description}`)),
          5_000
        )
      })
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

async function closeServer(server: Server): Promise<void> {
  server.closeAllConnections()
  if (!server.listening) return
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error === undefined ? resolve() : reject(error))
  })
}
