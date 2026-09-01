import { describe, expect, it } from "vitest"
import {
  assertDesktopDistributionReceipt,
  createDesktopDistributionReceipt,
  parseArgs
} from "./desktop-distribution-receipt.mjs"

describe("Desktop distribution receipt", () => {
  it("parses target and bounded receipt paths", () => {
    expect(parseArgs([
      "--",
      "--target",
      "darwin-arm64",
      "--electron-receipt",
      "electron.json",
      "--desktop-receipt",
      "desktop.json",
      "--native-receipt",
      "native.json",
      "--output",
      "receipt.json"
    ])).toMatchObject({
      targetId: "darwin-arm64",
      electronReceiptPath: expect.stringMatching(/electron\.json$/),
      desktopReceiptPath: expect.stringMatching(/desktop\.json$/),
      nativeReceiptPath: expect.stringMatching(/native\.json$/),
      outputPath: expect.stringMatching(/receipt\.json$/)
    })
    expect(() => parseArgs(["--unknown"])).toThrow(
      "unknown Desktop distribution argument"
    )
  })

  it("projects only target, artifact, shape, and proof facts", () => {
    const receipt = createDesktopDistributionReceipt({
      targetId: "darwin-arm64",
      electron: electronReceipt(),
      desktop: desktopReceipt(),
      native: nativeReceipt()
    })
    expect(receipt).toEqual({
      kind: "wanex.desktop.distribution-receipt",
      version: 1,
      target: {
        id: "darwin-arm64",
        platform: "darwin",
        arch: "arm64",
        rustTarget: "aarch64-apple-darwin"
      },
      electron: {
        version: "43.2.0",
        target: "darwin-arm64",
        fileName: "electron-v43.2.0-darwin-arm64.zip",
        bytes: 123,
        sha256: "a".repeat(64)
      },
      package: {
        fileCount: 279,
        unpackedBytes: 513935636,
        asarBytes: 2938569,
        asarEntryCount: 3,
        nativeBytes: 8880496,
        nativeFileCount: 2,
        credentialBytes: 491570,
        credentialFileCount: 2,
        hasApplicationNodeModules: false,
        hasAsarUnpacked: false
      },
      native: {
        executableBytes: 8880400,
        fileCount: 2,
        verificationMs: 12.5,
        noNodeModulesBesideArtifact: true,
        noOwnedProcessAfterRun: true
      },
      proof: {
        sampleCount: 5,
        executedFromInstalledCopy: true,
        packageShapeVerified: true,
        noEpermRename: true,
        noOwnedProcessAfterRun: true,
        screenshotsNonBlank: true,
        realDesktopDocument: true
      },
      pathCase: { spaces: true, nonAscii: true }
    })
    const serialized = JSON.stringify(receipt)
    expect(serialized).not.toContain("/private/workspace")
    expect(serialized).not.toContain("https://private.example")
    expect(serialized).not.toContain("secret-token")
    expect(() => assertDesktopDistributionReceipt(receipt, {
      targetId: "darwin-arm64",
      desktop: desktopReceipt(),
      native: nativeReceipt()
    })).not.toThrow()
  })

  it("rejects stale targets, dependency closure, and incomplete proof", () => {
    const base = createDesktopDistributionReceipt({
      targetId: "darwin-arm64",
      electron: electronReceipt(),
      desktop: desktopReceipt(),
      native: nativeReceipt()
    })
    expect(() => assertDesktopDistributionReceipt({
      ...base,
      target: { ...base.target, id: "win32-x64", platform: "win32", arch: "x64" }
    }, { targetId: "darwin-arm64" })).toThrow("differs from expected value")
    expect(() => assertDesktopDistributionReceipt({
      ...base,
      package: { ...base.package, hasApplicationNodeModules: true }
    })).toThrow("node_modules exclusion")
    expect(() => createDesktopDistributionReceipt({
      targetId: "darwin-arm64",
      electron: electronReceipt(),
      desktop: { ...desktopReceipt(), noEpermRename: false },
      native: nativeReceipt()
    })).toThrow("distribution proof requirements")
    expect(() => assertDesktopDistributionReceipt({
      ...base,
      native: { ...base.native, executableBytes: base.package.nativeBytes + 1 }
    })).toThrow("smaller than its proved executable")
  })
})

function electronReceipt() {
  return {
    kind: "wanex.desktop.electron-artifact-receipt",
    version: 1,
    electronVersion: "43.2.0",
    target: "darwin-arm64",
    fileName: "electron-v43.2.0-darwin-arm64.zip",
    bytes: 123,
    sha256: "a".repeat(64),
    path: "/private/workspace/electron.zip"
  }
}

function desktopReceipt() {
  return {
    kind: "wanex.desktop.proof-receipt",
    ok: true,
    pathCase: { spaces: true, nonAscii: true },
    packaged: {
      platform: "darwin",
      arch: "arm64",
      fileCount: 279,
      unpackedBytes: 513935636,
      asarBytes: 2938569,
      asarEntryCount: 3,
      nativeBytes: 8880496,
      nativeFileCount: 2,
      credentialBytes: 491570,
      credentialFileCount: 2,
      hasApplicationNodeModules: false,
      hasAsarUnpacked: false,
      packageDir: "/private/workspace/target/distribution/desktop/packaged"
    },
    installed: {
      externalToWorkspace: true,
      packageFileCount: 279,
      packageBytes: 513935636,
      packageShapeVerified: true,
      executedFromInstalledCopy: true
    },
    sampleCount: 5,
    samples: [],
    summary: {},
    screenshotsNonBlank: true,
    realDesktopDocument: true,
    noEpermRename: true,
    noOwnedProcessAfterRun: true,
    endpoint: "https://private.example/endpoint",
    credential: "secret-token"
  }
}

function nativeReceipt() {
  return {
    kind: "wanex.native-runtime.proof-receipt",
    ok: true,
    host: { platform: "darwin", arch: "arm64" },
    target: {
      id: "darwin-arm64",
      platform: "darwin",
      arch: "arm64",
      rustTarget: "aarch64-apple-darwin"
    },
    artifact: {
      bytes: 8880400,
      fileCount: 2,
      verificationMs: 12.5,
      files: ["runtime-artifacts.json", "darwin-arm64/wanex-system-service"]
    },
    pathCase: { spaces: true, nonAscii: true },
    noNodeModulesBesideArtifact: true,
    noOwnedProcessAfterRun: true
  }
}
