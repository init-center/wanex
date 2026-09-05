import { buildEffectivePackagePacklist } from "../package-packlist/effective-packlist.mjs"

export function buildDistributionPackageMetrics(request) {
  const packlist = buildEffectivePackagePacklist({
    manifest: request.manifest,
    allFiles: request.allFiles
  })
  const files = packlist.map((file) => ({
    ...file,
    isSource: file.path.startsWith("src/") && file.path.endsWith(".ts"),
    isFixture: file.path.includes("/fixtures/") || file.path.startsWith("fixtures/"),
    isTest: file.path.startsWith("test/")
  }))

  return {
    fileCount: files.length,
    packageBytes: sum(files.map((file) => file.bytes)),
    sourceFileCount: files.filter((file) => file.isSource).length,
    sourceBytes: sum(files.filter((file) => file.isSource).map((file) => file.bytes)),
    testFileCount: files.filter((file) => file.isTest).length,
    fixtureFileCount: files.filter((file) => file.isFixture).length,
    fixtureBytes: sum(files.filter((file) => file.isFixture).map((file) => file.bytes)),
    largestFiles: [...files]
      .sort((left, right) =>
        right.bytes - left.bytes || left.reportPath.localeCompare(right.reportPath)
      )
      .slice(0, 5)
  }
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0)
}
