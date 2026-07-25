import { describe, expect, it } from "vitest"
import {
  auditHostDistributionData,
  parseHostDistributionAuditArgs
} from "./audit-host-distribution.mjs"
import { summarizeElectronSamples } from "./electron-boundary/metrics.mjs"
import { summarizeNativeRuntimeSamples } from "./native-runtime-metrics.mjs"

describe("host distribution budget", () => {
  it("parses only explicit audit paths and target", () => {
    expect(parseHostDistributionAuditArgs([
      "--",
      "--target",
      "linux-x64",
      "--budget",
      "budget.json"
    ])).toMatchObject({
      targetId: "linux-x64",
      budgetPath: expect.stringMatching(/budget\.json$/)
    })
    expect(() => parseHostDistributionAuditArgs(["--unknown"]))
      .toThrow("unknown host distribution audit argument")
  })

  it("accepts a headless receipt within its physical ceilings", () => {
    expect(auditHostDistributionData({
      targetId: "linux-x64",
      budget: budget(false),
      native: nativeReceipt()
    })).toMatchObject({
      ok: true,
      targetId: "linux-x64",
      failures: []
    })
  })

  it("reports every native and Electron ceiling violation", () => {
    const native = nativeReceipt()
    native.artifact.bytes = 101
    native.samples[2].timingsMs.total = 101
    native.summary = summarizeNativeRuntimeSamples(native.samples)
    const electron = electronReceipt()
    electron.packaged.unpackedBytes = 101
    electron.packaged.hasApplicationNodeModules = true
    electron.samples[0].runtime.timingsMs.interactiveTotal = 101
    electron.summary = summarizeElectronSamples(electron.samples)
    const result = auditHostDistributionData({
      targetId: "darwin-arm64",
      budget: budget(true),
      native: { ...native, target: { id: "darwin-arm64" } },
      electron
    })
    expect(result.ok).toBe(false)
    expect(result.failures).toEqual(expect.arrayContaining([
      expect.stringContaining("native executable bytes"),
      expect.stringContaining("native total maximum ms"),
      expect.stringContaining("Electron unpacked bytes"),
      expect.stringContaining("Electron node_modules exclusion"),
      expect.stringContaining("Electron cold interactive total ms")
    ]))
  })

  it("enforces warm ceilings independently from the cold sample", () => {
    const electron = electronReceipt()
    electron.samples[3].runtime.timingsMs.interactiveTotal = 101
    electron.summary = summarizeElectronSamples(electron.samples)
    const result = auditHostDistributionData({
      targetId: "darwin-arm64",
      budget: budget(true),
      native: { ...nativeReceipt(), target: { id: "darwin-arm64" } },
      electron
    })
    expect(result.failures).toEqual([
      expect.stringContaining("Electron warm interactive total maximum ms")
    ])
  })

  it("bounds asynchronous settlement separately from interactive startup", () => {
    const electron = electronReceipt()
    electron.samples[2].runtime.timingsMs.conversationSettlement = 101
    electron.summary = summarizeElectronSamples(electron.samples)
    const result = auditHostDistributionData({
      targetId: "darwin-arm64",
      budget: budget(true),
      native: { ...nativeReceipt(), target: { id: "darwin-arm64" } },
      electron
    })
    expect(result.failures).toEqual([
      expect.stringContaining(
        "Electron warm conversation settlement maximum ms"
      )
    ])
  })

  it("rejects a declared Electron summary that differs from raw samples", () => {
    const electron = electronReceipt()
    electron.summary.cold.timingsMs.interactiveTotal = 49
    const result = auditHostDistributionData({
      targetId: "darwin-arm64",
      budget: budget(true),
      native: { ...nativeReceipt(), target: { id: "darwin-arm64" } },
      electron
    })
    expect(result.failures).toEqual([
      "Electron declared summary does not match raw samples"
    ])
  })

  it("rejects a declared native summary that differs from raw samples", () => {
    const native = nativeReceipt()
    native.summary.total.maximumMs = 49
    const result = auditHostDistributionData({
      targetId: "linux-x64",
      budget: budget(false),
      native
    })
    expect(result.failures).toEqual([
      "native declared summary does not match raw samples"
    ])
  })

  it("rejects a native receipt whose declared or raw sample count is not five", () => {
    const declaredCount = nativeReceipt()
    declaredCount.sampleCount = 4
    expect(auditHostDistributionData({
      targetId: "linux-x64",
      budget: budget(false),
      native: declaredCount
    }).failures).toEqual([
      "native sample count: observed 4, expected 5"
    ])

    const rawCount = nativeReceipt()
    rawCount.samples.pop()
    rawCount.summary = summarizeNativeRuntimeSamples(rawCount.samples)
    expect(auditHostDistributionData({
      targetId: "linux-x64",
      budget: budget(false),
      native: rawCount
    }).failures).toEqual([
      "native raw sample count: observed 4, expected 5"
    ])
  })
})

