import { describe, expect, it } from "vitest"
import {
  auditHostDistributionData,
  parseHostDistributionAuditArgs
} from "./audit-host-distribution.mjs"
import {
  summarizeProductDesktopSamples
} from "../apps/desktop/scripts/metrics.mjs"
import { summarizeNativeRuntimeSamples } from "./native-runtime-metrics.mjs"

describe("host distribution budget", () => {
  it("parses only explicit audit paths and target", () => {
    expect(parseHostDistributionAuditArgs([
      "--",
      "--target",
      "linux-x64",
      "--budget",
      "budget.json",
      "--tui-receipt",
      "tui.json"
    ])).toMatchObject({
      targetId: "linux-x64",
      budgetPath: expect.stringMatching(/budget\.json$/),
      tuiReceiptPath: expect.stringMatching(/tui\.json$/)
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

  it("accepts an installed TUI receipt within its target contract", () => {
    expect(auditHostDistributionData({
      targetId: "linux-x64",
      budget: budgetWithTui(),
      native: nativeReceipt(),
      tui: tuiReceipt()
    })).toMatchObject({
      ok: true,
      targetId: "linux-x64",
      failures: [],
      observed: {
        tui: {
          ptyMode: "pty",
          terminalRestored: true
        }
      }
    })
  })

  it("reports TUI closure and authorization violations", () => {
    const tui = tuiReceipt()
    tui.distribution.staging.bytes = 101
    tui.line.providerAuthorized = false
    const result = auditHostDistributionData({
      targetId: "linux-x64",
      budget: budgetWithTui(),
      native: nativeReceipt(),
      tui
    })
    expect(result.ok).toBe(false)
    expect(result.failures).toEqual(expect.arrayContaining([
      expect.stringContaining("TUI staging bytes"),
      expect.stringContaining("TUI installed line provider authorization")
    ]))
  })

  it("reports every native and Product Desktop ceiling violation", () => {
    const native = nativeReceipt()
    native.artifact.bytes = 101
    native.samples.forEach((sample) => {
      sample.timingsMs.total = 101
    })
    native.summary = summarizeNativeRuntimeSamples(native.samples)
    const desktop = desktopReceipt()
    desktop.packaged.unpackedBytes = 101
    desktop.packaged.hasApplicationNodeModules = true
    desktop.samples[0].runtime.timingsMs.interactiveTotal = 101
    desktop.summary = summarizeProductDesktopSamples(desktop.samples)
    const result = auditHostDistributionData({
      targetId: "darwin-arm64",
      budget: budget(true),
      native: { ...native, target: { id: "darwin-arm64" } },
      desktop
    })
    expect(result.ok).toBe(false)
    expect(result.failures).toEqual(expect.arrayContaining([
      expect.stringContaining("native executable bytes"),
      expect.stringContaining("native total median ms"),
      expect.stringContaining("Product Desktop unpacked bytes"),
      expect.stringContaining("Product Desktop node_modules exclusion"),
      expect.stringContaining("Product Desktop cold interactive total ms")
    ]))
  })

  it("requires exact packaged Schedule lifecycle evidence", () => {
    const desktop = desktopReceipt()
    desktop.schedule.createProviderRequestCount = 2
    desktop.schedule.sameProfileRestored = false
    const result = auditHostDistributionData({
      targetId: "darwin-arm64",
      budget: budget(true),
      native: { ...nativeReceipt(), target: { id: "darwin-arm64" } },
      desktop
    })
    expect(result.ok).toBe(false)
    expect(result.failures).toEqual(expect.arrayContaining([
      expect.stringContaining("Schedule create Provider request count"),
      expect.stringContaining("Schedule same-profile restore")
    ]))
  })

  it("enforces warm median ceilings independently from the cold sample", () => {
    const desktop = desktopReceipt()
    desktop.samples.slice(1, 4).forEach((sample) => {
      sample.runtime.timingsMs.interactiveTotal = 101
    })
    desktop.summary = summarizeProductDesktopSamples(desktop.samples)
    const result = auditHostDistributionData({
      targetId: "darwin-arm64",
      budget: budget(true),
      native: { ...nativeReceipt(), target: { id: "darwin-arm64" } },
      desktop
    })
    expect(result.failures).toEqual([
      expect.stringContaining("Product Desktop warm interactive total median ms")
    ])
  })

  it("retains a hard warm ceiling for one pathological sample", () => {
    const desktop = desktopReceipt()
    desktop.samples[3].runtime.timingsMs.interactiveTotal = 201
    desktop.summary = summarizeProductDesktopSamples(desktop.samples)
    const result = auditHostDistributionData({
      targetId: "darwin-arm64",
      budget: budget(true),
      native: { ...nativeReceipt(), target: { id: "darwin-arm64" } },
      desktop
    })
    expect(result.failures).toEqual([
      expect.stringContaining(
        "Product Desktop warm interactive total hard maximum ms"
      )
    ])
  })

  it("bounds asynchronous settlement separately from interactive startup", () => {
    const desktop = desktopReceipt()
    desktop.samples[2].runtime.timingsMs.conversationSettlement = 101
    desktop.summary = summarizeProductDesktopSamples(desktop.samples)
    const result = auditHostDistributionData({
      targetId: "darwin-arm64",
      budget: budget(true),
      native: { ...nativeReceipt(), target: { id: "darwin-arm64" } },
      desktop
    })
    expect(result.failures).toEqual([
      expect.stringContaining(
        "Product Desktop warm conversation settlement maximum ms"
      )
    ])
  })

  it("rejects a declared Product Desktop summary that differs from raw samples", () => {
    const desktop = desktopReceipt()
    desktop.summary.cold.timingsMs.interactiveTotal = 49
    const result = auditHostDistributionData({
      targetId: "darwin-arm64",
      budget: budget(true),
      native: { ...nativeReceipt(), target: { id: "darwin-arm64" } },
      desktop
    })
    expect(result.failures).toEqual([
      "Product Desktop declared summary does not match raw samples"
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

  it("retains a hard native ceiling for one pathological sample", () => {
    const native = nativeReceipt()
    native.samples[2].timingsMs.total = 201
    native.summary = summarizeNativeRuntimeSamples(native.samples)
    expect(auditHostDistributionData({
      targetId: "linux-x64",
      budget: budget(false),
      native
    }).failures).toEqual([
      expect.stringContaining("native total hard maximum ms")
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

function budget(desktop) {
  return {
    kind: "wanex.host-distribution-budget",
    targets: {
      "linux-x64": { native: nativeBudget() },
      "darwin-arm64": {
        native: nativeBudget(),
        ...(desktop ? { desktop: desktopBudget() } : {})
      }
    }
  }
}

function budgetWithTui() {
  const result = budget(false)
  result.targets["linux-x64"].tui = {
    maxStagingBytes: 100,
    maxStagingFileCount: 10,
    maxTarballBytes: 100,
    maxTarballFileCount: 10,
    ptyMode: "required"
  }
  return result
}

function nativeBudget() {
  return {
    maxExecutableBytes: 100,
    exactFileCount: 2,
    maxColdImportMedianMs: 100,
    maxColdImportHardMs: 200,
    maxCreateDisposeMedianMs: 100,
    maxCreateDisposeHardMs: 200,
    maxTotalMedianMs: 100,
    maxTotalHardMs: 200,
    maxWallTimeMedianMs: 100,
    maxWallTimeHardMs: 200
  }
}

function desktopBudget() {
  return {
    maxUnpackedBytes: 100,
    maxPackageFileCount: 100,
    maxAsarBytes: 100,
    exactAsarEntryCount: 2,
    maxNativeBytes: 100,
    exactNativeFileCount: 2,
    maxCredentialBytes: 100,
    exactCredentialFileCount: 2,
    cold: {
      maxInteractiveTotalMs: 100,
      maxConversationSettlementMs: 100,
      maxProofWallTimeMs: 100
    },
    warm: {
      maxArtifactVerificationMs: 100,
      maxHostStartupMedianMs: 100,
      maxHostStartupHardMs: 200,
      maxShutdownMs: 100,
      maxInteractiveTotalMedianMs: 100,
      maxInteractiveTotalHardMs: 200,
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

function desktopReceipt() {
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
    kind: "wanex.product-desktop.proof-receipt",
    ok: true,
    packaged: {
      platform: "darwin",
      arch: "arm64",
      unpackedBytes: 50,
      fileCount: 50,
      asarBytes: 50,
      asarEntryCount: 2,
      nativeBytes: 50,
      nativeFileCount: 2,
      credentialBytes: 50,
      credentialFileCount: 2,
      hasApplicationNodeModules: false,
      hasAsarUnpacked: false
    },
    sampleCount: 5,
    samples,
    summary: summarizeProductDesktopSamples(samples),
    realProductDocument: true,
    screenshotsNonBlank: true,
    noEpermRename: true,
    noOwnedProcessAfterRun: true,
    schedule: {
      intervalSeconds: 5,
      heldForMs: 12_000,
      crossedDeadlineCount: 2,
      createProviderRequestCount: 1,
      restoreProviderRequestCount: 1,
      nonOverlapVerified: true,
      disabledQuietWindowVerified: true,
      sameProfileRestored: true,
      removed: true
    }
  }
}

function tuiReceipt() {
  return {
    kind: "wanex.tui.installed-proof-receipt",
    ok: true,
    distribution: {
      staging: {
        bytes: 50,
        fileCount: 10,
        hasSource: false,
        hasTests: false,
        hasWorkspaceLinks: false,
        hasNodeModules: false
      },
      tarball: {
        bytes: 50,
        fileCount: 10
      }
    },
    host: { platform: "linux", arch: "x64" },
    installed: {
      projectDirOutsideWorkspace: true,
      packageLockChecked: true
    },
    line: {
      mode: "line",
      providerAuthorized: true
    },
    pty: {
      mode: "pty",
      terminalRestored: true
    },
    registryRequests: 3,
    nativeTarget: "linux-x64"
  }
}
