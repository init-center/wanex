import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  auditNativeArtifactDirectory,
  nativeTargetId,
  parseStageNativeArtifactArgs,
  stageNativeArtifact
} from "./staging.js"

describe("native artifact staging", () => {
  it("parses the documented pnpm argument separator", () => {
    expect(parseStageNativeArtifactArgs([
      "--",
      "--target",
      "linux-x64",
      "--output-dir",
      "target/custom-native"
    ])).toEqual({
      targetId: "linux-x64",
      outputDir: expect.stringMatching(/target\/custom-native$/)
    })
    expect(() => parseStageNativeArtifactArgs(["--unknown"]))
      .toThrow("unknown native artifact argument")
  })

  it("stages only one verified target and deterministic manifest", async () => {
    const workspaceRoot = await fixtureWorkspace()
    const sourceBin = join(workspaceRoot, "source-bin")
    await writeFile(sourceBin, "native-stage-fixture")
    await chmod(sourceBin, 0o755)

    const first = await stageNativeArtifact({
      workspaceRoot,
      targetId: "darwin-arm64",
      sourceBin,
      releaseVersion: "1.2.3",
      serviceVersion: "4.5.6",
      build: false
    })
    const firstManifest = await readFile(first.manifestPath, "utf8")
    const second = await stageNativeArtifact({
      workspaceRoot,
      targetId: "darwin-arm64",
      sourceBin,
      releaseVersion: "1.2.3",
      serviceVersion: "4.5.6",
      build: false
    })
    expect(await readFile(second.manifestPath, "utf8")).toBe(firstManifest)
    expect(second).toMatchObject({
      targetId: "darwin-arm64",
      rustTarget: "aarch64-apple-darwin",
      bytes: Buffer.byteLength("native-stage-fixture"),
      fileCount: 2
    })
    expect(JSON.parse(firstManifest)).toMatchObject({
      kind: "wanex.runtime-artifacts",
      releaseVersion: "1.2.3",
      serviceVersion: "4.5.6",
      targets: [{
        id: "darwin-arm64",
        systemService: {
          path: "darwin-arm64/wanex-system-service"
        }
      }]
    })
  })

  it("fails audit after staged binary tampering or extra files", async () => {
    const workspaceRoot = await fixtureWorkspace()
    const sourceBin = join(workspaceRoot, "source-bin")
    await writeFile(sourceBin, "original")
    await chmod(sourceBin, 0o755)
    const receipt = await stageNativeArtifact({
      workspaceRoot,
      targetId: "darwin-arm64",
      sourceBin,
      releaseVersion: "1.0.0",
      serviceVersion: "1.0.0",
      build: false
    })
    await writeFile(receipt.executablePath, "tampered")
    await expect(auditNativeArtifactDirectory({
      outputDir: receipt.outputDir,
      targetId: "darwin-arm64"
    })).rejects.toThrow(/size differs|SHA-256 differs/)

    await writeFile(receipt.executablePath, "original")
    await writeFile(join(receipt.outputDir, "unexpected.txt"), "extra")
    await expect(auditNativeArtifactDirectory({
      outputDir: receipt.outputDir,
      targetId: "darwin-arm64"
    })).rejects.toThrow("unexpected files")
  })

  it("rejects unsupported targets and output outside workspace target", async () => {
    const workspaceRoot = await fixtureWorkspace()
    const sourceBin = join(workspaceRoot, "source-bin")
    await writeFile(sourceBin, "fixture")
    await expect(stageNativeArtifact({
      workspaceRoot,
      targetId: "linux-arm64",
      sourceBin,
      releaseVersion: "1.0.0",
      serviceVersion: "1.0.0",
      build: false
    })).rejects.toThrow("unsupported native artifact target")
    await expect(stageNativeArtifact({
      workspaceRoot,
      targetId: "darwin-arm64",
      sourceBin,
      outputDir: join(workspaceRoot, "outside"),
      releaseVersion: "1.0.0",
      serviceVersion: "1.0.0",
      build: false
    })).rejects.toThrow("must be below workspace target")
  })

  it("maps only the frozen native host matrix", () => {
    expect(nativeTargetId("darwin", "arm64")).toBe("darwin-arm64")
    expect(nativeTargetId("darwin", "x64")).toBe("darwin-x64")
    expect(nativeTargetId("win32", "x64")).toBe("win32-x64")
    expect(nativeTargetId("linux", "x64")).toBe("linux-x64")
    expect(() => nativeTargetId("linux", "arm64")).toThrow("unsupported")
  })
})

async function fixtureWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "wanex-native-stage-"))
  await writeFile(join(root, "package.json"), '{"version":"0.0.0"}\n')
  return root
}
