#!/usr/bin/env node
import { readdir, readFile, stat } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, join, relative } from "node:path"
import { findManifestDependencyViolations } from "./audit/public-contracts/manifest-dependency-policy.mjs"
import {
  facadeApiContract,
  findFacadeApiViolations
} from "./audit/public-contracts/facade-api-policy.mjs"
import {
  findPackageRoleCoverageViolations,
  findPackageRoleDependencyViolations
} from "./audit/public-contracts/package-role-policy.mjs"
import { findProtocolExportGraphViolations } from "./audit/public-contracts/protocol-export-graph.mjs"
import { findProtocolSourcePolicyViolations } from "./audit/public-contracts/protocol-source-policy.mjs"
import { findForbiddenRootExportViolations } from "./audit/public-contracts/root-export-policy.mjs"
import { findForbiddenSourceImports } from "./audit/public-contracts/source-import-policy.mjs"

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const rootReadmePath = join(rootDir, "README.md")
const docsPath = join(rootDir, "docs/architecture/public-contracts.md")
const protocolSourceDir = join(rootDir, "packages/protocol/src")
const packageRolesPath = join(rootDir, "docs/architecture/package-roles.json")
const json = process.argv.includes("--json")

const packageJsonPaths = (await Promise.all(
  ["apps", "packages"].map(async (name) =>
    await findPackageJsons(join(rootDir, name))
  )
)).flat()
const packageRoles = JSON.parse(await readFile(packageRolesPath, "utf8"))
const rootReadme = await readFile(rootReadmePath, "utf8")
const docs = await readFile(docsPath, "utf8")
const packages = []
const failures = []
const sourceImportViolations = []
const requiredRootReadmeEntryPhrases = [
  "Default agent runtime: `@wanex/runtime`",
  "Default upper-product backend: `@wanex/app`",
  "Optional capabilities are explicit:",
  "Concrete Product App hosts under `apps/`"
]
const requiredPublicContractEntryPhrases = [
  "Default agent runtime:",
  "Default upper-product backend:",
  "Internal implementation packages are not ordinary consumer entries."
]
const requiredReadmeContracts = new Map([
  [
    "@wanex/storage",
    ["Entry Contract", "Use when", "Avoid when", "Lifecycle"]
  ],
  [
    "@wanex/app",
    ["Entry Contract", "Use when", "Avoid when", "Product Boundary"]
  ],
  [
    "@wanex/runtime",
    ["Entry Contract", "Use when", "Avoid when", "Minimal Use", "Lifecycle"]
  ],
  [
    "@wanex/eval-harness",
    ["Entry Contract", "Use when", "Avoid when", "CLI"]
  ]
])

for (const requiredText of requiredRootReadmeEntryPhrases) {
  if (!rootReadme.includes(requiredText)) {
    failures.push({
      code: "missing-root-app-entry-contract",
      package: "wanex",
      message: `README.md must include "${requiredText}"`
    })
  }
}
for (const requiredText of requiredPublicContractEntryPhrases) {
  if (!docs.includes(requiredText)) {
    failures.push({
      code: "missing-public-app-entry-contract",
      package: "wanex",
      message: `public-contracts.md must include "${requiredText}"`
    })
  }
}

