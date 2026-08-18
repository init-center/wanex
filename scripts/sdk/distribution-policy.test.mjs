import { describe, expect, it } from "vitest"
import {
  artifactBareImportIsExternal,
  createStagingManifest,
  isBareImport,
  loadSdkDistributionPolicy,
  readExportEntries
} from "./distribution-policy.mjs"

describe("SDK distribution policy", () => {
  it("freezes the four-package first-RC surface and source previews", async () => {
    const policy = await loadSdkDistributionPolicy()
    expect(policy.packages.map((item) => item.name)).toEqual([
      "@wanex/app",
      "@wanex/extension",
      "@wanex/runtime",
      "@wanex/storage"
    ])
    expect(policy.packages.reduce(
      (total, packageInfo) => total + packageInfo.entries.length,
      0
    )).toBe(30)
    expect(
      policy.packages
        .find((item) => item.name === "@wanex/app")
        ?.entries.map((entry) => entry.exportPath)
    ).toContain("./provider-mutation")
    expect(
      policy.packages
        .find((item) => item.name === "@wanex/runtime")
        ?.entries.map((entry) => entry.exportPath)
    ).toContain("./media-generation/openai-images")
    expect(policy.sourcePreviewPackages).toEqual([
      "@wanex/connector",
      "@wanex/mcp",
      "@wanex/plugin",
      "@wanex/storage-control-plane",
      "@wanex/team",
      "@wanex/workspace"
    ])
    expect(policy.internalBundledPackages).toEqual(["@wanex/protocol"])
    expect(policy.nativePackages).toEqual([
      {
        targetId: "darwin-arm64",
        name: "@wanex/system-service-darwin-arm64",
        platform: "darwin",
        arch: "arm64",
        rustTarget: "aarch64-apple-darwin"
      },
      {
        targetId: "darwin-x64",
        name: "@wanex/system-service-darwin-x64",
        platform: "darwin",
        arch: "x64",
        rustTarget: "x86_64-apple-darwin"
      },
      {
        targetId: "linux-x64",
        name: "@wanex/system-service-linux-x64",
        platform: "linux",
        arch: "x64",
        rustTarget: "x86_64-unknown-linux-gnu"
      },
      {
        targetId: "win32-x64",
        name: "@wanex/system-service-win32-x64",
        platform: "win32",
        arch: "x64",
        rustTarget: "x86_64-pc-windows-msvc"
      }
    ])
    const storage = policy.packages.find((item) => item.name === "@wanex/storage")
    expect(storage.sourceOnlyExports).toEqual(["./testing"])
    expect(storage.entries.map((item) => item.exportPath)).not.toContain("./testing")
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
      engines: { node: ">=24" },
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
      },
      optionalDependencies: {
        "@wanex/system-service-darwin-arm64": "0.0.0",
        "@wanex/system-service-darwin-x64": "0.0.0",
        "@wanex/system-service-linux-x64": "0.0.0",
        "@wanex/system-service-win32-x64": "0.0.0"
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

  it("excludes an explicit source-only export without changing the source manifest", () => {
    expect(readExportEntries({
      name: "@wanex/example",
      exports: {
        ".": "./src/index.ts",
        "./testing": "./src/testing.ts"
      }
    }, ["./testing"])).toEqual([
      {
        exportPath: ".",
        sourceTarget: "./src/index.ts",
        artifactPath: "index"
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
