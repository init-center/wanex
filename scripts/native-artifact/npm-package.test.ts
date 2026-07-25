import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  createNativeNpmPackage,
  parseNativeNpmPackageArgs
} from "./npm-package.js"
import {
  nativeTargetId,
  stageNativeArtifact
} from "./staging.js"
import {
  loadSdkDistributionPolicy,
  nativePackageForTarget
} from "../sdk/distribution-policy.mjs"

const tempDirs: string[] = []

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir !== undefined) await rm(dir, { recursive: true, force: true })
  }
})

describe("native npm package generation", () => {
  it("parses only the frozen command arguments", () => {
    expect(parseNativeNpmPackageArgs([
      "--",
      "--target",
      "darwin-arm64",
      "--artifact-dir",
      "target/native",
      "--output-dir",
      "target/package"
    ])).toEqual({
      targetId: "darwin-arm64",
      artifactDir: resolve("target/native"),
      outputDir: resolve("target/package")
    })
    expect(() => parseNativeNpmPackageArgs(["--legacy"]))
      .toThrow("unknown native npm package argument")
  })

  it("packs one target-restricted dependency-free native artifact", async () => {
    const targetId = nativeTargetId()
    const policy = await loadSdkDistributionPolicy()
    const nativePackage = nativePackageForTarget(policy, targetId)
    const executableName = nativePackage.platform === "win32"
      ? "wanex-system-service.exe"
      : "wanex-system-service"
    const executablePath = `${targetId}/${executableName}`
    const workspaceRoot = await fixtureWorkspace()
    const artifactDir = join(workspaceRoot, "target/native")
    const sourceBin = join(workspaceRoot, "source-bin")
    await writeFile(sourceBin, "native-package-fixture")
    await chmod(sourceBin, 0o755)
    await stageNativeArtifact({
      workspaceRoot,
      targetId,
      outputDir: artifactDir,
      sourceBin,
      releaseVersion: "1.2.3",
      serviceVersion: "4.5.6",
      build: false
    })

    const first = await createNativeNpmPackage({
      workspaceRoot,
      targetId,
      artifactDir
    })
    const firstHash = first.sha256
    const second = await createNativeNpmPackage({
      workspaceRoot,
      targetId,
      artifactDir
    })

    expect(second).toMatchObject({
      name: nativePackage.name,
      version: "1.2.3",
      targetId,
      platform: nativePackage.platform,
      arch: nativePackage.arch,
      rustTarget: nativePackage.rustTarget,
      executableBytes: Buffer.byteLength("native-package-fixture"),
      executableSha256: expect.stringMatching(/^[a-f0-9]{64}$/)
    })
    expect(second.sha256).toBe(firstHash)
    expect(second.files.map((file) => file.path)).toEqual([
      executablePath,
      "package.json",
      "runtime-artifacts.json"
    ].sort())
    expect(await stat(second.tarballPath)).toMatchObject({ size: second.bytes })
    const report = JSON.parse(
      await readFile(join(second.outputDir, "report.json"), "utf8")
    )
    expect(report.outputDir).toBe(`target/sdk/native/${targetId}`)
    expect(report.stagingDir).toBe(
      `target/sdk/native/${targetId}/staging`
    )
    expect(report.tarballPath).toBe(
      `target/sdk/native/${targetId}/tarballs/${second.filename}`
    )
    const manifest = JSON.parse(
      await readFile(join(second.stagingDir, "package.json"), "utf8")
    )
    expect(manifest).toEqual({
      name: nativePackage.name,
      version: "1.2.3",
      license: "UNLICENSED",
      os: [nativePackage.platform],
      cpu: [nativePackage.arch],
      files: [
        "runtime-artifacts.json",
        executablePath
      ],
      exports: {
        "./runtime-artifacts.json": "./runtime-artifacts.json"
      }
    })
    expect(manifest).not.toHaveProperty("scripts")
    expect(manifest).not.toHaveProperty("dependencies")
    expect(manifest).not.toHaveProperty("optionalDependencies")
    expect(manifest).not.toHaveProperty("bin")
  })

  it("rejects target drift and output outside target", async () => {
    const targetId = nativeTargetId()
    const otherTargetId = [
      "darwin-arm64",
      "darwin-x64",
      "linux-x64",
      "win32-x64"
    ].find((candidate) => candidate !== targetId)!
    const workspaceRoot = await fixtureWorkspace()
    const artifactDir = join(workspaceRoot, "target/native")
    const sourceBin = join(workspaceRoot, "source-bin")
    await writeFile(sourceBin, "native-package-fixture")
    await chmod(sourceBin, 0o755)
    await stageNativeArtifact({
      workspaceRoot,
      targetId: otherTargetId,
      outputDir: artifactDir,
      sourceBin,
      releaseVersion: "1.2.3",
      serviceVersion: "4.5.6",
      build: false
    })

    await expect(createNativeNpmPackage({
      workspaceRoot,
      targetId,
      artifactDir
    })).rejects.toThrow("selected target")

    await stageNativeArtifact({
      workspaceRoot,
      targetId,
      outputDir: artifactDir,
      sourceBin,
      releaseVersion: "1.2.3",
      serviceVersion: "4.5.6",
      build: false
    })
    await expect(createNativeNpmPackage({
      workspaceRoot,
      targetId,
      artifactDir,
      outputDir: join(workspaceRoot, "outside")
    })).rejects.toThrow("below workspace target")
  })

  it("rejects package generation on a different host tuple", async () => {
    const targetId = nativeTargetId()
    const otherTargetId = [
      "darwin-arm64",
      "darwin-x64",
      "linux-x64",
      "win32-x64"
    ].find((candidate) => candidate !== targetId)!
    const workspaceRoot = await fixtureWorkspace()

    await expect(createNativeNpmPackage({
      workspaceRoot,
      targetId: otherTargetId
    })).rejects.toThrow(
      `selected=${otherTargetId} host=${targetId}`
    )
  })
})

async function fixtureWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "wanex-native-npm-"))
  tempDirs.push(root)
  await writeFile(join(root, "package.json"), '{"version":"0.0.0"}\n')
  return root
}
