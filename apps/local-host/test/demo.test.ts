import { access, mkdtemp, rm } from "node:fs/promises"
import { spawn } from "node:child_process"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { describe, expect, it, onTestFinished } from "vitest"
import {
  startLocalDemoHost,
  type LocalDemoHost
} from "../src/dev/host.js"
import {
  ensureLocalDemoStoreDir,
  parseLocalDemoOptions,
  parseLocalDemoPort
} from "../src/dev/options.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)

describe("local host demo", () => {
  it("starts from the source entry with the default workspace artifact", async () => {
    const environment = { ...process.env }
    delete environment.WANEX_SYSTEM_SERVICE_BIN
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        join(import.meta.dirname, "../src/dev/main.ts"),
        "--",
        "--no-seed",
        "--port",
        "0"
      ],
      {
        cwd: join(import.meta.dirname, ".."),
        env: environment,
        stdio: ["ignore", "pipe", "pipe"]
      }
    )
    const output = await waitForDemoStartup(child)
    child.kill("SIGTERM")
    const exit = await waitForDemoExit(child)

    expect(exit).toEqual({ code: 0, signal: null })
    expect(output.stdout).toContain("Wanex local host demo running")
    expect(output.stdout).toContain("URL: http://127.0.0.1:")
    expect(output.stdout).toContain(`Service binary: ${serviceBin}`)
    expect(output.stderr).toBe("")
  })

  it("parses explicit flags and ignores the pnpm separator", () => {
    const rootDir = "/repo"
    const options = parseLocalDemoOptions(
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
      open: false
    })
  })

  it("falls back to defaults and environment values", () => {
    const rootDir = "/repo"
    const options = parseLocalDemoOptions(rootDir, [], {
      WANEX_WEB_PORT: "58000",
      WANEX_WEB_SESSION_ID: "ses_env",
      WANEX_WEB_SEED_TEXT: "env turn",
      WANEX_SYSTEM_SERVICE_BIN: "./target/env-binary"
    })

    expect(options).toEqual({
      hostname: "127.0.0.1",
      port: 58000,
      serviceBin: resolve(rootDir, "./target/env-binary"),
      sessionId: "ses_env",
      seedText: "env turn",
      seed: true,
      open: false
    })
  })

  it("parses explicit and environment browser-open requests", () => {
    const rootDir = "/repo"

    expect(parseLocalDemoOptions(rootDir, ["--open"], {})).toMatchObject({
      open: true
    })
    expect(parseLocalDemoOptions(rootDir, [], {
      WANEX_WEB_OPEN: "1"
    })).toMatchObject({
      open: true
    })
  })

  it("can disable demo seeding from the environment", () => {
    const rootDir = "/repo"
    const options = parseLocalDemoOptions(rootDir, [], {
      WANEX_WEB_NO_SEED: "true"
    })

    expect(options).toMatchObject({
      seed: false,
      open: false,
      sessionId: "ses_local_web_demo",
      seedText: "hello from web demo"
    })
  })

  it("rejects unknown demo flags", () => {
    expect(() => parseLocalDemoOptions("/repo", ["--oops"], {}))
      .toThrow("unknown demo option: --oops")
    expect(() => parseLocalDemoOptions("/repo", ["--oops", "1"], {}))
      .toThrow("unknown demo option: --oops")
  })

  it("rejects invalid ports", () => {
    expect(() => parseLocalDemoPort("-1")).toThrow("invalid port: -1")
    expect(() => parseLocalDemoPort("70000")).toThrow(
      "invalid port: 70000"
    )
    expect(() => parseLocalDemoPort("abc")).toThrow(
      "invalid port: abc"
    )
    expect(() => parseLocalDemoPort("123abc")).toThrow(
      "invalid port: 123abc"
    )
    expect(() => parseLocalDemoPort("")).toThrow("invalid port: ")
  })

  it("creates a temporary store when no directory is provided", async () => {
    const dir = await ensureLocalDemoStoreDir(undefined)
    registerTempDirCleanup(dir)

    expect(dir).toContain("wanex-web-demo-")
  })

  it("creates an explicit store directory recursively", async () => {
    const root = await createTestTempDir("wanex-web-demo-test-")
    const storeDir = join(root, "nested/store")

    const created = await ensureLocalDemoStoreDir(storeDir)

    expect(created).toBe(storeDir)
  })

  it("cleans up the default temporary demo store on close", async () => {
    const demo = await startTestLocalDemoHost({
      hostname: "127.0.0.1",
      serviceBin,
      sessionId: "ses_demo_temp_cleanup",
      seedText: "unused seed",
      seed: false,
      open: false,
    })
    const storeDir = demo.storeDir

    await expect(pathExists(storeDir)).resolves.toBe(true)
    await demo.close()

    await expect(pathExists(storeDir)).resolves.toBe(false)
  })

  it("keeps an explicit demo store directory after close", async () => {
    const root = await createTestTempDir("wanex-web-demo-explicit-")
    const storeDir = join(root, "store")
    const demo = await startTestLocalDemoHost({
      hostname: "127.0.0.1",
      storeDir,
      serviceBin,
      sessionId: "ses_demo_explicit_cleanup",
      seedText: "unused seed",
      seed: false,
      open: false,
    })

    await demo.close()

    await expect(pathExists(storeDir)).resolves.toBe(true)
  })

  it("starts the blank demo host and accepts the first conversation over HTTP", async () => {
    const demo = await startTestLocalDemoHost({
      hostname: "127.0.0.1",
      serviceBin,
      sessionId: "ses_demo_blank",
      seedText: "unused seed",
      seed: false,
      open: false,
    })

    const initial = await requestSnapshot(demo.url)
    expect(initial).toMatchObject({
      kind: "web.snapshot",
      conversation: { state: "idle" },
      view: { mode: "chat", layout: "single" }
    })
    expect(demo.sessionId).toBeUndefined()

    const response = await postJson(`${demo.url}/wanex/web/request`, {
      kind: "web.request",
      operation: "dispatchAction",
      requestId: "demo_blank_start",
      action: {
        type: "submit-conversation",
        input: {
          text: "demo host first turn"
        }
      }
    })

    expect(response).toMatchObject({
      kind: "web.response",
      ok: true,
      operation: "dispatchAction",
      requestId: "demo_blank_start",
      actionResult: {
        ok: true,
        action: "submit-conversation",
        snapshot: {
            conversation: {
              operation: {
                kind: "product.conversation-operation"
              }
            },
            view: {
              selectedSessionTitle: "demo host first turn"
            }
          }
      }
    })
  })

  it("keeps chat focused and exposes workbench and diagnostics explicitly", async () => {
    const demo = await startTestLocalDemoHost({
      hostname: "127.0.0.1",
      serviceBin,
      sessionId: "ses_demo_modes",
      seedText: "unused mode seed",
      seed: false,
      open: false,
    })

    const chat = await requestSnapshot(demo.url)
    expect(chat).toMatchObject({
      view: { mode: "chat", layout: "single" }
    })

    const workbench = await postJson(
      `${demo.url}/wanex/web/request`,
      {
        kind: "web.request",
        operation: "dispatchAction",
        requestId: "demo_mode_workbench",
        action: {
          type: "set-mode",
          input: { mode: "workbench" }
        }
      }
    )
    expect(workbench).toMatchObject({
      ok: true,
      actionResult: {
        snapshot: {
            view: { mode: "workbench" }
          }
      }
    })

    const diagnostics = await postJson(
      `${demo.url}/wanex/web/request`,
      {
        kind: "web.request",
        operation: "dispatchAction",
        requestId: "demo_mode_diagnostics",
        action: {
          type: "set-mode",
          input: { mode: "diagnostics" }
        }
      }
    )
    expect(diagnostics).toMatchObject({
      ok: true,
      actionResult: {
        snapshot: {
            view: { mode: "diagnostics" }
          }
      }
    })
  })

  it("starts the seeded demo host with the selected seeded session", async () => {
    const demo = await startTestLocalDemoHost({
      hostname: "127.0.0.1",
      serviceBin,
      sessionId: "ses_demo_seeded_lifecycle",
      seedText: "seeded lifecycle turn",
      seed: true,
      open: false,
    })

    const snapshot = await requestSnapshot(demo.url)
    expect(demo.sessionId).toBe("ses_demo_seeded_lifecycle")
    expect(snapshot).toMatchObject({
      conversation: {
        state: "succeeded",
        sessionId: "ses_demo_seeded_lifecycle",
        historyRows: expect.arrayContaining([
          expect.objectContaining({
            parts: expect.arrayContaining([
              expect.objectContaining({ text: "seeded lifecycle turn" })
            ])
          })
        ])
      },
      view: {
        selection: {
          kind: "session",
          sessionId: "ses_demo_seeded_lifecycle"
        }
      }
    })
  })

  it("persists product renderer state across demo host restarts", async () => {
    const root = await createTestTempDir("wanex-web-demo-state-")
    const storeDir = join(root, "store")

    const first = await startTestLocalDemoHost({
      hostname: "127.0.0.1",
      storeDir,
      serviceBin,
      sessionId: "ses_demo_persisted_state",
      seedText: "unused persisted state seed",
      seed: false,
      open: false,
    })

    const changed = await postJson(`${first.url}/wanex/web/request`, {
      kind: "web.request",
      operation: "dispatchAction",
      requestId: "demo_persist_layout",
      action: {
        type: "set-layout",
        input: {
          layout: "diagnostics"
        }
      }
    })
    expect(changed).toMatchObject({
      kind: "web.response",
      ok: true,
      operation: "dispatchAction",
      requestId: "demo_persist_layout",
      actionResult: {
        snapshot: {
            view: {
              layout: "diagnostics"
            }
          }
      }
    })
    const preferences = await postJson(
      `${first.url}/wanex/web/request`,
      {
        kind: "web.request",
        operation: "dispatchAction",
        requestId: "demo_persist_preferences",
        action: {
          type: "update-preferences",
          input: {
            preferences: {
              theme: "dark",
              density: "compact"
            }
          }
        }
      }
    )
    expect(preferences).toMatchObject({
      kind: "web.response",
      ok: true,
      operation: "dispatchAction",
      requestId: "demo_persist_preferences",
      actionResult: {
        snapshot: {
            view: {
              theme: "dark",
              density: "compact"
            }
          }
      }
    })

    const mode = await postJson(`${first.url}/wanex/web/request`, {
      kind: "web.request",
      operation: "dispatchAction",
      requestId: "demo_persist_mode",
      action: {
        type: "set-mode",
        input: {
          mode: "diagnostics"
        }
      }
    })
    expect(mode).toMatchObject({
      ok: true,
      actionResult: {
        snapshot: {
            view: {
              mode: "diagnostics"
            }
          }
      }
    })

    await first.close()

    const second = await startTestLocalDemoHost({
      hostname: "127.0.0.1",
      storeDir,
      serviceBin,
      sessionId: "ses_demo_persisted_state",
      seedText: "unused persisted state seed",
      seed: false,
      open: false,
    })

    const restored = await requestSnapshot(second.url)
    expect(restored).toMatchObject({
      view: {
        mode: "diagnostics",
        layout: "diagnostics",
        theme: "dark",
        density: "compact"
      }
    })

    await second.close()
  })
})

