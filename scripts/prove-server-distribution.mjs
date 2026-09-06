#!/usr/bin/env node
import { execFile, fork } from "node:child_process"
import { createHash } from "node:crypto"
import { request as httpsRequest } from "node:https"
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { promisify } from "node:util"
import {
  buildServerDistribution,
  auditServerDistribution,
  distributionRoot,
  workspaceRoot
} from "./build-server-distribution.mjs"

const execFileAsync = promisify(execFile)
const token = "wanex-server-distribution-proof-token"

if (import.meta.main) {
  const receipt = await proveServerDistribution(parseArgs(process.argv.slice(2)))
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`)
}

export async function proveServerDistribution(options = {}) {
  const targetId = options.targetId ?? `${process.platform}-${process.arch}`
  const proofRoot = await mkdtemp(join(workspaceRoot, "target/server-proof-"))
  const artifactRoot = join(proofRoot, "artifact")
  const repositoryRoot = join(proofRoot, "repository")
  const tlsRoot = join(proofRoot, "tls")
  let child
  const startedAt = performance.now()
  try {
    await createRepository(repositoryRoot)
    await mkdir(tlsRoot, { recursive: true })
    const certificate = await createCertificate(tlsRoot)
    const sourceBin = await existingNativeSource(targetId)
    const artifact = await buildServerDistribution({
      targetId,
      outputRoot: artifactRoot,
      ...(sourceBin === undefined ? {} : { sourceBin })
    })
    await auditServerDistribution(artifactRoot, targetId)
    const configPath = join(proofRoot, "server.json")
    await writeFile(configPath, `${JSON.stringify({
      dataRoot: join(proofRoot, "data"),
      profileId: "server-distribution-proof",
      hostId: "server-distribution-proof",
      listener: { hostname: "127.0.0.1", port: 0 },
      coding: {
        execution: { kind: "native" },
        projects: [{ repositoryPath: repositoryRoot }]
      },
      tls: { keyFile: certificate.keyPath, certFile: certificate.certPath }
    })}\n`, "utf8")
    child = fork(join(artifactRoot, "server.mjs"), [
      "--config",
      configPath
    ], {
      cwd: proofRoot,
      env: { ...process.env, WANEX_SERVER_BEARER_TOKEN: token },
      silent: true,
      windowsHide: true
    })
    let stdout = ""
    let stderr = ""
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (value) => { stdout += value })
    child.stderr.on("data", (value) => { stderr += value })
    const ready = await waitForReady(child, () => stdout, () => stderr)
    const endpoint = ready.endpoint
    const invalid = await requestJson(endpoint, certificate.certPath, {
      authorization: "Bearer invalid-token"
    }, {
      kind: "wanex.agent-host.handshake.request",
      protocolVersion: 1,
      clientId: "server-distribution-proof-invalid",
      accessToken: "opaque-proof-access-token",
      requestedDomains: ["coding"]
    })
    if (invalid.status !== 401) throw new Error("invalid bearer was accepted")
    const handshake = await requestJson(endpoint, certificate.certPath, {
      authorization: `Bearer ${token}`
    }, {
      kind: "wanex.agent-host.handshake.request",
      protocolVersion: 1,
      clientId: "server-distribution-proof",
      accessToken: "opaque-proof-access-token",
      requestedDomains: ["coding"]
    })
    if (
      handshake.status !== 200 ||
      handshake.body?.kind !== "wanex.agent-host.handshake.response" ||
      typeof handshake.sessionId !== "string"
    ) {
      throw new Error("Server Host handshake proof failed")
    }
    const projects = await requestJson(endpoint, certificate.certPath, {
      authorization: `Bearer ${token}`,
      "x-wanex-host-session": handshake.sessionId
    }, {
      kind: "wanex.agent-host.operation.request",
      operationKind: "read",
      requestId: "server-distribution-proof-projects",
      domain: "coding",
      operation: "coding.read",
      payload: { command: "project.list" }
    })
    const projectList = projects.body?.result
    if (
      projects.status !== 200 ||
      projects.body?.kind !== "wanex.agent-host.operation.response" ||
      projects.body.outcome !== "completed" ||
      !Array.isArray(projectList) ||
      projectList.length !== 1
    ) {
      throw new Error("Server Coding project.list proof failed")
    }
    await requestShutdown(child)
    await waitForExit(child)
    if (child.exitCode !== 0 || stderr !== "") {
      throw new Error(`Server distribution shutdown proof failed: ${stderr}`)
    }
    const receipt = createServerDistributionProofReceipt({
      targetId,
      artifact,
      ready,
      shutdownExitCode: child.exitCode,
      totalMs: performance.now() - startedAt
    })
    const outputPath = options.outputPath ?? join(
      distributionRoot,
      "server-distribution-proof.json"
    )
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8")
    return receipt
  } finally {
    if (child !== undefined && child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL")
      await waitForExit(child).catch(() => {})
    }
    await rm(proofRoot, { recursive: true, force: true })
  }
}

export function parseArgs(args) {
  const options = {
    targetId: `${process.platform}-${process.arch}`
  }
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index]
    if (name === "--") continue
    const value = args[index + 1]
    if (name !== "--target" && name !== "--output") {
      throw new Error(`unknown Server distribution proof argument: ${name}`)
    }
    if (!value) throw new Error(`${name} requires a value`)
    if (name === "--target") options.targetId = value
    if (name === "--output") options.outputPath = resolve(value)
    index += 1
  }
  return options
}

export function createServerDistributionProofReceipt({
  targetId,
  artifact,
  ready,
  shutdownExitCode,
  totalMs
}) {
  if (
    !artifact ||
    !Array.isArray(artifact.files) ||
    !Number.isSafeInteger(artifact.bytes) ||
    artifact.bytes <= 0
  ) {
    throw new Error("Server distribution proof artifact is invalid")
  }
  if (!ready || ready.status === null || typeof ready.status !== "object") {
    throw new Error("Server distribution proof readiness is invalid")
  }
  if (!Number.isFinite(totalMs) || totalMs < 0) {
    throw new Error("Server distribution proof timing is invalid")
  }
  if (!Number.isInteger(shutdownExitCode) || shutdownExitCode !== 0) {
    throw new Error("Server distribution proof shutdown is invalid")
  }
  return {
    kind: "wanex.server-distribution.proof-receipt",
    ok: true,
    targetId,
    artifact: { bytes: artifact.bytes, fileCount: artifact.files.length },
    server: {
      status: ready.status,
      invalidBearerRejected: true,
      handshakeAccepted: true,
      codingProjectListAccepted: true,
      shutdownExitCode
    },
    timingsMs: { total: totalMs },
    noCredentialsRetained: true,
    noOwnedProcessAfterRun: true
  }
}

async function existingNativeSource(targetId) {
  const name = targetId === "win32-x64"
    ? "wanex-system-service.exe"
    : "wanex-system-service"
  const path = join(workspaceRoot, "target/distribution/native", targetId, name)
  try {
    await access(path)
    return path
  } catch {
    return undefined
  }
}

async function createRepository(root) {
  await mkdir(root, { recursive: true })
  await writeFile(join(root, "README.md"), "server distribution proof\n", "utf8")
  for (const args of [
    ["init"],
    ["config", "user.email", "wanex@example.local"],
    ["config", "user.name", "Wanex Server Distribution Proof"],
    ["config", "commit.gpgsign", "false"],
    ["add", "README.md"],
    ["commit", "-m", "initial proof repository"]
  ]) await execFileAsync("git", ["-C", root, ...args])
}

async function createCertificate(root) {
  const keyPath = join(root, "server.key")
  const certPath = join(root, "server.crt")
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
      throw new Error(`Server exited before ready: ${readStderr()}`)
    }
    if (Date.now() >= deadline) throw new Error(`Server did not become ready: ${readStderr()}`)
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

async function requestJson(endpoint, caPath, headers, body) {
  const ca = await readFile(caPath)
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint.messageUrl)
    const request = createServerRequest({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      ca,
      headers: { ...headers, "content-type": "application/json" }
    }, resolve, reject)
    request.end(JSON.stringify(body))
  })
}

function createServerRequest(options, resolveResponse, rejectResponse) {
  const request = httpsRequest({
    ...options,
    method: "POST"
  }, (response) => {
    let text = ""
    response.setEncoding("utf8")
    response.on("data", (value) => { text += value })
    response.on("end", () => {
      let body
      try { body = JSON.parse(text) } catch (error) { rejectResponse(error); return }
      resolveResponse({
        status: response.statusCode,
        sessionId: response.headers["x-wanex-host-session"],
        body
      })
    })
  })
  request.on("error", rejectResponse)
  return request
}

function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
  return new Promise((resolve) => child.once("exit", resolve))
}

function requestShutdown(child) {
  return new Promise((resolve, reject) => {
    child.send({ kind: "wanex.server.shutdown" }, (error) => {
      if (error !== null && error !== undefined) reject(error)
      else resolve()
    })
  })
}
