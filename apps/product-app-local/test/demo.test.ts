import { access, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { describe, expect, it, onTestFinished } from "vitest"
import {
  startProductAppLocalDemoHost,
  type ProductAppLocalDemoHost
} from "../src/demo-host.js"
import {
  ensureProductAppLocalDemoStoreDir,
  parseProductAppLocalDemoOptions,
  parseProductAppLocalDemoPollIntervalMs,
  parseProductAppLocalDemoPort
} from "../src/demo-options.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)

describe("Product App Local demo", () => {
  it("parses explicit flags and ignores the pnpm separator", () => {
    const rootDir = "/repo"
    const options = parseProductAppLocalDemoOptions(
      rootDir,
      [
        "--",
        "--hostname",
        "0.0.0.0",
        "--port",
        "57015",
        "--store-dir",
        "./tmp/demo",
        "--service-bin",
        "./target/custom-binary",
        "--session-id",
        "ses_demo",
        "--seed-text",
        "demo turn",
        "--poll-interval-ms",
        "0",
        "--no-seed"
      ],
      {}
    )

    expect(options).toEqual({
      hostname: "0.0.0.0",
      port: 57015,
      storeDir: resolve(rootDir, "./tmp/demo"),
      serviceBin: resolve(rootDir, "./target/custom-binary"),
      sessionId: "ses_demo",
      seedText: "demo turn",
      seed: false,
      open: false,
      pollIntervalMs: 0
    })
  })

  it("falls back to defaults and environment values", () => {
    const rootDir = "/repo"
    const options = parseProductAppLocalDemoOptions(rootDir, [], {
      WANEX_PRODUCT_APP_WEB_PORT: "58000",
      WANEX_PRODUCT_APP_WEB_SESSION_ID: "ses_env",
      WANEX_PRODUCT_APP_WEB_SEED_TEXT: "env turn",
      WANEX_PRODUCT_APP_WEB_POLL_INTERVAL_MS: "1500",
      WANEX_SYSTEM_SERVICE_BIN: "./target/env-binary"
    })

    expect(options).toEqual({
      hostname: "127.0.0.1",
      port: 58000,
      serviceBin: resolve(rootDir, "./target/env-binary"),
      sessionId: "ses_env",
      seedText: "env turn",
      seed: true,
      open: false,
      pollIntervalMs: 1500
    })
  })

  it("parses explicit and environment browser-open requests", () => {
    const rootDir = "/repo"

    expect(parseProductAppLocalDemoOptions(rootDir, ["--open"], {})).toMatchObject({
      open: true
    })
    expect(parseProductAppLocalDemoOptions(rootDir, [], {
      WANEX_PRODUCT_APP_WEB_OPEN: "1"
    })).toMatchObject({
      open: true
    })
  })

  it("can disable demo seeding from the environment", () => {
    const rootDir = "/repo"
    const options = parseProductAppLocalDemoOptions(rootDir, [], {
      WANEX_PRODUCT_APP_WEB_NO_SEED: "true"
    })

    expect(options).toMatchObject({
      seed: false,
      open: false,
      sessionId: "ses_local_web_demo",
      seedText: "hello from product-app-web demo"
    })
  })

  it("rejects unknown demo flags", () => {
    expect(() => parseProductAppLocalDemoOptions("/repo", ["--oops"], {}))
      .toThrow("unknown demo option: --oops")
    expect(() => parseProductAppLocalDemoOptions("/repo", ["--oops", "1"], {}))
      .toThrow("unknown demo option: --oops")
  })

  it("rejects invalid ports", () => {
    expect(() => parseProductAppLocalDemoPort("-1")).toThrow("invalid port: -1")
    expect(() => parseProductAppLocalDemoPort("70000")).toThrow(
      "invalid port: 70000"
    )
    expect(() => parseProductAppLocalDemoPort("abc")).toThrow(
      "invalid port: abc"
    )
    expect(() => parseProductAppLocalDemoPort("123abc")).toThrow(
      "invalid port: 123abc"
    )
    expect(() => parseProductAppLocalDemoPort("")).toThrow("invalid port: ")
  })

  it("rejects invalid poll intervals", () => {
    expect(parseProductAppLocalDemoPollIntervalMs("0")).toBe(0)
    expect(parseProductAppLocalDemoPollIntervalMs("2000")).toBe(2000)
    expect(() => parseProductAppLocalDemoPollIntervalMs("-1")).toThrow(
      "invalid poll interval: -1"
    )
    expect(() => parseProductAppLocalDemoPollIntervalMs("60001")).toThrow(
      "invalid poll interval: 60001"
    )
    expect(() => parseProductAppLocalDemoPollIntervalMs("10ms")).toThrow(
      "invalid poll interval: 10ms"
    )
  })

  it("creates a temporary store when no directory is provided", async () => {
    const dir = await ensureProductAppLocalDemoStoreDir(undefined)
    registerTempDirCleanup(dir)

    expect(dir).toContain("wanex-product-app-web-demo-")
  })

  it("creates an explicit store directory recursively", async () => {
    const root = await createTestTempDir("wanex-product-app-web-demo-test-")
    const storeDir = join(root, "nested/store")

    const created = await ensureProductAppLocalDemoStoreDir(storeDir)

    expect(created).toBe(storeDir)
  })

  it("cleans up the default temporary demo store on close", async () => {
    const demo = await startTestProductAppLocalDemoHost({
      hostname: "127.0.0.1",
      serviceBin,
      sessionId: "ses_demo_temp_cleanup",
      seedText: "unused seed",
      seed: false,
      open: false,
      pollIntervalMs: 0
    })
    const storeDir = demo.storeDir

    await expect(pathExists(storeDir)).resolves.toBe(true)
    await demo.close()

    await expect(pathExists(storeDir)).resolves.toBe(false)
  })

  it("keeps an explicit demo store directory after close", async () => {
    const root = await createTestTempDir("wanex-product-app-web-demo-explicit-")
    const storeDir = join(root, "store")
    const demo = await startTestProductAppLocalDemoHost({
      hostname: "127.0.0.1",
      storeDir,
      serviceBin,
      sessionId: "ses_demo_explicit_cleanup",
      seedText: "unused seed",
      seed: false,
      open: false,
      pollIntervalMs: 0
    })

    await demo.close()

    await expect(pathExists(storeDir)).resolves.toBe(true)
  })

  it("starts the blank demo host and accepts the first conversation over HTTP", async () => {
    const demo = await startTestProductAppLocalDemoHost({
      hostname: "127.0.0.1",
      serviceBin,
      sessionId: "ses_demo_blank",
      seedText: "unused seed",
      seed: false,
      open: false,
      pollIntervalMs: 0
    })

    const html = await fetchText(`${demo.url}/`)
    expect(html).toContain("Wanex Product App")
    expect(html).toContain('data-action="submit-conversation"')
    expect(html).toContain('data-conversation-state="idle"')
    expect(html).toContain("Start a workbench session")
    expect(html).toContain('data-poll-interval-ms="0"')
    expect(demo.sessionId).toBeUndefined()

    const response = await postJson(`${demo.url}/wanex/product-app-web/request`, {
      kind: "product-app-web.request",
      operation: "submitActionInput",
      requestId: "demo_blank_start",
      input: {
        action: "submit-conversation",
        fields: {
          text: "demo host first turn"
        }
      }
    })

    expect(response).toMatchObject({
      kind: "product-app-web.response",
      ok: true,
      operation: "submitActionInput",
      requestId: "demo_blank_start",
      submitResult: {
        ok: true,
        actionResult: {
          ok: true,
          action: "submit-conversation"
        }
      },
      document: {
        snapshot: {
          conversation: {
            operation: {
              kind: "product-app.conversation-operation"
            }
          },
          view: {
            selectedSessionTitle: "demo host first turn"
          }
        }
      }
    })
    expect(response.document.html).toContain('data-action="submit-conversation"')
    expect(response.document.html).toContain("demo host first turn")
  })

  it("keeps chat focused and exposes workbench and diagnostics explicitly", async () => {
    const demo = await startTestProductAppLocalDemoHost({
      hostname: "127.0.0.1",
      serviceBin,
      sessionId: "ses_demo_modes",
      seedText: "unused mode seed",
      seed: false,
      open: false,
      pollIntervalMs: 0
    })

    const chat = await fetchText(`${demo.url}/`)
    expect(chat).toContain('data-product-mode="chat"')
    expect(chat).toContain('data-panel="sessions"')
    expect(chat).toContain('data-panel="workbench"')
    expect(chat).not.toContain('data-panel="summary"')
    expect(chat).not.toContain('data-panel="settings"')
    expect(chat).not.toContain('data-panel="command-catalog"')
    expect(chat).not.toContain('data-panel="events"')
    expect(chat).not.toContain('data-panel="diagnostics"')

    const workbench = await postJson(
      `${demo.url}/wanex/product-app-web/request`,
      {
        kind: "product-app-web.request",
        operation: "submitActionInput",
        requestId: "demo_mode_workbench",
        input: {
          action: "set-mode",
          fields: { mode: "workbench" }
        }
      }
    )
    expect(workbench).toMatchObject({
      ok: true,
      document: {
        snapshot: { view: { mode: "workbench" } }
      }
    })
    expect(workbench.document.html).toContain('data-panel="command-catalog"')
    expect(workbench.document.html).toContain('data-panel="actions"')
    expect(workbench.document.html).not.toContain('data-panel="settings"')

    const diagnostics = await postJson(
      `${demo.url}/wanex/product-app-web/request`,
      {
        kind: "product-app-web.request",
        operation: "submitActionInput",
        requestId: "demo_mode_diagnostics",
        input: {
          action: "set-mode",
          fields: { mode: "diagnostics" }
        }
      }
    )
    expect(diagnostics).toMatchObject({
      ok: true,
      document: {
        snapshot: { view: { mode: "diagnostics" } }
      }
    })
    expect(diagnostics.document.html).toContain('data-panel="summary"')
    expect(diagnostics.document.html).toContain('data-panel="settings"')
    expect(diagnostics.document.html).toContain('data-panel="events"')
    expect(diagnostics.document.html).toContain('data-panel="diagnostics"')
    expect(diagnostics.document.html).not.toContain('data-panel="command-catalog"')
  })

  it("starts the seeded demo host with the selected seeded session", async () => {
    const demo = await startTestProductAppLocalDemoHost({
      hostname: "127.0.0.1",
      serviceBin,
      sessionId: "ses_demo_seeded_lifecycle",
      seedText: "seeded lifecycle turn",
      seed: true,
      open: false,
      pollIntervalMs: 0
    })

    const html = await fetchText(`${demo.url}/`)
    expect(demo.sessionId).toBe("ses_demo_seeded_lifecycle")
    expect(html).toContain("seeded lifecycle turn")
    expect(html).toContain('data-session-id="ses_demo_seeded_lifecycle"')
    expect(html).toContain('data-action="submit-conversation"')
    expect(html).toContain('data-conversation-state="succeeded"')
  })

  it("persists Product App renderer state across demo host restarts", async () => {
    const root = await createTestTempDir("wanex-product-app-web-demo-state-")
    const storeDir = join(root, "store")

    const first = await startTestProductAppLocalDemoHost({
      hostname: "127.0.0.1",
      storeDir,
      serviceBin,
      sessionId: "ses_demo_persisted_state",
      seedText: "unused persisted state seed",
      seed: false,
      open: false,
      pollIntervalMs: 0
    })

    const changed = await postJson(`${first.url}/wanex/product-app-web/request`, {
      kind: "product-app-web.request",
      operation: "submitActionInput",
      requestId: "demo_persist_layout",
      input: {
        action: "set-layout",
        fields: {
          layout: "diagnostics"
        }
      }
    })
    expect(changed).toMatchObject({
      kind: "product-app-web.response",
      ok: true,
      operation: "submitActionInput",
      requestId: "demo_persist_layout",
      document: {
        snapshot: {
          view: {
            layout: "diagnostics"
          }
        }
      }
    })
    const preferences = await postJson(
      `${first.url}/wanex/product-app-web/request`,
      {
        kind: "product-app-web.request",
        operation: "submitActionInput",
        requestId: "demo_persist_preferences",
        input: {
          action: "update-preferences",
          fields: {
            theme: "dark",
            density: "compact"
          }
        }
      }
    )
    expect(preferences).toMatchObject({
      kind: "product-app-web.response",
      ok: true,
      operation: "submitActionInput",
      requestId: "demo_persist_preferences",
      document: {
        snapshot: {
          view: {
            theme: "dark",
            density: "compact"
          }
        }
      }
    })

    const mode = await postJson(`${first.url}/wanex/product-app-web/request`, {
      kind: "product-app-web.request",
      operation: "submitActionInput",
      requestId: "demo_persist_mode",
      input: {
        action: "set-mode",
        fields: {
          mode: "diagnostics"
        }
      }
    })
    expect(mode).toMatchObject({
      ok: true,
      document: {
        snapshot: {
          view: {
            mode: "diagnostics"
          }
        }
      }
    })

    await first.close()

    const second = await startTestProductAppLocalDemoHost({
      hostname: "127.0.0.1",
      storeDir,
      serviceBin,
      sessionId: "ses_demo_persisted_state",
      seedText: "unused persisted state seed",
      seed: false,
      open: false,
      pollIntervalMs: 0
    })

    const html = await fetchText(`${second.url}/`)
    expect(html).toContain('data-product-mode="diagnostics"')
    expect(html).toContain("<dt>Layout</dt><dd>diagnostics</dd>")
    expect(html).toContain("<dt>Theme</dt><dd>dark</dd>")
    expect(html).toContain("<dt>Density</dt><dd>compact</dd>")
    expect(html).toContain('data-product-theme="dark"')
    expect(html).toContain('data-product-density="compact"')
    expect(html).toContain('<option value="dark" selected>Dark</option>')
    expect(html).toContain('<option value="compact" selected>Compact</option>')

    await second.close()
  })
})

async function startTestProductAppLocalDemoHost(
  options: Parameters<typeof startProductAppLocalDemoHost>[0]
): Promise<ProductAppLocalDemoHost> {
  const demo = await startProductAppLocalDemoHost(options)
  onTestFinished(async () => await demo.close())
  return demo
}

async function createTestTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  registerTempDirCleanup(dir)
  return dir
}

function registerTempDirCleanup(dir: string): void {
  onTestFinished(async () => {
    await rm(dir, { recursive: true, force: true })
  })
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url)
  expect(response.status).toBe(200)
  return await response.text()
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function postJson(url: string, body: unknown): Promise<any> {
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