function waitForDemoStartup(child: ReturnType<typeof spawn>): Promise<{
  readonly stdout: string
  readonly stderr: string
}> {
  return new Promise((resolvePromise, reject) => {
    let stdout = ""
    let stderr = ""
    const timeout = setTimeout(() => {
      cleanup()
      child.kill("SIGKILL")
      reject(new Error(`demo startup timed out:\n${stdout}\n${stderr}`))
    }, 15_000)
    child.stdout?.setEncoding("utf8")
    child.stderr?.setEncoding("utf8")
    child.stdout?.on("data", onStdout)
    child.stderr?.on("data", onStderr)
    child.once("exit", onEarlyExit)

    function onStdout(chunk: string): void {
      stdout += chunk
      if (!stdout.includes("Stop: Ctrl+C")) return
      cleanup()
      resolvePromise({ stdout, stderr })
    }

    function onStderr(chunk: string): void {
      stderr += chunk
    }

    function onEarlyExit(code: number | null, signal: NodeJS.Signals | null): void {
      cleanup()
      reject(new Error(
        `demo exited before startup: code=${String(code)} signal=${String(signal)}\n` +
        `${stdout}\n${stderr}`
      ))
    }

    function cleanup(): void {
      clearTimeout(timeout)
      child.stdout?.off("data", onStdout)
      child.stderr?.off("data", onStderr)
      child.off("exit", onEarlyExit)
    }
  })
}

