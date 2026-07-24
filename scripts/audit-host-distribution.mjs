#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
  ELECTRON_PROOF_SAMPLE_COUNT,
  summarizeElectronSamples
} from "./electron-boundary/metrics.mjs"

const workspaceRoot = dirname(dirname(fileURLToPath(import.meta.url)))

if (import.meta.main) {
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
    const coldBudget = requireRecord(electronBudget.cold, "Electron cold budget")
    const warmBudget = requireRecord(electronBudget.warm, "Electron warm budget")
    const electron = requireRecord(request.electron, "Electron proof receipt")
    const packaged = requireRecord(electron.packaged, "Electron packaged receipt")
    const declaredSummary = requireRecord(
      electron.summary,
      "Electron proof summary"
    )
    const samples = requireArray(electron.samples, "Electron proof samples")
    const summary = summarizeElectronSamples(samples)
    const coldTimings = requireRecord(
      summary.cold.timingsMs,
      "Electron cold timings"
    )
    const warmMetrics = requireRecord(
      summary.warm.metrics,
      "Electron warm metrics"
    )
    expectEqual(failures, "Electron receipt kind", electron.kind, "wanex.electron-boundary.proof-receipt")
    expectEqual(failures, "Electron receipt ok", electron.ok, true)
    expectEqual(failures, "Electron target", `${packaged.platform}-${packaged.arch}`, request.targetId)
    expectEqual(
      failures,
      "Electron sample count",
      electron.sampleCount,
      ELECTRON_PROOF_SAMPLE_COUNT
    )
    if (JSON.stringify(declaredSummary) !== JSON.stringify(summary)) {
      failures.push("Electron declared summary does not match raw samples")
    }
    expectEqual(failures, "Electron EPERM rename exclusion", electron.noEpermRename, true)
    expectEqual(failures, "Electron process cleanup", electron.noOwnedProcessAfterRun, true)
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
      "Electron cold total ms",
      coldTimings.total,
      coldBudget.maxTotalMs
    )
    expectMaximum(
      failures,
      "Electron cold wall time ms",
      coldTimings.wallTime,
      coldBudget.maxWallTimeMs
    )
    expectMaximum(
      failures,
      "Electron warm artifact verification maximum ms",
      maximum(warmMetrics, "artifactVerification"),
      warmBudget.maxArtifactVerificationMs
    )
    expectMaximum(
      failures,
      "Electron warm host startup maximum ms",
      maximum(warmMetrics, "hostStartup"),
      warmBudget.maxHostStartupMs
    )
    expectMaximum(
      failures,
      "Electron warm shutdown maximum ms",
      maximum(warmMetrics, "shutdown"),
      warmBudget.maxShutdownMs
    )
    expectMaximum(
      failures,
      "Electron warm total maximum ms",
      maximum(warmMetrics, "total"),
      warmBudget.maxTotalMs
    )
    expectMaximum(
      failures,
      "Electron warm wall time maximum ms",
      maximum(warmMetrics, "wallTime"),
      warmBudget.maxWallTimeMs
    )
    observed.electron = {
      unpackedBytes: packaged.unpackedBytes,
      packageFileCount: packaged.fileCount,
      asarBytes: packaged.asarBytes,
      asarEntryCount: packaged.asarEntryCount,
      nativeBytes: packaged.nativeBytes,
      nativeFileCount: packaged.nativeFileCount,
      cold: {
        totalMs: coldTimings.total,
        wallTimeMs: coldTimings.wallTime
      },
      warm: {
        artifactVerificationMaximumMs:
          maximum(warmMetrics, "artifactVerification"),
        hostStartupMaximumMs: maximum(warmMetrics, "hostStartup"),
        shutdownMaximumMs: maximum(warmMetrics, "shutdown"),
        totalMaximumMs: maximum(warmMetrics, "total"),
        wallTimeMaximumMs: maximum(warmMetrics, "wallTime")
      }
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

function maximum(metrics, metric) {
  return requireRecord(metrics[metric], `${metric} summary`).maximumMs
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

function requireArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`)
  }
  return value
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"))
}