function budget(electron) {
  return {
    kind: "wanex.host-distribution-budget",
    targets: {
      "linux-x64": { native: nativeBudget() },
      "darwin-arm64": {
        native: nativeBudget(),
        ...(electron ? { electron: electronBudget() } : {})
      }
    }
  }
}

function nativeBudget() {
  return {
    maxExecutableBytes: 100,
    exactFileCount: 2,
    maxColdImportMs: 100,
    maxCreateDisposeMs: 100,
    maxTotalMs: 100,
    maxWallTimeMs: 100
  }
}

function electronBudget() {
  return {
    maxUnpackedBytes: 100,
    maxPackageFileCount: 100,
    maxAsarBytes: 100,
    exactAsarEntryCount: 5,
    maxNativeBytes: 100,
    exactNativeFileCount: 2,
    cold: {
      maxInteractiveTotalMs: 100,
      maxConversationSettlementMs: 100,
      maxProofWallTimeMs: 100
    },
    warm: {
      maxArtifactVerificationMs: 100,
      maxHostStartupMs: 100,
      maxShutdownMs: 100,
      maxInteractiveTotalMs: 100,
      maxConversationSettlementMs: 100,
      maxProofWallTimeMs: 100
    }
  }
}

function nativeReceipt() {
  const samples = Array.from({ length: 5 }, (_, index) => ({
    index,
    temperature: "cold",
    targetId: "linux-x64",
    state: "succeeded",
    assistantText: "complete",
    messageCount: 2,
    wallTimeMs: 50,
    timingsMs: {
      coldImport: 50,
      artifactVerification: 50,
      create: 25,
      turn: 50,
      dispose: 25,
      total: 50
    }
  }))
  return {
    kind: "wanex.native-runtime.proof-receipt",
    ok: true,
    target: { id: "linux-x64" },
    artifact: { bytes: 50, fileCount: 2 },
    sampleCount: 5,
    samples,
    summary: summarizeNativeRuntimeSamples(samples),
    noNodeModulesBesideArtifact: true,
    noOwnedProcessAfterRun: true
  }
}

function electronReceipt() {
  const samples = Array.from({ length: 5 }, (_, index) => ({
    index,
    temperature: index === 0 ? "cold" : "warm",
    wallTimeMs: 50,
    runtime: {
      timingsMs: Object.fromEntries([
        "processToAppReady",
        "artifactVerification",
        "hostStartup",
        "rendererLoad",
        "rendererInteractive",
        "conversationSettlement",
        "rendererPostSettlement",
        "shutdown",
        "interactiveTotal",
        "proofTotal"
      ].map((metric) => [metric, 50]))
    }
  }))
  return {
    kind: "wanex.electron-boundary.proof-receipt",
    ok: true,
    packaged: {
      platform: "darwin",
      arch: "arm64",
      unpackedBytes: 50,
      fileCount: 50,
      asarBytes: 50,
      asarEntryCount: 5,
      nativeBytes: 50,
      nativeFileCount: 2,
      hasApplicationNodeModules: false,
      hasAsarUnpacked: false
    },
    sampleCount: 5,
    samples,
    summary: summarizeElectronSamples(samples),
    noEpermRename: true,
    noOwnedProcessAfterRun: true
  }
}
