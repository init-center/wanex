import { cp, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  auditTuiDistribution,
  buildTuiDistribution,
  bundleRelativePath,
  distributionRoot,
  stagingDir,
  workspaceRoot
} from "../scripts/distribution.mjs"

const fixtureRoot = join(distributionRoot, "test-fixture")
let receipt

beforeAll(async () => {
  receipt = await buildTuiDistribution()
})

afterAll(async () => {
  await rm(fixtureRoot, { recursive: true, force: true })
})

describe("TUI distribution", () => {
  it("builds one compiled executable package with explicit native boundaries", async () => {
    expect(receipt).toMatchObject({
      kind: "wanex.tui.distribution-receipt",
      name: "@wanex/tui",
      staging: {
        fileCount: expect.any(Number),
        chunkCount: expect.any(Number),
        externalPackages: ["@napi-rs/keyring", "ajv", "ajv-formats"],
        hasSource: false,
        hasTests: false,
        hasWorkspaceLinks: false,
        hasNodeModules: false
      },
      tarball: {
        fileCount: expect.any(Number),
        bytes: expect.any(Number),
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/)
      }
    })
    const manifest = JSON.parse(
      await readFile(join(stagingDir, "package.json"), "utf8")
    )
    expect(manifest).toEqual({
      name: "@wanex/tui",
      version: "0.0.0",
      type: "module",
      license: "UNLICENSED",
      engines: { node: ">=26" },
      bin: { "wanex-tui": `./${bundleRelativePath}` },
      files: ["dist", "README.md", "THIRD_PARTY_NOTICES.md"],
      dependencies: {
        "@napi-rs/keyring": "1.3.0",
        ajv: "8.20.0",
        "ajv-formats": "3.0.1"
      },
      optionalDependencies: {
        "@wanex/system-service-darwin-arm64": "0.0.0",
        "@wanex/system-service-darwin-x64": "0.0.0",
        "@wanex/system-service-linux-x64": "0.0.0",
        "@wanex/system-service-win32-x64": "0.0.0"
      }
    })
    const bundle = await readFile(join(stagingDir, bundleRelativePath), "utf8")
    expect(bundle).toMatch(/^#!\/usr\/bin\/env node\n/)
    expect(bundle).not.toContain(workspaceRoot)
    expect(bundle).not.toContain("@napi-rs/keyring")
    expect(bundle).not.toMatch(/(?:\bfrom\s*|\bimport\s*\(|\brequire\s*\()\s*["']@wanex\//)
  })

  it("fails closed when generated package metadata or files drift", async () => {
    await rm(fixtureRoot, { recursive: true, force: true })
    await cp(stagingDir, fixtureRoot, { recursive: true })
    const manifestPath = join(fixtureRoot, "package.json")
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"))
    manifest.dependencies.tsx = "4.23.1"
    await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`, "utf8")
    await expect(auditTuiDistribution(fixtureRoot)).rejects.toThrow(
      "manifest differs from policy"
    )

    await cp(stagingDir, fixtureRoot, { recursive: true, force: true })
    await writeFile(join(fixtureRoot, "source.ts"), "export {}\n", "utf8")
    await expect(auditTuiDistribution(fixtureRoot)).rejects.toThrow(
      "file closure differs"
    )
  })
})
