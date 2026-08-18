#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
  PRODUCT_DESKTOP_PROOF_SAMPLE_COUNT,
  summarizeProductDesktopSamples
} from "../apps/desktop/scripts/metrics.mjs"
import {
  NATIVE_RELEASE_SAMPLE_COUNT,
  summarizeNativeRuntimeSamples
} from "./native-runtime-metrics.mjs"

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
    const desktop = targetBudget?.desktop === undefined
      ? undefined
      : await readJson(options.desktopReceiptPath)
    const tui = targetBudget?.tui === undefined
      ? undefined
      : await readJson(options.tuiReceiptPath)
    receipt = auditHostDistributionData({
      targetId: options.targetId,
      budget,
      native,
      ...(desktop === undefined ? {} : { desktop }),
      ...(tui === undefined ? {} : { tui })
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
  let desktopReceiptPath = join(
    workspaceRoot,
    "target/distribution/product-desktop/product-desktop-report.json"
  )
  let tuiReceiptPath = join(
    workspaceRoot,
    "target/distribution/tui/installed-proof.json"
  )
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index]
    if (name === "--") continue
    if (![
      "--target",
      "--budget",
      "--native-receipt",
      "--desktop-receipt",
      "--tui-receipt"
    ].includes(name)) {
      throw new Error(`unknown host distribution audit argument: ${String(name)}`)
    }
    const value = args[index + 1]
    if (!value) throw new Error(`${name} requires a value`)
    if (name === "--target") targetId = value
    if (name === "--budget") budgetPath = resolve(value)
    if (name === "--native-receipt") nativeReceiptPath = resolve(value)
    if (name === "--desktop-receipt") desktopReceiptPath = resolve(value)
    if (name === "--tui-receipt") tuiReceiptPath = resolve(value)
    index += 1
  }
  return {
    targetId,
    budgetPath,
    nativeReceiptPath,
    desktopReceiptPath,
    tuiReceiptPath
  }
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
  const declaredNativeSummary = requireRecord(
    native.summary,
    "native Runtime proof summary"
  )
  const nativeSamples = requireArray(
    native.samples,
    "native Runtime proof samples"
  )
  const nativeSummary = summarizeNativeRuntimeSamples(nativeSamples)
  expectEqual(failures, "native receipt kind", native.kind, "wanex.native-runtime.proof-receipt")
  expectEqual(failures, "native receipt ok", native.ok, true)
  expectEqual(failures, "native target", nativeTarget.id, request.targetId)
  expectEqual(
    failures,
    "native sample count",
    native.sampleCount,
    NATIVE_RELEASE_SAMPLE_COUNT
  )
  expectEqual(
    failures,
    "native raw sample count",
    nativeSamples.length,
    NATIVE_RELEASE_SAMPLE_COUNT
  )
  if (JSON.stringify(declaredNativeSummary) !== JSON.stringify(nativeSummary)) {
    failures.push("native declared summary does not match raw samples")
  }
  expectEqual(failures, "native artifact file count", nativeArtifact.fileCount, nativeBudget.exactFileCount)
  expectEqual(failures, "native node_modules exclusion", native.noNodeModulesBesideArtifact, true)
  expectEqual(failures, "native process cleanup", native.noOwnedProcessAfterRun, true)
  expectMaximum(failures, "native executable bytes", nativeArtifact.bytes, nativeBudget.maxExecutableBytes)
  expectMaximum(
    failures,
    "native cold import median ms",
    median(nativeSummary, "coldImport"),
    nativeBudget.maxColdImportMedianMs
  )
  expectMaximum(
    failures,
    "native cold import hard maximum ms",
    maximum(nativeSummary, "coldImport"),
    nativeBudget.maxColdImportHardMs
  )
  expectMaximum(
    failures,
    "native create/dispose median ms",
    median(nativeSummary, "createDispose"),
    nativeBudget.maxCreateDisposeMedianMs
  )
  expectMaximum(
    failures,
    "native create/dispose hard maximum ms",
    maximum(nativeSummary, "createDispose"),
    nativeBudget.maxCreateDisposeHardMs
  )
  expectMaximum(
    failures,
    "native total median ms",
    median(nativeSummary, "total"),
    nativeBudget.maxTotalMedianMs
  )
  expectMaximum(
    failures,
    "native total hard maximum ms",
    maximum(nativeSummary, "total"),
    nativeBudget.maxTotalHardMs
  )
  expectMaximum(
    failures,
    "native wall time median ms",
    median(nativeSummary, "wallTime"),
    nativeBudget.maxWallTimeMedianMs
  )
  expectMaximum(
    failures,
    "native wall time hard maximum ms",
    maximum(nativeSummary, "wallTime"),
    nativeBudget.maxWallTimeHardMs
  )

  const observed = {
    native: {
      executableBytes: nativeArtifact.bytes,
      fileCount: nativeArtifact.fileCount,
      coldImportMedianMs: median(nativeSummary, "coldImport"),
      coldImportMaximumMs: maximum(nativeSummary, "coldImport"),
      createDisposeMedianMs: median(nativeSummary, "createDispose"),
      createDisposeMaximumMs: maximum(nativeSummary, "createDispose"),
      totalMedianMs: median(nativeSummary, "total"),
      totalMaximumMs: maximum(nativeSummary, "total"),
      wallTimeMedianMs: median(nativeSummary, "wallTime"),
      wallTimeMaximumMs: maximum(nativeSummary, "wallTime")
    }
  }

  if (targetBudget.desktop !== undefined) {
    const desktopBudget = requireRecord(targetBudget.desktop, "Product Desktop budget")
    const coldBudget = requireRecord(desktopBudget.cold, "Product Desktop cold budget")
    const warmBudget = requireRecord(desktopBudget.warm, "Product Desktop warm budget")
    const desktop = requireRecord(request.desktop, "Product Desktop proof receipt")
    const packaged = requireRecord(desktop.packaged, "Product Desktop packaged receipt")
    const declaredSummary = requireRecord(
      desktop.summary,
      "Product Desktop proof summary"
    )
    const samples = requireArray(desktop.samples, "Product Desktop proof samples")
    const summary = summarizeProductDesktopSamples(samples)
    const coldTimings = requireRecord(
      summary.cold.timingsMs,
      "Product Desktop cold timings"
    )
    const warmMetrics = requireRecord(
      summary.warm.metrics,
      "Product Desktop warm metrics"
    )
    expectEqual(failures, "Product Desktop receipt kind", desktop.kind, "wanex.product-desktop.proof-receipt")
    expectEqual(failures, "Product Desktop receipt ok", desktop.ok, true)
    expectEqual(failures, "Product Desktop target", `${packaged.platform}-${packaged.arch}`, request.targetId)
    expectEqual(
      failures,
      "Product Desktop sample count",
      desktop.sampleCount,
      PRODUCT_DESKTOP_PROOF_SAMPLE_COUNT
    )
    if (JSON.stringify(declaredSummary) !== JSON.stringify(summary)) {
      failures.push("Product Desktop declared summary does not match raw samples")
    }
    expectEqual(failures, "Product Desktop EPERM rename exclusion", desktop.noEpermRename, true)
    expectEqual(failures, "Product Desktop process cleanup", desktop.noOwnedProcessAfterRun, true)
    expectEqual(failures, "Product Desktop real Product document", desktop.realProductDocument, true)
    expectEqual(failures, "Product Desktop screenshot evidence", desktop.screenshotsNonBlank, true)
    expectEqual(failures, "Product Desktop ASAR entry count", packaged.asarEntryCount, desktopBudget.exactAsarEntryCount)
    expectEqual(failures, "Product Desktop native file count", packaged.nativeFileCount, desktopBudget.exactNativeFileCount)
    expectEqual(failures, "Product Desktop credential file count", packaged.credentialFileCount, desktopBudget.exactCredentialFileCount)
    expectEqual(failures, "Product Desktop node_modules exclusion", packaged.hasApplicationNodeModules, false)
    expectEqual(failures, "Product Desktop ASAR unpacked exclusion", packaged.hasAsarUnpacked, false)
    expectMaximum(failures, "Product Desktop unpacked bytes", packaged.unpackedBytes, desktopBudget.maxUnpackedBytes)
    expectMaximum(failures, "Product Desktop package file count", packaged.fileCount, desktopBudget.maxPackageFileCount)
    expectMaximum(failures, "Product Desktop ASAR bytes", packaged.asarBytes, desktopBudget.maxAsarBytes)
    expectMaximum(failures, "Product Desktop native bytes", packaged.nativeBytes, desktopBudget.maxNativeBytes)
    expectMaximum(failures, "Product Desktop credential bytes", packaged.credentialBytes, desktopBudget.maxCredentialBytes)
    expectMaximum(
      failures,
      "Product Desktop cold interactive total ms",
      coldTimings.interactiveTotal,
      coldBudget.maxInteractiveTotalMs
    )
    expectMaximum(
      failures,
      "Product Desktop cold conversation settlement ms",
      coldTimings.conversationSettlement,
      coldBudget.maxConversationSettlementMs
    )
    expectMaximum(
      failures,
      "Product Desktop cold proof wall time ms",
      coldTimings.wallTime,
      coldBudget.maxProofWallTimeMs
    )
    expectMaximum(
      failures,
      "Product Desktop warm artifact verification maximum ms",
      maximum(warmMetrics, "artifactVerification"),
      warmBudget.maxArtifactVerificationMs
    )
    expectMaximum(
      failures,
      "Product Desktop warm host startup median ms",
      median(warmMetrics, "hostStartup"),
      warmBudget.maxHostStartupMedianMs
    )
    expectMaximum(
      failures,
      "Product Desktop warm host startup hard maximum ms",
      maximum(warmMetrics, "hostStartup"),
      warmBudget.maxHostStartupHardMs
    )
    expectMaximum(
      failures,
      "Product Desktop warm shutdown maximum ms",
      maximum(warmMetrics, "shutdown"),
      warmBudget.maxShutdownMs
    )
    expectMaximum(
      failures,
      "Product Desktop warm interactive total median ms",
      median(warmMetrics, "interactiveTotal"),
      warmBudget.maxInteractiveTotalMedianMs
    )
    expectMaximum(
      failures,
      "Product Desktop warm interactive total hard maximum ms",
      maximum(warmMetrics, "interactiveTotal"),
      warmBudget.maxInteractiveTotalHardMs
    )
    expectMaximum(
      failures,
      "Product Desktop warm conversation settlement maximum ms",
      maximum(warmMetrics, "conversationSettlement"),
      warmBudget.maxConversationSettlementMs
    )
    expectMaximum(
      failures,
      "Product Desktop warm proof wall time maximum ms",
      maximum(warmMetrics, "wallTime"),
      warmBudget.maxProofWallTimeMs
    )
    observed.desktop = {
      unpackedBytes: packaged.unpackedBytes,
      packageFileCount: packaged.fileCount,
      asarBytes: packaged.asarBytes,
      asarEntryCount: packaged.asarEntryCount,
      nativeBytes: packaged.nativeBytes,
      nativeFileCount: packaged.nativeFileCount,
      credentialBytes: packaged.credentialBytes,
      credentialFileCount: packaged.credentialFileCount,
      cold: {
        interactiveTotalMs: coldTimings.interactiveTotal,
        conversationSettlementMs: coldTimings.conversationSettlement,
        proofTotalMs: coldTimings.proofTotal,
        proofWallTimeMs: coldTimings.wallTime
      },
      warm: {
        artifactVerificationMaximumMs:
          maximum(warmMetrics, "artifactVerification"),
        hostStartupMedianMs: median(warmMetrics, "hostStartup"),
        hostStartupMaximumMs: maximum(warmMetrics, "hostStartup"),
        conversationSettlementMaximumMs:
          maximum(warmMetrics, "conversationSettlement"),
        shutdownMaximumMs: maximum(warmMetrics, "shutdown"),
        interactiveTotalMedianMs: median(warmMetrics, "interactiveTotal"),
        interactiveTotalMaximumMs: maximum(warmMetrics, "interactiveTotal"),
        proofTotalMaximumMs: maximum(warmMetrics, "proofTotal"),
        proofWallTimeMaximumMs: maximum(warmMetrics, "wallTime")
      }
    }
  } else if (request.desktop !== undefined) {
    failures.push("headless target must not provide a Product Desktop receipt")
  }

  if (targetBudget.tui !== undefined) {
    const tuiBudget = requireRecord(targetBudget.tui, "TUI distribution budget")
    const tui = requireRecord(request.tui, "TUI installed proof receipt")
    const tuiHost = requireRecord(tui.host, "TUI installed proof host")
    const distribution = requireRecord(
      tui.distribution,
      "TUI installed proof distribution"
    )
    const staging = requireRecord(
      distribution.staging,
      "TUI distribution staging receipt"
    )
    const tarball = requireRecord(
      distribution.tarball,
      "TUI distribution tarball receipt"
    )
    const installed = requireRecord(
      tui.installed,
      "TUI installed proof installation"
    )
    const line = requireRecord(tui.line, "TUI installed line proof")
    const pty = requireRecord(tui.pty, "TUI installed PTY proof")
    expectEqual(
      failures,
      "TUI installed proof receipt kind",
      tui.kind,
      "wanex.tui.installed-proof-receipt"
    )
    expectEqual(failures, "TUI installed proof ok", tui.ok, true)
    expectEqual(
      failures,
      "TUI installed proof target",
      `${tuiHost.platform}-${tuiHost.arch}`,
      request.targetId
    )
    expectEqual(
      failures,
      "TUI installed proof native target",
      tui.nativeTarget,
      request.targetId
    )
    expectEqual(
      failures,
      "TUI installed proof external project",
      installed.projectDirOutsideWorkspace,
      true
    )
    expectEqual(
      failures,
      "TUI installed proof package lock",
      installed.packageLockChecked,
      true
    )
    expectEqual(
      failures,
      "TUI installed line provider authorization",
      line.providerAuthorized,
      true
    )
    expectMinimum(
      failures,
      "TUI installed registry requests",
      tui.registryRequests,
      1
    )
    expectEqual(
      failures,
      "TUI staging source exclusion",
      staging.hasSource,
      false
    )
    expectEqual(
      failures,
      "TUI staging tests exclusion",
      staging.hasTests,
      false
    )
    expectEqual(
      failures,
      "TUI staging workspace link exclusion",
      staging.hasWorkspaceLinks,
      false
    )
    expectEqual(
      failures,
      "TUI staging node_modules exclusion",
      staging.hasNodeModules,
      false
    )
    expectMaximum(
      failures,
      "TUI staging bytes",
      staging.bytes,
      tuiBudget.maxStagingBytes
    )
    expectMaximum(
      failures,
      "TUI staging file count",
      staging.fileCount,
      tuiBudget.maxStagingFileCount
    )
    expectMaximum(
      failures,
      "TUI tarball bytes",
      tarball.bytes,
      tuiBudget.maxTarballBytes
    )
    expectMaximum(
      failures,
      "TUI tarball file count",
      tarball.fileCount,
      tuiBudget.maxTarballFileCount
    )
    if (tuiBudget.ptyMode === "required") {
      expectEqual(failures, "TUI PTY proof mode", pty.mode, "pty")
      expectEqual(failures, "TUI terminal restoration", pty.terminalRestored, true)
    } else if (tuiBudget.ptyMode === "line-only") {
      expectEqual(failures, "TUI PTY proof status", pty.status, "platform_not_run")
      expectEqual(failures, "TUI PTY proof platform", pty.platform, "win32")
      expectEqual(failures, "TUI PTY proof reason", pty.reason, "windows distribution proof uses the line-mode contract")
    } else {
      failures.push("TUI PTY proof policy is missing or unsupported")
    }
    observed.tui = {
      stagingBytes: staging.bytes,
      stagingFileCount: staging.fileCount,
      tarballBytes: tarball.bytes,
      tarballFileCount: tarball.fileCount,
      registryRequests: tui.registryRequests,
      lineMode: line.mode,
      ptyMode: pty.mode ?? pty.status,
      terminalRestored: pty.terminalRestored ?? false
    }
  } else if (request.tui !== undefined) {
    failures.push("target without a TUI budget must not provide a TUI receipt")
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

function maximum(metrics, metric) {
  return requireRecord(metrics[metric], `${metric} summary`).maximumMs
}

function median(metrics, metric) {
  return requireRecord(metrics[metric], `${metric} summary`).medianMs
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

function expectMinimum(failures, label, observed, minimum) {
  if (typeof observed !== "number" || typeof minimum !== "number") {
    failures.push(`${label}: observed and minimum must be numbers`)
    return
  }
  if (observed < minimum) {
    failures.push(`${label}: observed ${observed}, minimum ${minimum}`)
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
