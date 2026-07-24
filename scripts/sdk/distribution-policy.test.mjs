import { describe, expect, it } from "vitest"
import {
  artifactBareImportIsExternal,
  createStagingManifest,
  isBareImport,
  loadSdkDistributionPolicy,
  readExportEntries
} from "./distribution-policy.mjs"

describe("SDK distribution policy", () => {
  it("freezes ten public packages and all current public entries", async () => {
    const policy = await loadSdkDistributionPolicy()
    expect(policy.packages).toHaveLength(10)
    expect(policy.packages.reduce(
      (total, packageInfo) => total + packageInfo.entries.length,
      0
    )).toBe(47)
    expect(policy.internalBundledPackages).toEqual(["@wanex/protocol"])
  })

  it("projects compiled conditional exports and exact dependencies", async () => {
    const policy = await loadSdkDistributionPolicy()
    const runtime = policy.packages.find((item) => item.name === "@wanex/runtime")
    expect(runtime).toBeDefined()
    const manifest = createStagingManifest(runtime)
    expect(manifest).toMatchObject({
      name: "@wanex/runtime",
      version: "0.0.0",
      type: "module",
      license: "UNLICENSED",
      types: "./dist/index.d.ts",
      exports: {
        ".": {
          types: "./dist/index.d.ts",
          import: "./dist/index.js",
          default: "./dist/index.js"
        },
        "./execution": {
          types: "./dist/execution.d.ts",
          import: "./dist/execution.js",
          default: "./dist/execution.js"
        }
      },
      dependencies: {
        "@wanex/storage": "0.0.0",
        ajv: "8.20.0",
        yaml: "2.9.0"
      }
    })
    expect(manifest).not.toHaveProperty("private")
    expect(manifest.dependencies).not.toHaveProperty("@wanex/protocol")

    const independentlyVersioned = createStagingManifest({
      ...runtime,
      versionByPackage: {
        ...runtime.versionByPackage,
        "@wanex/storage": "2.4.0"
      }
    })
    expect(independentlyVersioned.dependencies["@wanex/storage"]).toBe("2.4.0")
  })

  it("maps nested subpaths without flattening their public identity", () => {
    expect(readExportEntries({
      name: "@wanex/example",
      exports: {
        ".": "./src/index.ts",
        "./delegation/graph": "./src/delegation/graph/index.ts"
      }
    })).toEqual([
      {
        exportPath: ".",
        sourceTarget: "./src/index.ts",
        artifactPath: "index"
      },
      {
        exportPath: "./delegation/graph",
        sourceTarget: "./src/delegation/graph/index.ts",
        artifactPath: "delegation/graph"
      }
    ])
  })

  it("does not externalize absolute module identifiers from either path dialect", () => {
    const policy = { internalBundledPackages: ["@wanex/protocol"] }
    const internalIds = [
      "/workspace/wanex/packages/protocol/src/index.ts",
      String.raw`D:\a\wanex\wanex\packages\protocol\src\index.ts`,
      String.raw`\\server\share\wanex\packages\protocol\src\index.ts`
    ]

    for (const id of internalIds) {
      expect(isBareImport(id)).toBe(false)
      expect(artifactBareImportIsExternal(id, policy)).toBe(false)
    }
    expect(artifactBareImportIsExternal("@wanex/storage", policy)).toBe(true)
    expect(artifactBareImportIsExternal("@wanex/protocol", policy)).toBe(false)
  })
})
