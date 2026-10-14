import { describe, expect, it } from "vitest"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { build } from "esbuild"
import { ConsoleMessageId, Extractor, ExtractorConfig } from "@microsoft/api-extractor"
import {
  artifactBareImportIsExternal,
  createStagingManifest,
  isBareImport,
  loadSdkDistributionPolicy,
  readExportEntries
} from "./distribution-policy.mjs"

describe("SDK distribution policy", () => {
  it("keeps the programmatic API extractor independent of its retired CLI dependencies", async () => {
    const require = createRequire(import.meta.url)
    const engine = createRequire(require.resolve("@microsoft/api-extractor/package.json"))
    for (const name of ["@rushstack/ts-command-line", "sprintf-js"]) {
      expect(() => engine.resolve(name)).toThrow(expect.objectContaining({ code: "MODULE_NOT_FOUND" }))
    }
    const result = await build({
      entryPoints: [require.resolve("@microsoft/api-extractor")],
      bundle: true,
      platform: "node",
      format: "cjs",
      write: false,
      metafile: true,
      logLevel: "silent"
    })
    const inputs = Object.keys(result.metafile.inputs).map((path) => path.replaceAll("\\", "/"))
    expect(inputs.some((path) => /(?:ts-command-line|argparse|sprintf-js|api-extractor\/lib[^/]*\/cli)\//.test(path))).toBe(false)
  })

  it("still rejects changed public signatures and compiler errors through the real library API", async () => {
    const root = await mkdtemp(join(tmpdir(), "wanex-sdk-api-"))
    try {
      await mkdir(join(root, "reports"))
      await mkdir(join(root, "temp"))
      await writeFile(join(root, "package.json"), JSON.stringify({ name: "sdk-pruning-fixture", version: "1.0.0" }))
      const entry = join(root, "index.d.ts")
      const original = "/** @public */\nexport declare function sample(input: string): string;\n"
      await writeFile(entry, original)
      const invoke = (localBuild) => {
        const messages = []
        const config = ExtractorConfig.prepare({
          configObject: {
            projectFolder: root,
            mainEntryPointFilePath: entry,
            newlineKind: "lf",
            compiler: {
              overrideTsconfig: { compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", strict: true, types: [] } },
              skipLibCheck: false
            },
            apiReport: { enabled: true, reportFileName: "fixture", reportFolder: join(root, "reports"), reportTempFolder: join(root, "temp"), includeForgottenExports: true },
            docModel: { enabled: false },
            dtsRollup: { enabled: false },
            tsdocMetadata: { enabled: false }
          },
          configObjectFullPath: join(root, "api-extractor.json"),
          packageJsonFullPath: join(root, "package.json")
        })
        const result = Extractor.invoke(config, {
          localBuild,
          showVerboseMessages: false,
          printApiReportDiff: false,
          messageCallback(message) {
            messages.push({ id: message.messageId, text: message.text })
            message.handled = true
          }
        })
        return { result, messages }
      }
      expect(invoke(true).result.succeeded).toBe(true)
      const baselinePath = join(root, "reports/fixture.api.md")
      const baseline = await readFile(baselinePath, "utf8")
      expect(invoke(false).result.succeeded).toBe(true)
      await writeFile(entry, original.replace("input: string", "input: number"))
      const changed = invoke(false)
      expect(changed.result.succeeded).toBe(false)
      expect(changed.messages.map((message) => message.id)).toContain(ConsoleMessageId.ApiReportNotCopied)
      expect(await readFile(baselinePath, "utf8")).toBe(baseline)
      await writeFile(entry, "interface Base { value: string; }\n/** @public */\nexport interface Broken extends Base { value: number; }\n")
      const invalid = invoke(false)
      expect(invalid.result.succeeded).toBe(false)
      expect(invalid.messages.map((message) => message.id)).toContain("TS2430")
      expect(await readFile(baselinePath, "utf8")).toBe(baseline)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

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
    )).toBe(31)
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

  it("preserves third-party ranges and pins matching Wanex release dependencies", async () => {
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
        ajv: "^8.20.0",
        yaml: "^2.9.0"
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
