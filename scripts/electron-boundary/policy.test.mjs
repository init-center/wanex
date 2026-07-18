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
  nativeArtifactDir,
  stagingDir
} from "./build.mjs"
import {
  parseProofArgs,
  summarizeSamples
} from "./proof.mjs"

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
    const resources = process.platform === "darwin"
      ? join(root, "Wanex Boundary.app/Contents/Resources")
      : join(root, "resources")
    await mkdir(resources, { recursive: true })
    await createPackage(stagingDir, join(resources, "app.asar"))
    await cp(nativeArtifactDir, join(resources, "native"), { recursive: true })
    await expect(auditPackagedElectronBoundary(root)).resolves.toMatchObject({
      hasApplicationNodeModules: false,
      hasAsarUnpacked: false,
      asarEntryCount: 5,
      nativeFileCount: 2
    })
    await writeFile(join(resources, "native", "runtime-artifacts.json"), "{}", "utf8")
    await expect(auditPackagedElectronBoundary(root)).rejects.toThrow(
      "native resource differs"
    )
  }, 15_000)

  it("freezes native sample parsing and percentile reporting", () => {
    expect(parseProofArgs([])).toEqual({ samples: 1 })
    expect(parseProofArgs(["--", "--samples", "5"])).toEqual({ samples: 5 })
    expect(() => parseProofArgs(["--samples", "0"])).toThrow("positive integer")
    expect(summarizeSamples([
      sample(10, 100),
      sample(20, 200),
      sample(30, 300)
    ])).toMatchObject({
      artifactVerification: {
        medianMs: 20,
        p95Ms: 30,
        samplesMs: [10, 20, 30]
      },
      wallTime: {
        medianMs: 200,
        p95Ms: 300,
        samplesMs: [100, 200, 300]
      }
    })
  })

  it("keeps native macOS and Windows execution in the release matrix", async () => {
    const workflow = await readFile(join(
      boundaryRoot,
      "../../.github/workflows/native-electron-boundary.yml"
    ), "utf8")
    expect(workflow).toContain("os: macos-15")
    expect(workflow).toContain("os: windows-latest")
    expect(workflow).toContain("pnpm proof:electron-boundary -- --samples 5")
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
      "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0"
    )
  })
})

function sample(artifactVerification, wallTimeMs) {
  return {
    wallTimeMs,
    runtime: {
      timingsMs: {
        processToAppReady: artifactVerification,
        artifactVerification,
        hostStartup: artifactVerification,
        rendererLoad: artifactVerification,
        rendererRoundTrip: artifactVerification,
        shutdown: artifactVerification,
        total: artifactVerification
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
