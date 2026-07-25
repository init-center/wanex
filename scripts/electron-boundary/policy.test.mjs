import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createPackage } from "@electron/asar"
import {
  auditElectronStaging,
  auditPackagedElectronBoundary,
  boundaryRoot,
  buildElectronBoundary,
  normalizeAsarEntry,
  stagingDir
} from "./build.mjs"
import {
  assertCanonicalProofArgs,
  measureElectronBoundarySample
} from "./proof.mjs"
import { summarizeElectronSamples } from "./metrics.mjs"

const tempDirs = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(async (dir) =>
    await rm(dir, { recursive: true, force: true })
  ))
})

describe("private Electron production boundary", () => {
  it("builds one dependency-free application bundle", async () => {
    await expect(buildElectronBoundary()).resolves.toEqual({
      kind: "wanex.electron-boundary.staging-receipt",
      fileCount: 5,
      bytes: expect.any(Number),
      hasNodeModules: false
    })
    const manifest = JSON.parse(await readFile(join(stagingDir, "package.json"), "utf8"))
    expect(manifest.author).toBe("Wanex Project")
    expect(manifest).not.toHaveProperty("dependencies")
    expect(await readFile(join(stagingDir, "main.cjs"), "utf8"))
      .not.toMatch(/(?:\bfrom\s*|\bimport\s*\()\s*["']@wanex\//)
  })

  it("freezes the BrowserWindow, IPC, navigation, and preload policy", async () => {
    const main = await readFile(join(boundaryRoot, "main.ts"), "utf8")
    const preload = await readFile(join(boundaryRoot, "preload.ts"), "utf8")
    expect(main).toContain("contextIsolation: true")
    expect(main).toContain("nodeIntegration: false")
    expect(main).toContain("sandbox: true")
    expect(main).toContain('action: "deny"')
    expect(main).toContain('on("will-navigate"')
    expect(main).toContain("setPermissionRequestHandler")
    expect(main).toContain("setPermissionCheckHandler")
    expect(main.match(/ipcMain\.handle\(/g)).toHaveLength(1)
    expect(preload.match(/exposeInMainWorld\(/g)).toHaveLength(1)
    expect(preload).toContain('"wanexDesktop"')
    expect(preload).not.toMatch(/ipcRenderer\.(?:send|on|once|postMessage)/)
    expect(preload).not.toMatch(/node:(?:fs|child_process|process|os)/)
  })

  it("separates renderer interactivity from bounded conversation settlement", async () => {
    const renderer = await readFile(join(boundaryRoot, "renderer.ts"), "utf8")
    expect(renderer).toContain("options: { pollAfterAction: false }")
    expect(renderer).toContain(
      "CONVERSATION_REFRESH_INITIAL_INTERVAL_MS = 100"
    )
    expect(renderer).toContain(
      "CONVERSATION_REFRESH_MAX_INTERVAL_MS = 500"
    )
    expect(renderer).toContain("conversationSettlement:")
    expect(renderer).not.toContain("rendererRoundTrip")
    expect(renderer).not.toContain("setInterval(")
  })

  it("rejects staging dependencies and unexpected files", async () => {
    await buildElectronBoundary()
    const root = await copyToTemp(stagingDir, "wanex-electron-stage-policy-")
    const manifestPath = join(root, "package.json")
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"))
    manifest.dependencies = { bad: "1.0.0" }
    await writeFile(manifestPath, JSON.stringify(manifest), "utf8")
    await expect(auditElectronStaging(root)).rejects.toThrow("must not declare dependencies")
    delete manifest.dependencies
    await writeFile(manifestPath, JSON.stringify(manifest), "utf8")
    await writeFile(join(root, "extra.js"), "export {}\n", "utf8")
    await expect(auditElectronStaging(root)).rejects.toThrow("unexpected files")
  })

  it("audits one ASAR and byte-identical external native resources", async () => {
    await buildElectronBoundary()
    const root = await mkdtemp(join(tmpdir(), "wanex-electron-package-policy-"))
    tempDirs.push(root)
    const stagedNativeDir = await createNativeFixture()
    const resources = process.platform === "darwin"
      ? join(root, "Wanex Boundary.app/Contents/Resources")
      : join(root, "resources")
    await mkdir(resources, { recursive: true })
    await createPackage(stagingDir, join(resources, "app.asar"))
    await cp(stagedNativeDir, join(resources, "native"), { recursive: true })
    await expect(auditPackagedElectronBoundary({
      packageDir: root,
      stagedNativeDir
    })).resolves.toMatchObject({
      hasApplicationNodeModules: false,
      hasAsarUnpacked: false,
      asarEntryCount: 5,
      nativeFileCount: 2
    })
    await writeFile(join(resources, "native", "runtime-artifacts.json"), "{}", "utf8")
    await expect(auditPackagedElectronBoundary({
      packageDir: root,
      stagedNativeDir
    })).rejects.toThrow(
      "native resource differs"
    )
  }, 15_000)

  it("normalizes platform-specific ASAR entry separators before auditing", () => {
    expect(normalizeAsarEntry("/main.cjs")).toBe("/main.cjs")
    expect(normalizeAsarEntry("\\main.cjs")).toBe("/main.cjs")
    expect(normalizeAsarEntry("renderer.js")).toBe("/renderer.js")
    expect(normalizeAsarEntry("../unexpected.js")).toBe("/../unexpected.js")
  })

  it("freezes one cold and four warm Electron samples", () => {
    expect(assertCanonicalProofArgs([])).toBeUndefined()
    expect(assertCanonicalProofArgs(["--"])).toBeUndefined()
    expect(() => assertCanonicalProofArgs(["--samples", "5"]))
      .toThrow("unknown Electron proof argument")
    expect(summarizeElectronSamples([
      sample(0, "cold", 50, 500),
      sample(1, "warm", 10, 100),
      sample(2, "warm", 20, 200),
      sample(3, "warm", 30, 300),
      sample(4, "warm", 40, 400)
    ])).toMatchObject({
      cold: {
        sampleCount: 1,
        timingsMs: {
          artifactVerification: 50,
          wallTime: 500
        }
      },
      warm: {
        sampleCount: 4,
        metrics: {
          artifactVerification: {
            medianMs: 25,
            maximumMs: 40,
            samplesMs: [10, 20, 30, 40]
          },
          wallTime: {
            medianMs: 250,
            maximumMs: 400,
            samplesMs: [100, 200, 300, 400]
          }
        }
      }
    })
    expect(() => summarizeElectronSamples([
      sample(0, "cold", 10, 100)
    ])).toThrow("requires exactly 5 samples")
    expect(() => summarizeElectronSamples([
      sample(0, "cold", 10, 100),
      sample(1, "warm", 10, 100),
      sample(2, "cold", 10, 100),
      sample(3, "warm", 10, 100),
      sample(4, "warm", 10, 100)
    ])).toThrow("sample 2 must be warm")
  })

  it("excludes process inspection from Electron wall time", async () => {
    let now = 0
    let audited = false
    await expect(measureElectronBoundarySample(
      async () => {
        now = 25
        return { stdout: "", stderr: "" }
      },
      async () => {
        audited = true
        now = 250
      },
      () => now
    )).resolves.toEqual({
      output: { stdout: "", stderr: "" },
      wallTimeMs: 25
    })
    expect(audited).toBe(true)
  })

  it("keeps Electron process inspection mandatory on success and failure", async () => {
    await expect(measureElectronBoundarySample(
      async () => ({ stdout: "", stderr: "" }),
      async () => {
        throw new Error("process inspection failed")
      }
    )).rejects.toThrow("process inspection failed")

    let auditedAfterRunFailure = false
    await expect(measureElectronBoundarySample(
      async () => {
        throw new Error("Electron failed")
      },
      async () => {
        auditedAfterRunFailure = true
      }
    )).rejects.toThrow("Electron failed")
    expect(auditedAfterRunFailure).toBe(true)
  })

  it("freezes the native full-verification and distribution matrix", async () => {
    const workflow = await readFile(join(
      boundaryRoot,
      "../../.github/workflows/native-electron-boundary.yml"
    ), "utf8")
    expect(workflow).toContain("pull_request:\n")
    expect(workflow).toContain("push:\n    branches: [main]")
    expect(workflow).not.toContain("paths:")
    expect(workflow).toContain(
      "concurrency:\n" +
      "  group: cross-platform-release-${{ github.workflow }}-${{ github.ref }}\n" +
      "  cancel-in-progress: true"
    )
    expect(workflow).toContain("needs: verify")
    expect(workflow).toContain("os: ubuntu-24.04\n            target: linux-x64")
    expect(workflow).toContain("os: macos-15")
    expect(workflow).toContain("os: macos-15-intel\n            target: darwin-x64")
    expect(workflow).toContain("os: windows-2025\n            target: win32-x64")
    expect(workflow.match(/run: pnpm verify/g)).toHaveLength(1)
    expect(workflow).toContain(
      "pnpm stage:native -- --target ${{ matrix.target }}"
    )
    expect(workflow).toContain("pnpm proof:native-runtime")
    expect(workflow).not.toContain("pnpm proof:native-runtime -- --samples")
    expect(workflow).toContain("pnpm proof:electron-boundary")
    expect(workflow).not.toContain(
      "pnpm proof:electron-boundary -- --samples"
    )
    expect(workflow).toContain(
      "pnpm audit:host-distribution -- --target ${{ matrix.target }}"
    )
    expect(workflow).toContain("if: always()")
    expect(workflow).toContain(
      "actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0"
    )
    expect(workflow).toContain(
      "pnpm/action-setup@008330803749db0355799c700092d9a85fd074e9"
    )
    expect(workflow).toContain(
      "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020"
    )
    expect(workflow).toContain(
      "dtolnay/rust-toolchain@4cda84d5c5c54efe2404f9d843567869ab1699d4"
    )
    expect(workflow).toContain(
      "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a"
    )
    const actionRefs = [...workflow.matchAll(/uses: [^@\s]+@([^\s]+)/g)]
      .map((match) => match[1])
    expect(actionRefs).not.toHaveLength(0)
    expect(actionRefs.every((reference) => /^[0-9a-f]{40}$/.test(reference)))
      .toBe(true)
  })
})

function sample(index, temperature, artifactVerification, wallTimeMs) {
  return {
    index,
    temperature,
    wallTimeMs,
    runtime: {
      timingsMs: {
        processToAppReady: artifactVerification,
        artifactVerification,
        hostStartup: artifactVerification,
        rendererLoad: artifactVerification,
        rendererInteractive: artifactVerification,
        conversationSettlement: artifactVerification,
        rendererPostSettlement: artifactVerification,
        shutdown: artifactVerification,
        interactiveTotal: artifactVerification,
        proofTotal: artifactVerification
      }
    }
  }
}

async function copyToTemp(source, prefix) {
  const root = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(root)
  await rm(root, { recursive: true, force: true })
  await cp(source, root, { recursive: true })
  return root
}

async function createNativeFixture() {
  const root = await mkdtemp(join(tmpdir(), "wanex-native-package-policy-"))
  tempDirs.push(root)
  const executableDir = join(root, "fixture-target")
  await mkdir(executableDir, { recursive: true })
  await Promise.all([
    writeFile(join(root, "runtime-artifacts.json"), '{"kind":"fixture"}\n', "utf8"),
    writeFile(join(executableDir, "wanex-system-service"), "fixture-native", "utf8")
  ])
  return root
}
