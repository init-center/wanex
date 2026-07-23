#!/usr/bin/env node
import { readdir, readFile, stat } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { repositoryRelativePath } from "./audit/repository-path.mjs"
import { findPacklistFilePolicyFailures } from "./audit/package-packlist/packlist-file-policy.mjs"
import {
  binFiles,
  entryTargetFiles,
  exportedFiles,
  findSourceFirstManifestEntryFailures
} from "./audit/package-packlist/source-first-manifest-entries.mjs"

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const json = process.argv.includes("--json")

const ignoredDirs = new Set([
  "node_modules",
  "dist",
  "target",
  "coverage",
  ".turbo",
  ".next"
])

const packageJsonPaths = await findPackageJsons(rootDir)
const packages = []
const failures = []

for (const packageJsonPath of packageJsonPaths) {
  const packageDir = dirname(packageJsonPath)
  const manifest = JSON.parse(await readFile(packageJsonPath, "utf8"))
  if (typeof manifest.name !== "string" || !manifest.name.startsWith("@wanex/")) {
    continue
  }
  const allFiles = await findPackageFiles(packageDir, packageDir)
  const packlist = buildPacklist({
    packageDir,
    manifest,
    allFiles
  })
  const packageFailures = findPacklistFilePolicyFailures({
    manifest,
    packlist
  })
  packageFailures.push(
    ...findSourceFirstManifestEntryFailures({
      manifest,
      allFiles
    })
  )
  failures.push(...packageFailures)
  packages.push({
    name: manifest.name,
    path: repositoryRelativePath(rootDir, packageDir),
    packlistFileCount: packlist.length,
    packlistBytes: sum(packlist.map((file) => file.bytes)),
    filesField: Array.isArray(manifest.files) ? manifest.files : null,
    hasFilesField: Array.isArray(manifest.files),
    exportedFiles: exportedFiles(manifest),
    binFiles: binFiles(manifest),
    entryTargetFiles: entryTargetFiles(manifest),
    forbiddenFileCount: packageFailures.length,
    forbiddenFiles: packageFailures.map((failure) => failure.path),
    largestFiles: [...packlist]
      .sort((left, right) => right.bytes - left.bytes || left.path.localeCompare(right.path))
      .slice(0, 5)
  })
}

const report = {
  generatedAt: new Date().toISOString(),
  packages: packages.sort((left, right) => left.name.localeCompare(right.name)),
  failures: failures.sort((left, right) =>
    left.package.localeCompare(right.package) ||
    left.path.localeCompare(right.path) ||
    left.code.localeCompare(right.code)
  ),
  totals: {
    packages: packages.length,
    failures: failures.length,
    packlistFiles: sum(packages.map((item) => item.packlistFileCount)),
    packlistBytes: sum(packages.map((item) => item.packlistBytes))
  }
}

if (json) {
  console.log(JSON.stringify(report, null, 2))
} else {
  printTextReport(report)
}

if (failures.length > 0) {
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

async function findPackageFiles(dir, packageRoot) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    if (ignoredDirs.has(entry.name)) {
      continue
    }
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await findPackageFiles(fullPath, packageRoot)))
      continue
    }
    if (entry.isFile()) {
      const fileStat = await stat(fullPath)
      files.push({
        absolutePath: fullPath,
        path: repositoryRelativePath(packageRoot, fullPath),
        bytes: fileStat.size
      })
    }
  }
  return files
}

function buildPacklist(request) {
  const filesField = Array.isArray(request.manifest.files)
    ? request.manifest.files
    : null
  if (filesField !== null) {
    return request.allFiles.filter((file) =>
      filesField.some((entry) => matchesFilesEntry(file.path, entry))
    )
  }
  const requiredFiles = new Set([
    "package.json",
    ...exportedFiles(request.manifest),
    ...binFiles(request.manifest)
  ])
  return request.allFiles.filter((file) =>
    file.path === "package.json" ||
    file.path === "README.md" ||
    file.path.startsWith("src/") ||
    requiredFiles.has(file.path)
  )
}

function matchesFilesEntry(path, entry) {
  if (typeof entry !== "string" || entry.length === 0) {
    return false
  }
  const normalized = entry.replace(/^\.\//, "").replace(/\/$/, "")
  return path === normalized || path.startsWith(`${normalized}/`)
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0)
}

function printTextReport(report) {
  console.log("Wanex Package Packlist Audit")
  console.log("")
  console.log(`Packages: ${report.totals.packages}`)
  console.log(`Packlist files: ${report.totals.packlistFiles}`)
  console.log(`Packlist bytes: ${formatBytes(report.totals.packlistBytes)}`)
  console.log(`Failures: ${report.totals.failures}`)
  console.log("")
  console.log("Largest package packlists:")
  for (const packageInfo of [...report.packages]
    .sort((left, right) => right.packlistBytes - left.packlistBytes || left.name.localeCompare(right.name))
    .slice(0, 10)) {
    console.log(
      `- ${packageInfo.name}: ${formatBytes(packageInfo.packlistBytes)} (${packageInfo.packlistFileCount} files)`
    )
  }
  console.log("")
  console.log("Failures:")
  if (report.failures.length === 0) {
    console.log("- none")
  } else {
    for (const failure of report.failures) {
      console.log(
        `- [${failure.code}] ${failure.package}/${failure.path}: ${failure.message}`
      )
    }
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KiB`
  }
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`
}
