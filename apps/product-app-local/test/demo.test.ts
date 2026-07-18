import { access, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
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

const tempDirs: string[] = []
const demoHosts: ProductAppLocalDemoHost[] = []
const serviceBin = join(
  import.meta.dirname,
  "../../../target/debug/wanex-system-service"
)

afterEach(async () => {
  while (demoHosts.length > 0) {
    await demoHosts.pop()?.close()
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

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
      WANEX_SERVICE_BIN: "./target/env-binary"
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
    tempDirs.push(dir)

    expect(dir).toContain("wanex-product-app-web-demo-")
  })

  it("creates an explicit store directory recursively", async () => {
    const root = await mkdtemp(join(tmpdir(), "wanex-product-app-web-demo-test-"))
    tempDirs.push(root)
    const storeDir = join(root, "nested/store")

    const created = await ensureProductAppLocalDemoStoreDir(storeDir)

    expect(created).toBe(storeDir)
  })

  it("cleans up the default temporary demo store on close", async () => {
    const demo = await startProductAppLocalDemoHost({
      hostname: "127.0.0.1",
      serviceBin,
      sessionId: "ses_demo_temp_cleanup",
      seedText: "unused seed",
      seed: false,
      open: false,
      pollIntervalMs: 0
    })
    demoHosts.push(demo)
    const storeDir = demo.storeDir

    await expect(pathExists(storeDir)).resolves.toBe(true)
    await demo.close()
    demoHosts.splice(demoHosts.indexOf(demo), 1)

    await expect(pathExists(storeDir)).resolves.toBe(false)
  })

  it("keeps an explicit demo store directory after close", async () => {
    const root = await mkdtemp(join(tmpdir(), "wanex-product-app-web-demo-explicit-"))
    tempDirs.push(root)
    const storeDir = join(root, "store")
    const demo = await startProductAppLocalDemoHost({
      hostname: "127.0.0.1",
      storeDir,
      serviceBin,
      sessionId: "ses_demo_explicit_cleanup",
      seedText: "unused seed",
      seed: false,
      open: false,
      pollIntervalMs: 0
    })
    demoHosts.push(demo)

    await demo.close()
    demoHosts.splice(demoHosts.indexOf(demo), 1)

    await expect(pathExists(storeDir)).resolves.toBe(true)
  })

  it("starts the blank demo host and accepts the first workbench turn over HTTP", async () => {
    const demo = await startProductAppLocalDemoHost({
      hostname: "127.0.0.1",
      serviceBin,
      sessionId: "ses_demo_blank",
      seedText: "unused seed",
      seed: false,
      open: false,
      pollIntervalMs: 0
    })
    demoHosts.push(demo)

    const html = await fetchText(`${demo.url}/`)
    expect(html).toContain("Wanex Product App")
    expect(html).toContain('data-workbench-composer-kind="start"')
    expect(html).toContain("Start a workbench session")
    expect(html).toContain('data-poll-interval-ms="0"')
    expect(demo.sessionId).toBeUndefined()

    const response = await postJson(`${demo.url}/wanex/product-app-web/request`, {
      kind: "product-app-web.request",
      operation: "submitActionInput",
      requestId: "demo_blank_start",
      input: {
        action: "start-workbench",
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
          action: "start-workbench"
        }
      },
      document: {
        snapshot: {
          workbench: {
            state: "ready",
            summary: {
              latestUserText: "demo host first turn"
            }
          },
          view: {
            workbenchCanContinue: true
          }
        }
      }
    })
    expect(response.document.html).toContain(
      'data-workbench-composer-kind="continue"'
    )
    expect(response.document.html).toContain("Ready to send")
  })

  it("starts the seeded demo host with the selected seeded session", async () => {
    const demo = await startProductAppLocalDemoHost({
      hostname: "127.0.0.1",
      serviceBin,
      sessionId: "ses_demo_seeded_lifecycle",
      seedText: "seeded lifecycle turn",
      seed: true,
      open: false,
      pollIntervalMs: 0
    })
    demoHosts.push(demo)

    const html = await fetchText(`${demo.url}/`)
    expect(demo.sessionId).toBe("ses_demo_seeded_lifecycle")
    expect(html).toContain("seeded lifecycle turn")
    expect(html).toContain('data-session-id="ses_demo_seeded_lifecycle"')
    expect(html).toContain('data-workbench-composer-kind="continue"')
    expect(html).toContain("Ready to send")
  })

  it("persists Product App renderer state across demo host restarts", async () => {
    const root = await mkdtemp(join(tmpdir(), "wanex-product-app-web-demo-state-"))
    tempDirs.push(root)
    const storeDir = join(root, "store")

    const first = await startProductAppLocalDemoHost({
      hostname: "127.0.0.1",
      storeDir,
      serviceBin,
      sessionId: "ses_demo_persisted_state",
      seedText: "unused persisted state seed",
      seed: false,
      open: false,
      pollIntervalMs: 0
    })
    demoHosts.push(first)

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

    await first.close()
    demoHosts.splice(demoHosts.indexOf(first), 1)

    const second = await startProductAppLocalDemoHost({
      hostname: "127.0.0.1",
      storeDir,
      serviceBin,
      sessionId: "ses_demo_persisted_state",
      seedText: "unused persisted state seed",
      seed: false,
      open: false,
      pollIntervalMs: 0
    })
    demoHosts.push(second)

    const html = await fetchText(`${second.url}/`)
    expect(html).toContain("<dt>Layout</dt><dd>diagnostics</dd>")
    expect(html).toContain("<dt>Theme</dt><dd>dark</dd>")
    expect(html).toContain("<dt>Density</dt><dd>compact</dd>")
    expect(html).toContain('data-product-theme="dark"')
    expect(html).toContain('data-product-density="compact"')
    expect(html).toContain(
      '<option value="diagnostics" selected>Diagnostics</option>'
    )
    expect(html).toContain('<option value="dark" selected>Dark</option>')
    expect(html).toContain('<option value="compact" selected>Compact</option>')
  })
})

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
