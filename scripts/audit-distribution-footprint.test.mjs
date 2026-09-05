import { describe, expect, it } from "vitest"
import { buildDistributionPackageMetrics } from "./audit/distribution-footprint/package-metrics.mjs"

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
