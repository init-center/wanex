#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const workspaceRoot = dirname(dirname(fileURLToPath(import.meta.url)))

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseHostDistributionAuditArgs(process.argv.slice(2))
  const outputPath = join(
    workspaceRoot,
    "target/distribution",
    `host-distribution-audit-${options.targetId}.json`
  )
  let receipt
  try {
    const budget = await readJson(options.budgetPath)
    const targetBudget = budget?.targets?.[options.targetId]
    const native = await readJson(options.nativeReceiptPath)
    const electron = targetBudget?.electron === undefined
      ? undefined
      : await readJson(options.electronReceiptPath)
    receipt = auditHostDistributionData({
      targetId: options.targetId,
      budget,
      native,
      ...(electron === undefined ? {} : { electron })
    })
  } catch (error) {
    receipt = {
      kind: "wanex.host-distribution-audit-receipt",
      ok: false,
      targetId: options.targetId,
      failures: [error instanceof Error ? error.message : String(error)]
    }
  }
  await writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8")
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`)
  if (!receipt.ok) {
    throw new Error(`host distribution budget failed for ${options.targetId}`)
  }
}

export function parseHostDistributionAuditArgs(args) {
  let targetId = `${process.platform}-${process.arch}`
  let budgetPath = join(
    workspaceRoot,
    "docs/architecture/host-distribution-budget.json"
  )
  let nativeReceiptPath = join(
    workspaceRoot,
    "target/distribution/native-runtime-proof.json"
  )
  let electronReceiptPath = join(
    workspaceRoot,
    "target/distribution/electron/electron-boundary-report.json"
  )
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index]
    if (name === "--") continue
    if (![
      "--target",
      "--budget",
      "--native-receipt",
      "--electron-receipt"
    ].includes(name)) {
      throw new Error(`unknown host distribution audit argument: ${String(name)}`)
    }
    const value = args[index + 1]
    if (!value) throw new Error(`${name} requires a value`)
    if (name === "--target") targetId = value
    if (name === "--budget") budgetPath = resolve(value)
    if (name === "--native-receipt") nativeReceiptPath = resolve(value)
    if (name === "--electron-receipt") electronReceiptPath = resolve(value)
    index += 1
  }
  return { targetId, budgetPath, nativeReceiptPath, electronReceiptPath }
}

export function auditHostDistributionData(request) {
  const failures = []
  const budget = requireRecord(request.budget, "host distribution budget")
  if (budget.kind !== "wanex.host-distribution-budget") {
    throw new Error("host distribution budget kind is invalid")
  }
  const targets = requireRecord(budget.targets, "host distribution budget targets")
  const targetBudget = requireRecord(
    targets[request.targetId],
    `host distribution budget target ${request.targetId}`
  )
  const nativeBudget = requireRecord(targetBudget.native, "native budget")
  const native = requireRecord(request.native, "native Runtime proof receipt")
  const nativeTarget = requireRecord(native.target, "native Runtime proof target")
  const nativeArtifact = requireRecord(native.artifact, "native Runtime proof artifact")
  const nativeSummary = requireRecord(native.summary, "native Runtime proof summary")
  expectEqual(failures, "native receipt kind", native.kind, "wanex.native-runtime.proof-receipt")
  expectEqual(failures, "native receipt ok", native.ok, true)
  expectEqual(failures, "native target", nativeTarget.id, request.targetId)
  expectEqual(failures, "native artifact file count", nativeArtifact.fileCount, nativeBudget.exactFileCount)
  expectEqual(failures, "native node_modules exclusion", native.noNodeModulesBesideArtifact, true)
  expectEqual(failures, "native process cleanup", native.noOwnedProcessAfterRun, true)
  expectMaximum(failures, "native executable bytes", nativeArtifact.bytes, nativeBudget.maxExecutableBytes)
  expectMaximum(
    failures,
    "native cold import p95 ms",
    p95(nativeSummary, "coldImport"),
    nativeBudget.maxColdImportP95Ms
  )
  expectMaximum(
    failures,
    "native create/dispose p95 ms",
    p95(nativeSummary, "createDispose"),
    nativeBudget.maxCreateDisposeP95Ms
  )
  expectMaximum(
    failures,
    "native total p95 ms",
    p95(nativeSummary, "total"),
    nativeBudget.maxTotalP95Ms
  )
  expectMaximum(
    failures,
    "native wall time p95 ms",
    p95(nativeSummary, "wallTime"),
    nativeBudget.maxWallTimeP95Ms
  )

  const observed = {
    native: {
      executableBytes: nativeArtifact.bytes,
      fileCount: nativeArtifact.fileCount,
      coldImportP95Ms: p95(nativeSummary, "coldImport"),
      createDisposeP95Ms: p95(nativeSummary, "createDispose"),
      totalP95Ms: p95(nativeSummary, "total"),
      wallTimeP95Ms: p95(nativeSummary, "wallTime")
    }
  }

  if (targetBudget.electron !== undefined) {
    const electronBudget = requireRecord(targetBudget.electron, "Electron budget")
    const electron = requireRecord(request.electron, "Electron proof receipt")
    const packaged = requireRecord(electron.packaged, "Electron packaged receipt")
    const summary = requireRecord(electron.summary, "Electron proof summary")
    expectEqual(failures, "Electron receipt kind", electron.kind, "wanex.electron-boundary.proof-receipt")
    expectEqual(failures, "Electron receipt ok", electron.ok, true)
    expectEqual(failures, "Electron target", `${packaged.platform}-${packaged.arch}`, request.targetId)
    expectEqual(failures, "Electron ASAR entry count", packaged.asarEntryCount, electronBudget.exactAsarEntryCount)
    expectEqual(failures, "Electron native file count", packaged.nativeFileCount, electronBudget.exactNativeFileCount)
    expectEqual(failures, "Electron node_modules exclusion", packaged.hasApplicationNodeModules, false)
    expectEqual(failures, "Electron ASAR unpacked exclusion", packaged.hasAsarUnpacked, false)
    expectMaximum(failures, "Electron unpacked bytes", packaged.unpackedBytes, electronBudget.maxUnpackedBytes)
    expectMaximum(failures, "Electron package file count", packaged.fileCount, electronBudget.maxPackageFileCount)
    expectMaximum(failures, "Electron ASAR bytes", packaged.asarBytes, electronBudget.maxAsarBytes)
    expectMaximum(failures, "Electron native bytes", packaged.nativeBytes, electronBudget.maxNativeBytes)
    expectMaximum(
      failures,
      "Electron artifact verification p95 ms",
      p95(summary, "artifactVerification"),
      electronBudget.maxArtifactVerificationP95Ms
    )
    expectMaximum(
      failures,
      "Electron host startup p95 ms",
      p95(summary, "hostStartup"),
      electronBudget.maxHostStartupP95Ms
    )
    expectMaximum(
      failures,
      "Electron shutdown p95 ms",
      p95(summary, "shutdown"),
      electronBudget.maxShutdownP95Ms
    )
    expectMaximum(
      failures,
      "Electron total p95 ms",
      p95(summary, "total"),
      electronBudget.maxTotalP95Ms
    )
    expectMaximum(
      failures,
      "Electron wall time p95 ms",
      p95(summary, "wallTime"),
      electronBudget.maxWallTimeP95Ms
    )
    observed.electron = {
      unpackedBytes: packaged.unpackedBytes,
      packageFileCount: packaged.fileCount,
      asarBytes: packaged.asarBytes,
      asarEntryCount: packaged.asarEntryCount,
      nativeBytes: packaged.nativeBytes,
      nativeFileCount: packaged.nativeFileCount,
      artifactVerificationP95Ms: p95(summary, "artifactVerification"),
      hostStartupP95Ms: p95(summary, "hostStartup"),
      shutdownP95Ms: p95(summary, "shutdown"),
      totalP95Ms: p95(summary, "total"),
      wallTimeP95Ms: p95(summary, "wallTime")
    }
  } else if (request.electron !== undefined) {
    failures.push("headless target must not provide an Electron receipt")
  }

  return {
    kind: "wanex.host-distribution-audit-receipt",
    ok: failures.length === 0,
    targetId: request.targetId,
    limits: targetBudget,
    observed,
    failures
  }
}

function p95(summary, metric) {
  return requireRecord(summary[metric], `${metric} summary`).p95Ms
}

function expectEqual(failures, label, observed, expected) {
  if (observed !== expected) {
    failures.push(`${label}: observed ${String(observed)}, expected ${String(expected)}`)
  }
}

function expectMaximum(failures, label, observed, maximum) {
  if (typeof observed !== "number" || typeof maximum !== "number") {
    failures.push(`${label}: observed and maximum must be numbers`)
    return
  }
  if (observed > maximum) {
    failures.push(`${label}: observed ${observed}, maximum ${maximum}`)
  }
}

function requireRecord(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"))
}
