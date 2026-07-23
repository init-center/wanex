#!/usr/bin/env node
import { readdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { repositoryRelativePath } from "./audit/repository-path.mjs"
import { findPackageDispositionViolations } from "./audit/package-governance/package-disposition-policy.mjs"
import {
  createConsumerBaseline,
  findConsumerBaselineViolations
} from "./audit/package-governance/consumer-baseline-policy.mjs"

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const dispositionPath = join(rootDir, "docs/architecture/package-disposition.json")
const baselinePath = join(rootDir, "docs/architecture/package-consumers.json")
const packageRolesPath = join(rootDir, "docs/architecture/package-roles.json")
const json = process.argv.includes("--json")
const writeBaseline = process.argv.includes("--write-baseline")

const manifests = await readWorkspaceManifests(rootDir)
const packageRoles = JSON.parse(await readFile(packageRolesPath, "utf8"))
const dispositionContract = JSON.parse(await readFile(dispositionPath, "utf8"))

if (writeBaseline) {
  await writeFile(
    baselinePath,
    `${JSON.stringify(createConsumerBaseline(manifests, packageRoles), null, 2)}\n`,
    "utf8"
  )
}

const baseline = JSON.parse(await readFile(baselinePath, "utf8"))
const failures = [
  ...findPackageDispositionViolations({ manifests, packageRoles, dispositionContract }),
  ...findConsumerBaselineViolations({ manifests, packageRoles, baseline })
].sort((left, right) =>
  left.package.localeCompare(right.package) || left.code.localeCompare(right.code)
)

const report = {
  generatedAt: new Date().toISOString(),
  packageCount: manifests.length,
  dispositionCount: Object.keys(dispositionContract.packages ?? {}).length,
  tombstoneCount: Object.keys(dispositionContract.tombstones ?? {}).length,
  dependencyEdgeCount: Object.values(baseline.packages ?? {})
    .reduce((sum, entry) => sum + (entry.consumers?.length ?? 0), 0),
  failures
}

if (json) {
  console.log(JSON.stringify(report, null, 2))
} else {
  console.log("Wanex Package Governance Audit")
  console.log("")
  console.log(`Packages: ${report.packageCount}`)
  console.log(`Active dispositions: ${report.dispositionCount}`)
  console.log(`Tombstones: ${report.tombstoneCount}`)
  console.log(`Workspace dependency edges: ${report.dependencyEdgeCount}`)
  console.log(`Failures: ${failures.length}`)
  for (const failure of failures) {
    console.log(`- [${failure.code}] ${failure.package}: ${failure.message}`)
  }
}

if (failures.length > 0) {
  process.exitCode = 1
}

async function readWorkspaceManifests(workspaceRoot) {
  const manifests = []
  for (const rootName of ["apps", "packages"]) {
    const rootPath = join(workspaceRoot, rootName)
    const entries = await readdir(rootPath, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue
      }
      const path = join(rootPath, entry.name, "package.json")
      try {
        const manifest = JSON.parse(await readFile(path, "utf8"))
        manifests.push({
          name: manifest.name,
          path: repositoryRelativePath(workspaceRoot, dirname(path)),
          manifest
        })
      } catch (error) {
        if (error?.code !== "ENOENT") {
          throw error
        }
      }
    }
  }
  return manifests.sort((left, right) => left.name.localeCompare(right.name))
}
