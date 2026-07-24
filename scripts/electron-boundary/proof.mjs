#!/usr/bin/env node
import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  distributionRoot,
  packageElectronBoundary,
  packagedExecutable
} from "./build.mjs"
import {
  ELECTRON_PROOF_SAMPLE_COUNT,
  summarizeElectronSamples
} from "./metrics.mjs"

if (import.meta.main) {
  assertCanonicalProofArgs(process.argv.slice(2))
  const receipt = await proveElectronBoundary()
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`)
}

export function assertCanonicalProofArgs(args) {
  for (const arg of args) {
    if (arg !== "--") {
      throw new Error(`unknown Electron proof argument: ${arg}`)
    }
  }
}

export async function proveElectronBoundary() {
  const proofRoot = await mkdtemp(join(tmpdir(), "Wanex 证明 空格-"))
  const userDataDir = join(proofRoot, "用户 数据")
  try {
    const buildReceipt = await packageElectronBoundary()
    const executable = packagedExecutable(buildReceipt.packaged.packageDir)
    const immutableBefore = await hashImmutableResources(
      buildReceipt.packaged.packageDir
    )
    const samples = []
    for (let index = 0; index < ELECTRON_PROOF_SAMPLE_COUNT; index += 1) {
      const receiptPath = join(proofRoot, `runtime-receipt-${index}.json`)
      const measured = await measureElectronBoundarySample(
        () => run(executable, {
          WANEX_ELECTRON_SMOKE_RECEIPT: receiptPath,
          WANEX_ELECTRON_SMOKE_USER_DATA: userDataDir
        }, 60_000),
        () => assertNoOwnedProcess(userDataDir)
      )
      const runtime = JSON.parse(await readFile(receiptPath, "utf8"))
      if (
        runtime.kind !== "wanex.electron-boundary.runtime-receipt" ||
        runtime.ok !== true
      ) {
        throw new Error(
          `Electron boundary runtime proof failed: ${JSON.stringify(runtime)}`
        )
      }
      const failureEvidence =
        `${measured.output.stderr}\n${JSON.stringify(runtime)}`
      if (/EPERM[\s\S]{0,160}rename|rename[\s\S]{0,160}EPERM/i.test(failureEvidence)) {
        throw new Error("Electron boundary emitted an EPERM rename failure")
      }
      samples.push({
        index,
        temperature: index === 0 ? "cold" : "warm",
        runtime,
        wallTimeMs: measured.wallTimeMs
      })
    }
    const immutableAfter = await hashImmutableResources(
      buildReceipt.packaged.packageDir
    )
    if (JSON.stringify(immutableAfter) !== JSON.stringify(immutableBefore)) {
      throw new Error("packaged immutable resources changed during execution")
    }
    const receipt = {
      kind: "wanex.electron-boundary.proof-receipt",
      ok: true,
      host: { platform: process.platform, arch: process.arch },
      pathCase: {
        spaces: true,
        nonAscii: true
      },
      staging: buildReceipt.staging,
      packaged: {
        ...buildReceipt.packaged,
        packageDir: undefined
      },
      immutableResources: immutableAfter,
      sampleCount: samples.length,
      samples,
      summary: summarizeElectronSamples(samples),
      noEpermRename: true,
      noOwnedProcessAfterRun: true
    }
    await writeFile(
      join(distributionRoot, "electron-boundary-report.json"),
      `${JSON.stringify(receipt, null, 2)}\n`,
      "utf8"
    )
    return receipt
  } finally {
    await rm(proofRoot, { recursive: true, force: true })
  }
}

export async function measureElectronBoundarySample(
  runSample,
  auditOwnedProcesses,
  now = () => Date.now()
) {
  const startedAt = now()
  let output
  let runFailure
  try {
    output = await runSample()
  } catch (error) {
    runFailure = error
  }
  const wallTimeMs = now() - startedAt
  let auditFailure
  try {
    await auditOwnedProcesses()
  } catch (error) {
    auditFailure = error
  }
  if (runFailure !== undefined && auditFailure !== undefined) {
    throw new AggregateError(
      [runFailure, auditFailure],
      "Electron sample execution and process audit both failed"
    )
  }
  if (runFailure !== undefined) throw runFailure
  if (auditFailure !== undefined) throw auditFailure
  return { output, wallTimeMs }
}

async function hashImmutableResources(packageDir) {
  const resourcesDir = process.platform === "darwin"
    ? join(packageDir, "Wanex Boundary.app/Contents/Resources")
    : join(packageDir, "resources")
  const nativeDir = join(resourcesDir, "native")
  const manifest = JSON.parse(await readFile(
    join(nativeDir, "runtime-artifacts.json"),
    "utf8"
  ))
  const target = manifest.targets.find((item) =>
    item.platform === process.platform && item.arch === process.arch
  )
  if (target === undefined) {
    throw new Error("packaged immutable resource target is missing")
  }
  return {
    manifestSha256: await sha256(join(nativeDir, "runtime-artifacts.json")),
    executableSha256: await sha256(join(nativeDir, ...target.systemService.path.split("/")))
  }
}

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex")
}

function run(command, environment, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false
    let stdout = ""
    let stderr = ""
    const child = spawn(command, [], {
      env: { ...process.env, ...environment },
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32"
    })
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (chunk) => {
      stdout = appendBounded(stdout, chunk)
    })
    child.stderr.on("data", (chunk) => {
      stderr = appendBounded(stderr, chunk)
    })
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      void terminateProcessTree(child).finally(() => {
        reject(new Error(`packaged Electron exceeded ${timeoutMs}ms`))
      })
    }, timeoutMs)
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
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(
        `packaged Electron exited with ${signal ?? code}: ${stderr}`
      ))
    })
  })
}

async function assertNoOwnedProcess(userDataDir) {
  await new Promise((resolve) => setTimeout(resolve, 250))
  const commands = process.platform === "win32"
    ? await commandOutput("powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Get-CimInstance Win32_Process | Select-Object -ExpandProperty CommandLine"
      ])
    : await commandOutput("ps", ["-ax", "-o", "command="])
  if (commands.includes(userDataDir)) {
    throw new Error("Electron boundary left an owned process after shutdown")
  }
}

function commandOutput(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] })
    let output = ""
    child.stdout.setEncoding("utf8")
    child.stdout.on("data", (chunk) => {
      output = appendBounded(output, chunk)
    })
    child.once("error", reject)
    child.once("exit", (code) => {
      if (code === 0) resolve(output)
      else reject(new Error(`${command} process audit exited with ${code}`))
    })
  })
}

function terminateProcessTree(child) {
  if (child.pid === undefined) return Promise.resolve()
  if (process.platform !== "win32") {
    try {
      process.kill(-child.pid, "SIGKILL")
    } catch (error) {
      if (error.code !== "ESRCH") return Promise.reject(error)
    }
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    const cleanup = spawn("taskkill", [
      "/PID",
      String(child.pid),
      "/T",
      "/F"
    ], {
      windowsHide: true,
      stdio: "ignore"
    })
    cleanup.once("error", () => resolve())
    cleanup.once("exit", () => resolve())
  })
}

function appendBounded(current, chunk) {
  return `${current}${chunk}`.slice(-1024 * 1024)
}
