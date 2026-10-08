import { execFile, spawn } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { buildServerDistribution } from "../../../scripts/build-server-distribution.mjs"
import {
  WANEX_DESKTOP_PROOF_IMAGE_GENERATION_MODEL_ID,
  WANEX_DESKTOP_PROOF_REMOTE_ASSISTANT_MODEL_ID,
  WANEX_DESKTOP_PROOF_REMOTE_CREDENTIAL
} from "../src/proof-contract.ts"

const execFileAsync = promisify(execFile)
const providerCredentialEnvironmentName =
  "WANEX_DESKTOP_PROOF_SERVER_PROVIDER_CREDENTIAL"
const imageEndpointId =
  "desktop-proof-remote-assistant-provider.image-generate"

export async function createPackagedServer(options) {
  const root = await mkdtemp(join(tmpdir(), "wanex-packaged-remote-server-"))
  const certificate = await createCertificate(root)
  const artifact = await buildServerDistribution({
    targetId: `${process.platform}-${process.arch}`
  })
  const workspace = options.workspace === undefined ? undefined : {
    ...(options.workspace.initialRoots === undefined ? {} : { initialRoots: options.workspace.initialRoots }),
    ...(options.workspace.worktreeDirectory === undefined ? {} : { worktreeDirectory: options.workspace.worktreeDirectory })
  }
  const configPath = join(root, "server.json")
  await writeFile(configPath, `${JSON.stringify({
    dataRoot: join(root, "data"),
    profileId: "packaged-remote-server",
    hostId: "packaged-remote-server",
    listener: { hostname: "127.0.0.1", port: 0 },
    modelEndpoints: {
      endpoints: [{
        id: WANEX_DESKTOP_PROOF_REMOTE_ASSISTANT_MODEL_ID,
        connection: {
          id: "desktop-proof-remote-assistant-provider",
          providerId: "openai-compatible",
          baseUrl: options.provider.baseUrl,
          secretRef: `env://${providerCredentialEnvironmentName}`
        },
        protocol: { id: "openai-chat-completions" },
        model: {
          id: WANEX_DESKTOP_PROOF_REMOTE_ASSISTANT_MODEL_ID,
          operations: ["conversation"],
          inputModalities: ["text", "image"],
          outputModalities: ["text"],
          features: ["tool_calling"],
          catalog: {
            source: "custom",
            catalogId: "wanex.desktop.packaged-server-proof",
            revision: "1"
          }
        }
      }, {
        id: imageEndpointId,
        connection: {
          id: "desktop-proof-remote-assistant-provider",
          providerId: "openai-compatible",
          baseUrl: options.provider.baseUrl,
          secretRef: `env://${providerCredentialEnvironmentName}`
        },
        protocol: { id: "openai-images" },
        model: {
          id: WANEX_DESKTOP_PROOF_IMAGE_GENERATION_MODEL_ID,
          operations: ["image.generate"],
          inputModalities: ["text"],
          outputModalities: ["image"],
          features: [],
          catalog: {
            source: "custom",
            catalogId: "wanex.desktop.packaged-server-proof.images",
            revision: "1"
          }
        }
      }],
      activeEndpointId: WANEX_DESKTOP_PROOF_REMOTE_ASSISTANT_MODEL_ID,
      capabilityRoutes: { "image.generate": imageEndpointId }
    },
    tls: {
      keyFile: certificate.keyPath,
      certFile: certificate.certPath
    },
    ...(workspace === undefined ? {} : { workspace })
  })}\n`)
  const child = spawn(process.execPath, [
    join(artifact.outputRoot, "server.mjs"),
    "--config",
    configPath
  ], {
    cwd: root,
    env: {
      ...process.env,
      WANEX_SERVER_BEARER_TOKEN: WANEX_DESKTOP_PROOF_REMOTE_CREDENTIAL,
      [providerCredentialEnvironmentName]: options.provider.credential
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
      serverUrl: `${new URL(ready.endpoint.messageUrl).origin}/`,
      caPath: certificate.certPath,
      artifactRoot: artifact.outputRoot,
      credential: WANEX_DESKTOP_PROOF_REMOTE_CREDENTIAL,
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
