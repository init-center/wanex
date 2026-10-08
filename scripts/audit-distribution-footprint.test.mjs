import { describe, expect, it } from "vitest"
import { buildDistributionPackageMetrics } from "./audit/distribution-footprint/package-metrics.mjs"
import { forbiddenCapabilityPackages } from "./audit/distribution-footprint/capability-policy.mjs"

describe("distribution capability policy", () => {
  const capabilities = ["@wanex/plugin", "@wanex/connector", "@wanex/workspace"]

  it.each(["@wanex/assistant-host", "@wanex/tui"])(
    "allows Workspace only at the reviewed Host consumer %s",
    (entry) => {
      expect(forbiddenCapabilityPackages(entry, capabilities)).toEqual([
        "@wanex/plugin", "@wanex/connector"
      ])
    }
  )

  it.each(["@wanex/runtime", "@wanex/app", "@wanex/assistant", "@wanex/cli", "@wanex/assistant-ui"])(
    "keeps all optional capabilities forbidden for %s",
    (entry) => {
      expect(forbiddenCapabilityPackages(entry, capabilities)).toEqual(capabilities)
    }
  )

  it("reports only capabilities actually present in the closure", () => {
    expect(forbiddenCapabilityPackages("@wanex/app", ["@wanex/protocol"])).toEqual([])
  })
})

describe("distribution footprint package metrics", () => {
  it("excludes test fixtures omitted by the package files field", () => {
    const metrics = buildDistributionPackageMetrics({
      manifest: {
        name: "@wanex/fixture",
        files: ["src", "README.md"]
      },
      allFiles: [
        file("README.md", 10),
        file("src/index.ts", 20),
        file("test/fixtures/server.mjs", 30)
      ]
    })

    expect(metrics).toMatchObject({
      fileCount: 2,
      packageBytes: 30,
      sourceFileCount: 1,
      testFileCount: 0,
      fixtureFileCount: 0,
      fixtureBytes: 0
    })
  })

  it("retains fixtures that are part of the effective package", () => {
    const metrics = buildDistributionPackageMetrics({
      manifest: {
        name: "@wanex/fixture",
        files: ["src", "README.md"]
      },
      allFiles: [
        file("README.md", 10),
        file("src/index.ts", 20),
        file("src/fixtures/server.mjs", 30),
        file("test/fixtures/server.mjs", 40)
      ]
    })

    expect(metrics).toMatchObject({
      fileCount: 3,
      packageBytes: 60,
      sourceFileCount: 1,
      testFileCount: 0,
      fixtureFileCount: 1,
      fixtureBytes: 30
    })
  })
})

function file(path, bytes) {
  return {
    absolutePath: `/workspace/package/${path}`,
    path,
    reportPath: `packages/fixture/${path}`,
    bytes
  }
}
