import { createHash } from "node:crypto"
import { execFile, spawn } from "node:child_process"
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { promisify } from "node:util"
import {
  buildServerDistribution,
  workspaceRoot
} from "../../../scripts/build-server-distribution.mjs"

const execFileAsync = promisify(execFile)
const serverToken = "wanex-packaged-remote-coding-proof-token"

export async function createRemoteCodingServer(options) {
  const root = await mkdtemp(join(tmpdir(), "wanex-packaged-remote-server-"))
  const certificate = await createCertificate(root)
  const repositoryPath = await realpath(resolve(options.repositoryPath))
  const artifact = await buildServerDistribution({
    targetId: `${process.platform}-${process.arch}`
  })
  const projectId = repositoryProjectId(repositoryPath)
  const configPath = join(root, "server.json")
  await writeFile(configPath, `${JSON.stringify({
    dataRoot: join(root, "data"),
    profileId: "packaged-remote-server",
    hostId: "packaged-remote-server",
    listener: { hostname: "127.0.0.1", port: 0 },
    coding: {
      execution: { kind: "native" },
      projects: [{ repositoryPath }]
    },
    tls: {
      keyFile: certificate.keyPath,
      certFile: certificate.certPath
    }
  })}\n`)
  const child = spawn(process.execPath, [
    join(artifact.outputRoot, "server.mjs"),
    "--config",
    configPath
  ], {
    cwd: root,
    env: {
      ...process.env,
      WANEX_SERVER_BEARER_TOKEN: serverToken
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
    const ready = await waitForReady(child, () => stdout, () => stderr)
    return {
      endpoint: ready.endpoint.messageUrl,
      caPath: certificate.certPath,
      projectId,
      artifactRoot: artifact.outputRoot,
      token: serverToken,
      get status() { return ready.status },
      get stderr() { return stderr },
      async close() {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGTERM")
          await waitForExit(child)
        }
        await rm(root, { recursive: true, force: true })
      }
    }
  } catch (error) {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL")
    await waitForExit(child).catch(() => {})
    await rm(root, { recursive: true, force: true })
    throw error
  }
}

async function createCertificate(root) {
  const keyPath = join(root, "localhost.key")
  const certPath = join(root, "localhost.crt")
  await execFileAsync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes",
    "-keyout", keyPath, "-out", certPath, "-days", "1",
    "-subj", "/CN=localhost",
    "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1"
  ])
  return { keyPath, certPath }
}

async function waitForReady(child, readStdout, readStderr) {
  const deadline = Date.now() + 20_000
  for (;;) {
    const line = readStdout().split("\n").find((value) =>
      value.includes('"kind":"wanex.server.ready"')
    )
    if (line !== undefined) return JSON.parse(line)
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`packaged Server exited before ready: ${child.exitCode ?? child.signalCode}; stderr=${readStderr()}`)
    }
    if (Date.now() >= deadline) throw new Error(`packaged Server did not become ready; stderr=${readStderr()}`)
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

async function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  await new Promise((resolve) => child.once("exit", resolve))
}

function repositoryProjectId(repositoryPath) {
  const normalized = process.platform === "win32"
    ? repositoryPath.replaceAll("\\", "/").toLowerCase()
    : repositoryPath.replaceAll("\\", "/")
  return `repo_${createHash("sha256").update(normalized).digest("hex").slice(0, 40)}`
}
