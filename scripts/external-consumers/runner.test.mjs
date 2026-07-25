import { access, mkdir, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, win32 } from "node:path"
import { describe, expect, it } from "vitest"
import {
  assertPathOutsideWorkspace,
  expectedInstalledWanexClosure,
  expectedWanexClosure,
  inspectExternalPackageLock,
  isPathInsideOrEqual,
  withExternalFixtureRoot
} from "./runner.mjs"

const registryPackages = [
  {
    manifest: {
      name: "@wanex/runtime",
      version: "0.0.0",
      dependencies: { "@wanex/storage": "0.0.0", ajv: "8.20.0" },
      optionalDependencies: {
        "@wanex/system-service-darwin-arm64": "0.0.0",
        "@wanex/system-service-win32-x64": "0.0.0"
      }
    }
  },
  { manifest: { name: "@wanex/storage", version: "0.0.0" } },
  {
    manifest: {
      name: "@wanex/system-service-darwin-arm64",
      version: "0.0.0",
      os: ["darwin"],
      cpu: ["arm64"]
    }
  },
  {
    manifest: {
      name: "@wanex/system-service-win32-x64",
      version: "0.0.0",
      os: ["win32"],
      cpu: ["x64"]
    }
  }
]

describe("external consumer runner policy", () => {
  it("derives the exact transitive Wanex closure", () => {
    expect(expectedWanexClosure(["@wanex/runtime"], registryPackages)).toEqual({
      "@wanex/runtime": "0.0.0",
      "@wanex/storage": "0.0.0",
      "@wanex/system-service-darwin-arm64": "0.0.0",
      "@wanex/system-service-win32-x64": "0.0.0"
    })
    expect(expectedInstalledWanexClosure(
      ["@wanex/runtime"],
      registryPackages,
      "darwin",
      "arm64"
    )).toEqual({
      "@wanex/runtime": "0.0.0",
      "@wanex/storage": "0.0.0",
      "@wanex/system-service-darwin-arm64": "0.0.0"
    })
    expect(() => expectedWanexClosure(["@wanex/missing"], registryPackages))
      .toThrow("absent from SDK registry")
  })

  it("accepts a registry lock and rejects path or closure drift", () => {
    const lock = fixtureLock()
    expect(inspectExternalPackageLock({
      lock,
      topLevelNames: ["@wanex/runtime"],
      expectedWanex: {
        "@wanex/runtime": "0.0.0",
        "@wanex/storage": "0.0.0"
      },
      forbiddenPaths: ["/workspace/wanex"]
    })).toEqual([])

    lock.packages["node_modules/@wanex/runtime"].version = "1.0.0"
    lock.packages["node_modules/@wanex/runtime"].resolved = "file:/workspace/wanex/runtime.tgz"
    expect(inspectExternalPackageLock({
      lock,
      topLevelNames: ["@wanex/runtime"],
      expectedWanex: {
        "@wanex/runtime": "0.0.0",
        "@wanex/storage": "0.0.0"
      },
      forbiddenPaths: ["/workspace/wanex"]
    })).toEqual(expect.arrayContaining([
      "package lock contains file:",
      "package lock contains forbidden path /workspace/wanex",
      "installed @wanex/runtime version 1.0.0 differs from 0.0.0"
    ]))

    const windowsLock = fixtureLock()
    windowsLock.packages["node_modules/@wanex/runtime"].resolved =
      "https://registry.example/C:/workspace/wanex/runtime.tgz"
    expect(inspectExternalPackageLock({
      lock: windowsLock,
      topLevelNames: ["@wanex/runtime"],
      expectedWanex: {
        "@wanex/runtime": "0.0.0",
        "@wanex/storage": "0.0.0"
      },
      forbiddenPaths: ["C:\\workspace\\wanex"]
    })).toContain("package lock contains forbidden path C:/workspace/wanex")
  })

  it("rejects workspace-contained roots and cleans external roots on failure", async () => {
    expect(() => assertPathOutsideWorkspace("/workspace/wanex/tmp", "/workspace/wanex"))
      .toThrow("must be outside workspace")
    expect(isPathInsideOrEqual(
      "C:\\Users\\RUNNER~1\\AppData\\Local\\Temp\\wanex-external-consumers",
      "D:\\a\\wanex\\wanex",
      win32
    )).toBe(false)
    expect(isPathInsideOrEqual(
      "D:\\a\\wanex\\wanex\\tmp",
      "D:\\a\\wanex\\wanex",
      win32
    )).toBe(true)

    let createdRoot
    await expect(withExternalFixtureRoot(join(tmpdir(), "wanex-workspace-fixture"), async (root) => {
      createdRoot = root
      await mkdir(join(root, "created"))
      throw new Error("expected failure")
    })).rejects.toThrow("expected failure")
    await expect(access(createdRoot)).rejects.toThrow()
  })
})

function fixtureLock() {
  return JSON.parse(JSON.stringify({
    name: "wanex-external-minimal-agent",
    lockfileVersion: 3,
    packages: {
      "": {
        dependencies: { "@wanex/runtime": "0.0.0" }
      },
      "node_modules/@wanex/runtime": {
        version: "0.0.0",
        resolved: "http://127.0.0.1:1234/tarballs/wanex-runtime.tgz"
      },
      "node_modules/@wanex/storage": {
        version: "0.0.0",
        resolved: "http://127.0.0.1:1234/tarballs/wanex-storage.tgz"
      },
      "node_modules/ajv": {
        version: "8.20.0",
        resolved: "https://registry.npmjs.org/ajv/-/ajv-8.20.0.tgz"
      }
    }
  }))
}