function waitForDemoExit(child: ReturnType<typeof spawn>): Promise<{
  readonly code: number | null
  readonly signal: NodeJS.Signals | null
}> {
  return new Promise((resolvePromise, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL")
      reject(new Error("demo did not stop after SIGTERM"))
    }, 10_000)
    child.once("error", (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.once("exit", (code, signal) => {
      clearTimeout(timeout)
      resolvePromise({ code, signal })
    })
  })
}

async function startTestLocalDemoHost(
  options: Parameters<typeof startLocalDemoHost>[0]
): Promise<LocalDemoHost> {
  const demo = await startLocalDemoHost(options)
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

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function postJson(url: string, body: unknown): Promise<any> {
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

async function requestSnapshot(url: string): Promise<any> {
  const response = await postJson(`${url}/wanex/web/request`, {
    kind: "web.request",
    operation: "snapshot",
    requestId: "demo_snapshot"
  })
  expect(response).toMatchObject({
    kind: "web.response",
    ok: true,
    operation: "snapshot",
    snapshot: { kind: "web.snapshot" }
  })
  return response.snapshot
}

async function readHostSessionToken(url: string): Promise<string> {
  const root = new URL("/", url)
  const response = await fetch(root)
  expect(response.status).toBe(200)
  const html = await response.text()
  const match = /data-host-session-token="([^"]+)"/.exec(html)
  if (match?.[1] === undefined) {
    throw new Error("product host document did not include a session token")
  }
  return match[1]
}