for (const packageJsonPath of packageJsonPaths) {
  const packageDir = dirname(packageJsonPath)
  const manifest = JSON.parse(await readFile(packageJsonPath, "utf8"))
  const relDir = relative(rootDir, packageDir)
  const sourceIndex = join(packageDir, "src/index.ts")
  const readmePath = join(packageDir, "README.md")
  const packageInfo = {
    name: manifest.name,
    path: relDir,
    exportKeys: exportKeys(manifest.exports)
  }
  packages.push(packageInfo)

  if (typeof manifest.name !== "string" || !manifest.name.startsWith("@wanex/")) {
    failures.push({
      code: "invalid-package-name",
      package: manifest.name ?? relDir,
      message: "workspace package name must be a @wanex package"
    })
  }
  if (!packageInfo.exportKeys.includes(".")) {
    failures.push({
      code: "missing-root-export",
      package: manifest.name,
      message: "package.json exports must expose the root entrypoint"
    })
  }
  if (!(await exists(sourceIndex))) {
    failures.push({
      code: "missing-src-index",
      package: manifest.name,
      message: "root export must point at a src/index.ts contract"
    })
  }
  if (!docs.includes(manifest.name)) {
    failures.push({
      code: "missing-public-contract-doc",
      package: manifest.name,
      message: "public-contracts.md must classify every workspace package"
    })
  }
  if (await exists(sourceIndex)) {
    const rootSource = await readFile(sourceIndex, "utf8")
    failures.push(...findForbiddenRootExportViolations(manifest.name, rootSource))
    const facadeContract = facadeApiContract(manifest.name)
    if (facadeContract !== undefined) {
      const typePath = join(packageDir, "src", facadeContract.typeFile)
      if (!(await exists(typePath))) {
        failures.push({
          code: "missing-facade-public-types",
          package: manifest.name,
          message: `${manifest.name} must provide src/${facadeContract.typeFile}`
        })
      } else {
        failures.push(...findFacadeApiViolations({
          packageName: manifest.name,
          rootSource,
          typeSource: await readFile(typePath, "utf8")
        }))
      }
    }
  }
  const requiredReadme = requiredReadmeContracts.get(manifest.name)
  if (requiredReadme !== undefined) {
    if (!(await exists(readmePath))) {
      failures.push({
        code: "missing-readme-entry-contract",
        package: manifest.name,
        message: `${manifest.name} must document its app-facing entry contract in README.md`
      })
    } else {
      const readme = await readFile(readmePath, "utf8")
      for (const requiredText of requiredReadme) {
        if (!readme.includes(requiredText)) {
          failures.push({
            code: "missing-readme-entry-contract-section",
            package: manifest.name,
            message: `${manifest.name} README.md must include "${requiredText}"`
          })
        }
      }
    }
  }
  failures.push(...findManifestDependencyViolations(manifest))
  if (typeof manifest.name === "string" && manifest.name.startsWith("@wanex/")) {
    sourceImportViolations.push(
      ...(await findForbiddenSourceImports({
        rootDir,
        packageName: manifest.name,
        packageDir,
        relDir
      }))
    )
  }
  failures.push(...findPackageRoleDependencyViolations(manifest, packageRoles))
}

failures.push(
  ...findPackageRoleCoverageViolations(
    packages.map((packageInfo) => ({ name: packageInfo.name })),
    packageRoles
  )
)

failures.push(
  ...(await findProtocolSourcePolicyViolations({
    rootDir,
    protocolSourceDir
  }))
)
failures.push(
  ...(await findProtocolExportGraphViolations({
    rootDir,
    protocolSourceDir
  }))
)

const report = {
  generatedAt: new Date().toISOString(),
  packageCount: packages.length,
  packages: packages.sort((left, right) => left.name.localeCompare(right.name)),
  failures: failures.concat(sourceImportViolations).sort((left, right) =>
    left.package.localeCompare(right.package) || left.code.localeCompare(right.code)
  )
}

if (json) {
  console.log(JSON.stringify(report, null, 2))
} else {
  printTextReport(report)
}

if (report.failures.length > 0) {
  process.exitCode = 1
}

async function findPackageJsons(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const paths = []
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "target") {
      continue
    }
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      paths.push(...(await findPackageJsons(fullPath)))
      continue
    }
    if (entry.isFile() && entry.name === "package.json" && fullPath !== join(rootDir, "package.json")) {
      paths.push(fullPath)
    }
  }
  return paths
}

async function exists(path) {
  try {
    const value = await stat(path)
    return value.isFile()
  } catch {
    return false
  }
}

function exportKeys(exportsValue) {
  if (typeof exportsValue === "string") {
    return ["."]
  }
  if (exportsValue !== null && typeof exportsValue === "object" && !Array.isArray(exportsValue)) {
    return Object.keys(exportsValue)
  }
  return []
}

function printTextReport(report) {
  console.log("Wanex Public Contract Audit")
  console.log("")
  console.log(`Packages: ${report.packageCount}`)
  console.log(`Failures: ${report.failures.length}`)
  console.log("")
  if (report.failures.length === 0) {
    console.log("Failures:")
    console.log("- none")
    return
  }
  console.log("Failures:")
  for (const failure of report.failures) {
    console.log(`- [${failure.code}] ${failure.package}: ${failure.message}`)
  }
}
