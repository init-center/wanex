import { execFile, spawn } from "node:child_process"
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from "node:fs/promises"
import { join } from "node:path"
import { promisify } from "node:util"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  auditServerDistribution,
  buildServerDistribution,
  workspaceRoot
} from "./build-server-distribution.mjs"

const execFileAsync = promisify(execFile)
const serviceBin = join(
  workspaceRoot,
  "target/debug/wanex-system-service" +
    (process.platform === "win32" ? ".exe" : "")
)
const testRoot = join(workspaceRoot, "target/server-distribution-test")
const processRoots = []
let artifactRoot

beforeAll(async () => {
  await mkdir(testRoot, { recursive: true })
  const root = await mkdtemp(join(testRoot, "run-"))
  processRoots.push(root)
  artifactRoot = join(root, "artifact")
  await buildServerDistribution({
    targetId: `${process.platform}-${process.arch}`,
    outputRoot: artifactRoot,
    sourceBin: serviceBin
  })
})

afterAll(async () => {
  await Promise.all(processRoots.splice(0).map(async (root) => {
    await rm(root, { recursive: true, force: true })
  }))
})

describe("headless Server distribution", () => {
  it("contains only the assembled runtime and validates its native artifact", async () => {
    const files = await auditServerDistribution(artifactRoot)
    expect(files).toContain("native/runtime-artifacts.json")
    expect(files).toContain("package.json")
    expect(files).toContain("server.mjs")
    expect(files).toContain("node_modules/@napi-rs/keyring/index.js")
    expect(files).toContain("node_modules/@napi-rs/keyring/keyring." + nativeBindingSuffix() + ".node")
    expect(files).toContain("node_modules/yaml/dist/index.js")
    expect(files).not.toContain("node_modules/.pnpm")
    expect(files.some((path) => path.includes("/node_modules/", path.indexOf("node_modules/") + 1))).toBe(false)
    expect(await readFile(join(artifactRoot, "server.mjs"), "utf8"))
      .not.toContain(workspaceRoot)
  })

  it("starts from the assembled directory without a workspace binary override", async () => {
    const root = processRoots[0]
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
      profileId: "distribution-test",
      listener: { hostname: "127.0.0.1", port: 0 },
      tls: { keyFile, certFile }
    })}\n`)
    const child = spawn(process.execPath, [
      join(artifactRoot, "server.mjs"),
      "--config",
      configFile
    ], {
      cwd: root,
      env: {
        ...process.env,
        WANEX_SERVER_BEARER_TOKEN: "distribution-test-token"
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    })
    let stdout = ""
    let stderr = ""
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (value) => { stdout += value })
    child.stderr.on("data", (value) => { stderr += value })
    try {
      await waitForOutput(child, () => stdout.includes('"kind":"wanex.server.ready"'), () => stderr)
      const ready = JSON.parse(stdout.split("\n").find((line) => line.includes("wanex.server.ready")))
      expect(ready).toMatchObject({
        kind: "wanex.server.ready",
        endpoint: { transport: "https", port: expect.any(Number) },
        status: { state: "open", listener: "ready" }
      })
      expect(stdout).not.toContain("distribution-test-token")
      expect(stderr).toBe("")
      child.kill("SIGTERM")
      await waitForExit(child)
      expect(child.exitCode).toBe(0)
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL")
    }
  }, 20_000)
})

function nativeBindingSuffix() {
  const suffixes = {
    "darwin-arm64": "darwin-arm64",
    "darwin-x64": "darwin-x64",
    "linux-x64": "linux-x64-gnu",
    "win32-x64": "win32-x64-msvc"
  }
  return suffixes[`${process.platform}-${process.arch}`]
}

async function waitForOutput(child, predicate, readStderr) {
  const deadline = Date.now() + 10_000
  while (!predicate()) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Server process exited before ready: ${child.exitCode ?? child.signalCode}; stderr=${readStderr()}`)
    }
    if (Date.now() >= deadline) throw new Error("Server process did not become ready")
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

async function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  await new Promise((resolve) => child.once("exit", () => resolve()))
}
