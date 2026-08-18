#!/usr/bin/env node
import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
  NATIVE_RELEASE_SAMPLE_COUNT,
  summarizeNativeRuntimeSamples
} from "./native-runtime-metrics.mjs"

export { summarizeNativeRuntimeSamples }

const entryPath = fileURLToPath(import.meta.url)
const workspaceRoot = dirname(dirname(entryPath))
const manifestFile = "runtime-artifacts.json"
const sampleTimeoutMs = 60_000

export interface NativeRuntimeProofOptions {
  readonly artifactDir?: string
}

export interface NativeRuntimeProofSample {
  readonly index: number
  readonly temperature: "cold"
  readonly targetId: string
  readonly state: string
  readonly assistantText: string
  readonly messageCount: number
  readonly wallTimeMs: number
  readonly timingsMs: {
    readonly coldImport: number
    readonly artifactVerification: number
    readonly create: number
    readonly turn: number
    readonly dispose: number
    readonly total: number
  }
}

if (import.meta.main) {
  try {
    const args = process.argv.slice(2)
    if (args.includes("--internal-sample")) {
      const sample = await runInternalSample(parseInternalSampleArgs(args))
      process.stdout.write(`${JSON.stringify(sample)}\n`)
    } else {
      const receipt = await proveNativeRuntime(parseNativeRuntimeProofArgs(args))
      process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`)
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
    process.exitCode = 1
  }
}

export function parseNativeRuntimeProofArgs(
  args: readonly string[]
): NativeRuntimeProofOptions {
  let artifactDir: string | undefined
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index]
    if (name === "--") continue
    if (name !== "--artifact-dir") {
      throw new Error(`unknown native Runtime proof argument: ${String(name)}`)
    }
    const value = args[index + 1]
    if (!value) throw new Error(`${name} requires a value`)
    artifactDir = resolve(value)
    index += 1
  }
  return artifactDir === undefined ? {} : { artifactDir }
}

export async function proveNativeRuntime(options: NativeRuntimeProofOptions) {
  const artifactDir = resolve(
    options.artifactDir ?? join(workspaceRoot, "target/distribution/native")
  )
  const outputPath = join(
    workspaceRoot,
    "target/distribution/native-runtime-proof.json"
  )
  const proofRoot = await mkdtemp(join(tmpdir(), "Wanex 原生 证明-"))
  try {
    const verifiedAt = performance.now()
    const manifestPath = join(artifactDir, manifestFile)
    const manifestSource = await readFile(manifestPath, "utf8")
    const bootstrap = await import("../packages/runtime/src/bootstrap/index.js")
    const manifest = bootstrap.parseRuntimeArtifactManifest(
      JSON.parse(manifestSource) as unknown
    )
    if (manifest.targets.length !== 1) {
      throw new Error("native Runtime proof requires exactly one staged target")
    }
    const resolvedArtifact = await bootstrap.resolveSystemServiceBinary({
      manifest,
      artifactDir,
      platform: process.platform,
      arch: process.arch,
      checkExecutable: process.platform !== "win32"
    })
    const resolvedTarget = resolvedArtifact.target
    if (
      resolvedArtifact.source !== "manifest" ||
      resolvedTarget === undefined ||
      resolvedTarget.platform !== process.platform ||
      resolvedTarget.arch !== process.arch ||
      resolvedTarget.id !== `${process.platform}-${process.arch}`
    ) {
      throw new Error("resolved native Runtime artifact does not match the host")
    }
    const expectedFiles = [
      manifestFile,
      manifest.targets[0]!.systemService.path
    ].sort()
    const artifactFiles = await listFiles(artifactDir)
    if (JSON.stringify(artifactFiles) !== JSON.stringify(expectedFiles)) {
      throw new Error(
        `native Runtime artifact directory contains unexpected files: ${artifactFiles.join(",")}`
      )
    }
    if (artifactFiles.some((path) => path.split("/").includes("node_modules"))) {
      throw new Error("native Runtime artifact directory contains node_modules")
    }
    const immutableBefore = {
      manifestSha256: sha256Bytes(Buffer.from(manifestSource)),
      executableSha256: await sha256File(resolvedArtifact.path)
    }
    const artifactVerificationMs = performance.now() - verifiedAt

    const samples: NativeRuntimeProofSample[] = []
    for (let index = 0; index < NATIVE_RELEASE_SAMPLE_COUNT; index += 1) {
      const storeDir = join(proofRoot, `样本 ${index + 1}`, "store 数据")
      await mkdir(dirname(storeDir), { recursive: true })
      const measured = await measureNativeRuntimeSample(
        () => runSampleProcess({ artifactDir, storeDir }),
        () => assertNoOwnedProcess(storeDir)
      )
      samples.push({
        ...measured.sample,
        index,
        temperature: "cold",
        wallTimeMs: measured.wallTimeMs
      })
    }

    const immutableAfter = {
      manifestSha256: await sha256File(manifestPath),
      executableSha256: await sha256File(resolvedArtifact.path)
    }
    if (JSON.stringify(immutableAfter) !== JSON.stringify(immutableBefore)) {
      throw new Error("native Runtime immutable resources changed during proof")
    }
    const receipt = {
      kind: "wanex.native-runtime.proof-receipt",
      ok: true,
      host: { platform: process.platform, arch: process.arch },
      target: resolvedTarget,
      pathCase: { spaces: true, nonAscii: true },
      artifact: {
        bytes: resolvedArtifact.bytes,
        fileCount: artifactFiles.length,
        files: artifactFiles,
        verificationMs: artifactVerificationMs
      },
      immutableResources: immutableAfter,
      sampleCount: samples.length,
      samples,
      summary: summarizeNativeRuntimeSamples(samples),
      noNodeModulesBesideArtifact: true,
      noOwnedProcessAfterRun: true
    }
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8")
    return receipt
  } finally {
    await rm(proofRoot, { recursive: true, force: true })
  }
}

export async function measureNativeRuntimeSample<T>(
  runSample: () => Promise<T>,
  auditOwnedProcesses: () => Promise<void>,
  now: () => number = () => performance.now()
): Promise<{ readonly sample: T; readonly wallTimeMs: number }> {
  const startedAt = now()
  const sample = await runSample()
  const wallTimeMs = now() - startedAt
  await auditOwnedProcesses()
  return { sample, wallTimeMs }
}

interface InternalSampleOptions {
  readonly artifactDir: string
  readonly storeDir: string
}

interface InternalSampleResult {
  readonly targetId: string
  readonly state: string
  readonly assistantText: string
  readonly messageCount: number
  readonly timingsMs: NativeRuntimeProofSample["timingsMs"]
}

function parseInternalSampleArgs(args: readonly string[]): InternalSampleOptions {
  let artifactDir: string | undefined
  let storeDir: string | undefined
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index]
    if (name === "--internal-sample") continue
    if (name !== "--artifact-dir" && name !== "--store-dir") {
      throw new Error(`unknown native Runtime sample argument: ${String(name)}`)
    }
    const value = args[index + 1]
    if (!value) throw new Error(`${name} requires a value`)
    if (name === "--artifact-dir") artifactDir = resolve(value)
    if (name === "--store-dir") storeDir = resolve(value)
    index += 1
  }
  if (artifactDir === undefined || storeDir === undefined) {
    throw new Error("native Runtime sample requires artifactDir and storeDir")
  }
  return { artifactDir, storeDir }
}

async function runInternalSample(
  options: InternalSampleOptions
): Promise<InternalSampleResult> {
  const totalStartedAt = performance.now()
  const importStartedAt = performance.now()
  const [bootstrap, runtimeModule] = await Promise.all([
    import("../packages/runtime/src/bootstrap/index.js"),
    import("../packages/runtime/src/index.js")
  ])
  const coldImport = performance.now() - importStartedAt

  const verificationStartedAt = performance.now()
  const manifest = bootstrap.parseRuntimeArtifactManifest(JSON.parse(
    await readFile(join(options.artifactDir, manifestFile), "utf8")
  ) as unknown)
  const artifact = await bootstrap.resolveSystemServiceBinary({
    manifest,
    artifactDir: options.artifactDir,
    platform: process.platform,
    arch: process.arch,
    checkExecutable: process.platform !== "win32"
  })
  if (artifact.source !== "manifest" || artifact.target === undefined) {
    throw new Error("native Runtime sample did not resolve a manifest artifact")
  }
  const artifactVerification = performance.now() - verificationStartedAt

  const createStartedAt = performance.now()
  const runtime = await runtimeModule.createWanexRuntime({
    storage: {
      kind: "local-system-service",
      mode: "persistent",
      storeDir: options.storeDir,
      serviceBin: artifact.path
    },
    modelEndpoint: {
      id: "native-runtime-proof",
      connection: { id: "native-runtime-proof", providerId: "fake" },
      protocol: { id: "fake" },
      model: {
        id: "native-runtime-proof-model",
        operations: ["conversation"],
        inputModalities: ["text"],
        outputModalities: ["text"],
        features: [],
        catalog: {
          source: "builtin",
          catalogId: "wanex.native-runtime-proof",
          revision: "1"
        }
      }
    },
    fakeResponseText: "native Runtime proof complete"
  })
  const create = performance.now() - createStartedAt
  try {
    const turnStartedAt = performance.now()
    const result = await runtime.run({
      content: [{ type: "text", text: "prove the staged native Runtime" }],
      sessionId: "ses_native_runtime_proof"
    })
    const turn = performance.now() - turnStartedAt
    if (
      result.state !== "succeeded" ||
      result.assistantText !== "native Runtime proof complete" ||
      !result.workerResults.includes("completed")
    ) {
      throw new Error(`native Runtime turn failed: ${JSON.stringify(result)}`)
    }
    const disposeStartedAt = performance.now()
    await runtime.dispose()
    await runtime.dispose()
    const dispose = performance.now() - disposeStartedAt
    return {
      targetId: artifact.target.id,
      state: result.state,
      assistantText: result.assistantText,
      messageCount: result.messageCount,
      timingsMs: {
        coldImport,
        artifactVerification,
        create,
        turn,
        dispose,
        total: performance.now() - totalStartedAt
      }
    }
  } finally {
    await runtime.dispose()
    await runtime.dispose()
  }
}

function runSampleProcess(options: InternalSampleOptions): Promise<InternalSampleResult> {
  return new Promise((resolvePromise, reject) => {
    let settled = false
    let stdout = ""
    let stderr = ""
    const child = spawn(process.execPath, [
      "--import",
      "tsx",
      entryPath,
      "--internal-sample",
      "--artifact-dir",
      options.artifactDir,
      "--store-dir",
      options.storeDir
    ], {
      cwd: workspaceRoot,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    })
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (chunk: string) => {
      stdout = appendBounded(stdout, chunk)
    })
    child.stderr.on("data", (chunk: string) => {
      stderr = appendBounded(stderr, chunk)
    })
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      void terminateOwnedProcesses(options.storeDir).finally(() => {
        reject(new Error(`native Runtime sample exceeded ${sampleTimeoutMs}ms`))
      })
    }, sampleTimeoutMs)
    child.once("error", (error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      reject(error)
    })
    child.once("exit", (code, signal) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (code !== 0) {
        reject(new Error(
          `native Runtime sample exited with ${signal ?? code}: ${stderr}`
        ))
        return
      }
      try {
        resolvePromise(JSON.parse(stdout.trim()) as InternalSampleResult)
      } catch (error) {
        reject(new Error(
          `native Runtime sample returned invalid JSON: ${stdout}`,
          { cause: error }
        ))
      }
    })
  })
}

async function assertNoOwnedProcess(marker: string): Promise<void> {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 250))
  const processes = await ownedProcesses(marker)
  if (processes.length > 0) {
    throw new Error(
      `native Runtime proof left owned processes: ${processes.map((item) => item.command).join(" | ")}`
    )
  }
}

async function terminateOwnedProcesses(marker: string): Promise<void> {
  const processes = await ownedProcesses(marker)
  await Promise.all(processes.map(async ({ pid }) => {
    if (process.platform === "win32") {
      await commandOutput("taskkill", ["/PID", String(pid), "/T", "/F"])
        .catch(() => "")
      return
    }
    try {
      process.kill(pid, "SIGKILL")
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error
    }
  }))
}

async function ownedProcesses(
  marker: string
): Promise<readonly { readonly pid: number; readonly command: string }[]> {
  if (process.platform === "win32") {
    const output = await commandOutput("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Get-CimInstance Win32_Process | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress"
    ])
    const parsed = JSON.parse(output) as
      | { readonly ProcessId?: number; readonly CommandLine?: string | null }
      | readonly { readonly ProcessId?: number; readonly CommandLine?: string | null }[]
    const rows = Array.isArray(parsed) ? parsed : [parsed]
    return rows.flatMap((row) =>
      row.ProcessId !== undefined &&
      row.ProcessId !== process.pid &&
      row.CommandLine?.includes(marker)
        ? [{ pid: row.ProcessId, command: row.CommandLine }]
        : []
    )
  }
  const output = await commandOutput("ps", ["-ax", "-o", "pid=", "-o", "command="])
  return output.split(/\r?\n/).flatMap((line) => {
    const match = /^\s*(\d+)\s+(.*)$/.exec(line)
    if (match === null) return []
    const pid = Number(match[1])
    const command = match[2]!
    return pid !== process.pid && command.includes(marker)
      ? [{ pid, command }]
      : []
  })
}

function commandOutput(command: string, args: readonly string[]): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    let stdout = ""
    let stderr = ""
    const child = spawn(command, [...args], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    })
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (chunk: string) => {
      stdout = appendBounded(stdout, chunk)
    })
    child.stderr.on("data", (chunk: string) => {
      stderr = appendBounded(stderr, chunk)
    })
    child.once("error", reject)
    child.once("exit", (code) => {
      if (code === 0) resolvePromise(stdout)
      else reject(new Error(`${command} process audit exited ${code}: ${stderr}`))
    })
  })
}

async function listFiles(root: string, current = root): Promise<string[]> {
  const files: string[] = []
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name)
    if (entry.isDirectory()) {
      files.push(...await listFiles(root, path))
    } else {
      files.push(relative(root, path).replaceAll("\\", "/"))
    }
  }
  return files.sort()
}

async function sha256File(path: string): Promise<string> {
  return sha256Bytes(await readFile(path))
}

function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function appendBounded(current: string, chunk: string): string {
  return `${current}${chunk}`.slice(-1024 * 1024)
}
