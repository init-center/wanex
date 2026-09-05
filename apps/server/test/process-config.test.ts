import { execFile, spawn } from "node:child_process"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { promisify } from "node:util"
import { dirname, join, resolve } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { parseWanexServerProcessConfig } from "../src/cli/config.js"

const execFileAsync = promisify(execFile)
const tsxCli = join(
  dirname(createRequire(import.meta.url).resolve("tsx")),
  "cli.mjs"
)
const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)
const processRoots: string[] = []

afterEach(async () => {
  await Promise.all(processRoots.splice(0).map(async (root) => {
    await rm(root, { recursive: true, force: true })
  }))
})

describe("Wanex Server process config", () => {
  it("parses strict TLS file paths separately from Server authority", () => {
    const config = parseWanexServerProcessConfig({
      dataRoot: resolve("target/server-process-data"),
      profileId: "process",
      listener: { hostname: "127.0.0.1", port: 9443 },
      tls: {
        keyFile: resolve("target/server-process.key"),
        certFile: resolve("target/server-process.crt")
      }
    })

    expect(config).toEqual({
      server: {
        dataRoot: resolve("target/server-process-data"),
        profileId: "process",
        hostId: "wanex-server:process",
        listener: { hostname: "127.0.0.1", port: 9443 }
      },
      tls: {
        keyFile: resolve("target/server-process.key"),
        certFile: resolve("target/server-process.crt")
      }
    })
    expect(Object.isFrozen(config)).toBe(true)
    expect(Object.isFrozen(config.server)).toBe(true)
    expect(Object.isFrozen(config.tls)).toBe(true)
  })

  it.each([
    [null, "Wanex Server process config must be an object"],
    [{ dataRoot: resolve("target/server-process-data"), tls: {} }, "requires keyFile and certFile"],
    [{ dataRoot: resolve("target/server-process-data"), tls: { keyFile: "relative", certFile: "/tmp/cert" } }, "tls.keyFile must be absolute"],
    [{ dataRoot: resolve("target/server-process-data"), tls: { keyFile: "/tmp/key", certFile: "/tmp/cert", extra: true } }, "requires keyFile and certFile"],
    [{ dataRoot: resolve("target/server-process-data"), tls: { keyFile: "/tmp/key", certFile: "/tmp/cert" }, extra: true }, "field is not allowed: extra"]
  ])("rejects invalid process config %#", (value, message) => {
    expect(() => parseWanexServerProcessConfig(value)).toThrow(message)
  })

  it("starts as a real process and closes cleanly on SIGTERM", async () => {
    await mkdir(join(dirname(import.meta.dirname), "target"), { recursive: true })
    const root = await mkdtemp(join(dirname(import.meta.dirname), "target/server-process-"))
    processRoots.push(root)
    const tlsDir = join(root, "tls")
    await mkdir(tlsDir, { recursive: true })
    const keyFile = join(tlsDir, "server.key")
    const certFile = join(tlsDir, "server.crt")
    await execFileAsync("openssl", [
      "req", "-x509", "-newkey", "rsa:2048", "-nodes",
      "-keyout", keyFile, "-out", certFile, "-days", "1",
      "-subj", "/CN=localhost",
      "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1"
    ])
    const configFile = join(root, "server.json")
    await writeFile(configFile, `${JSON.stringify({
      dataRoot: join(root, "data"),
      profileId: "process-test",
      listener: { hostname: "127.0.0.1", port: 0 },
      tls: { keyFile, certFile }
    })}\n`)
    const child = spawn(process.execPath, [
      tsxCli,
      join(import.meta.dirname, "../src/cli/main.ts"),
      "--config",
      configFile
    ], {
      cwd: join(import.meta.dirname, "../.."),
      env: {
        ...process.env,
        WANEX_SERVER_BEARER_TOKEN: "process-test-token",
        WANEX_SYSTEM_SERVICE_BIN: serviceBin
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    })
    let stdout = ""
    let stderr = ""
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (value: string) => { stdout += value })
    child.stderr.on("data", (value: string) => { stderr += value })
    try {
      await waitForOutput(child, () => stdout.includes('"kind":"wanex.server.ready"'), () => stderr)
      const ready = JSON.parse(stdout.split("\n").find((line) => line.includes("wanex.server.ready"))!)
      expect(ready).toMatchObject({
        kind: "wanex.server.ready",
        endpoint: { transport: "https", port: expect.any(Number) },
        status: { state: "open", listener: "ready" }
      })
      expect(stdout).not.toContain("process-test-token")
      child.kill("SIGTERM")
      await waitForExit(child)
      expect(child.exitCode).toBe(0)
      expect(stderr).toBe("")
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL")
    }
  }, 20_000)
})

async function waitForOutput(
  child: ReturnType<typeof spawn>,
  predicate: () => boolean,
  readStderr: () => string
): Promise<void> {
  const deadline = Date.now() + 10_000
  while (!predicate()) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Server process exited before ready: ${child.exitCode ?? child.signalCode}; stderr=${readStderr()}`)
    }
    if (Date.now() >= deadline) throw new Error("Server process did not become ready")
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

async function waitForExit(child: ReturnType<typeof spawn>): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  await new Promise<void>((resolve) => child.once("exit", () => resolve()))
}
