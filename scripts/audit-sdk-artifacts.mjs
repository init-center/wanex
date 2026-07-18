#!/usr/bin/env node
import { createHash } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"
import { join, relative } from "node:path"
import {
  findArtifactFileFailures,
  findCompiledModuleFailures,
  findStagingManifestFailures
} from "./sdk/artifact-policy.mjs"
import {
  encodedPackageName,
  loadSdkDistributionPolicy,
  workspaceRoot
} from "./sdk/distribution-policy.mjs"

const policy = await loadSdkDistributionPolicy()
const stagingRoot = join(policy.outputDir, "staging")
const reportPath = join(policy.outputDir, "reports/artifacts.json")
const report = JSON.parse(await readFile(reportPath, "utf8"))
const failures = []

for (const packageInfo of policy.packages) {
  const stagingDir = join(stagingRoot, encodedPackageName(packageInfo.name))
  const manifest = JSON.parse(await readFile(join(stagingDir, "package.json"), "utf8"))
  const files = await listFiles(stagingDir)
  failures.push(...findStagingManifestFailures(manifest, packageInfo)
    .map((failure) => ({ ...failure, package: packageInfo.name })))
  failures.push(...findArtifactFileFailures(files, packageInfo)
    .map((failure) => ({ ...failure, package: packageInfo.name })))
  for (const path of files.filter((item) => item.endsWith(".js") || item.endsWith(".d.ts"))) {
    const content = await readFile(join(stagingDir, path), "utf8")
    failures.push(...findCompiledModuleFailures({
      content,
      workspaceRoot,
      packageName: packageInfo.name,
      dependencies: manifest.dependencies ?? {}
    }).map((failure) => ({ ...failure, package: packageInfo.name, path })))
  }
  const artifact = report.packages.find((item) => item.name === packageInfo.name)
  if (artifact === undefined) {
    failures.push({
      code: "artifact-report-missing",
      package: packageInfo.name,
      path: "reports/artifacts.json",
      message: "package is absent from artifact report"
    })
    continue
  }
  const tarballPath = join(policy.outputDir, "tarballs", artifact.filename)
  const tarball = await readFile(tarballPath)
  const sha256 = createHash("sha256").update(tarball).digest("hex")
  if (sha256 !== artifact.sha256 || tarball.byteLength !== artifact.bytes) {
    failures.push({
      code: "artifact-report-hash",
      package: packageInfo.name,
      path: artifact.filename,
      message: "tarball hash or size differs from artifact report"
    })
  }
  const packedFiles = artifact.files.map((file) => file.path).sort()
  failures.push(...findArtifactFileFailures(packedFiles, packageInfo)
    .map((failure) => ({ ...failure, package: packageInfo.name })))
}

console.log("Wanex Compiled SDK Artifact Audit")
console.log("")
console.log(`Packages: ${policy.packages.length}`)
console.log(`Entries: ${policy.packages.reduce((sum, item) => sum + item.entries.length, 0)}`)
console.log(`Failures: ${failures.length}`)
console.log("")
console.log("Failures:")
if (failures.length === 0) {
  console.log("- none")
} else {
  for (const failure of failures) {
    console.log(`- [${failure.code}] ${failure.package}/${failure.path}: ${failure.message}`)
  }
  process.exitCode = 1
}

async function listFiles(root) {
  const paths = []
  for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) paths.push(relative(root, join(entry.parentPath, entry.name)))
  }
  return paths.sort()
}
