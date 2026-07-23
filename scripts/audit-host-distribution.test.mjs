import { describe, expect, it } from "vitest"
import {
  auditHostDistributionData,
  parseHostDistributionAuditArgs
} from "./audit-host-distribution.mjs"

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
    native.summary.total.p95Ms = 101
    const electron = electronReceipt()
    electron.packaged.unpackedBytes = 101
    electron.packaged.hasApplicationNodeModules = true
    const result = auditHostDistributionData({
      targetId: "darwin-arm64",
      budget: budget(true),
      native: { ...native, target: { id: "darwin-arm64" } },
      electron
    })
    expect(result.ok).toBe(false)
    expect(result.failures).toEqual(expect.arrayContaining([
      expect.stringContaining("native executable bytes"),
      expect.stringContaining("native total p95 ms"),
      expect.stringContaining("Electron unpacked bytes"),
      expect.stringContaining("Electron node_modules exclusion")
    ]))
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
    maxColdImportP95Ms: 100,
    maxCreateDisposeP95Ms: 100,
    maxTotalP95Ms: 100,
    maxWallTimeP95Ms: 100
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
    maxArtifactVerificationP95Ms: 100,
    maxHostStartupP95Ms: 100,
    maxShutdownP95Ms: 100,
    maxTotalP95Ms: 100,
    maxWallTimeP95Ms: 100
  }
}

function nativeReceipt() {
  return {
    kind: "wanex.native-runtime.proof-receipt",
    ok: true,
    target: { id: "linux-x64" },
    artifact: { bytes: 50, fileCount: 2 },
    summary: Object.fromEntries([
      "coldImport",
      "createDispose",
      "total",
      "wallTime"
    ].map((metric) => [metric, { p95Ms: 50 }])),
    noNodeModulesBesideArtifact: true,
    noOwnedProcessAfterRun: true
  }
}

function electronReceipt() {
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
    summary: Object.fromEntries([
      "artifactVerification",
      "hostStartup",
      "shutdown",
      "total",
      "wallTime"
    ].map((metric) => [metric, { p95Ms: 50 }]))
  }
}
