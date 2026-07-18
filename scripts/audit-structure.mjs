#!/usr/bin/env node
import { readdir, readFile, stat } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, join, relative } from "node:path"

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const json = process.argv.includes("--json")

const thresholds = {
  largeFileLines: 600,
  hugeFileLines: 1_000,
  largeIndexLines: 250,
  hugeIndexLines: 600
}

const packageJsonPaths = (await Promise.all(
  ["apps", "packages"].map(async (name) =>
    await findPackageJsons(join(rootDir, name))
  )
)).flat()
const packages = []
const sourceFiles = []
const warnings = []

for (const packageJsonPath of packageJsonPaths) {
  const packageDir = dirname(packageJsonPath)
  const manifest = JSON.parse(await readFile(packageJsonPath, "utf8"))
  const srcDir = join(packageDir, "src")
  const packageSourceFiles = await findTsFiles(srcDir)
  const files = []
  for (const filePath of packageSourceFiles) {
    const lineCount = await countLines(filePath)
    const rel = relative(rootDir, filePath)
    const file = {
      path: rel,
      lines: lineCount,
      isIndex: rel.endsWith("/src/index.ts")
    }
    files.push(file)
    sourceFiles.push(file)
    if (file.isIndex && lineCount >= thresholds.hugeIndexLines) {
      warnings.push({
        code: "huge-index",
        package: manifest.name,
        path: rel,
        lines: lineCount,
        message: "src/index.ts is implementation-heavy and should be split"
      })
    } else if (file.isIndex && lineCount >= thresholds.largeIndexLines) {
      warnings.push({
        code: "large-index",
        package: manifest.name,
        path: rel,
        lines: lineCount,
        message: "src/index.ts should trend toward a small facade or barrel"
      })
    } else if (lineCount >= thresholds.hugeFileLines) {
      warnings.push({
        code: "huge-file",
        package: manifest.name,
        path: rel,
        lines: lineCount,
        message: "source file is very large and should be split by domain"
      })
    } else if (lineCount >= thresholds.largeFileLines) {
      warnings.push({
        code: "large-file",
        package: manifest.name,
        path: rel,
        lines: lineCount,
        message: "source file is large enough to monitor"
      })
    }
  }
  packages.push({
    name: manifest.name,
    path: relative(rootDir, packageDir),
    dependencyCount: Object.keys(manifest.dependencies ?? {}).length,
    exportKeys: exportKeys(manifest.exports),
    sourceFileCount: files.length,
    sourceLineCount: files.reduce((sum, file) => sum + file.lines, 0),
    largestFiles: [...files].sort(byLinesDesc).slice(0, 5)
  })
}

const report = {
  generatedAt: new Date().toISOString(),
  thresholds,
  totals: {
    packages: packages.length,
    sourceFiles: sourceFiles.length,
    sourceLines: sourceFiles.reduce((sum, file) => sum + file.lines, 0),
    warnings: warnings.length
  },
  packages: packages.sort((a, b) => a.name.localeCompare(b.name)),
  largestFiles: [...sourceFiles].sort(byLinesDesc).slice(0, 20),
  warnings: warnings.sort(byWarning)
}

if (json) {
  console.log(JSON.stringify(report, null, 2))
} else {
  printTextReport(report)
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

async function findTsFiles(dir) {
  try {
    const dirStat = await stat(dir)
    if (!dirStat.isDirectory()) {
      return []
    }
  } catch {
    return []
  }
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await findTsFiles(fullPath)))
      continue
    }
    if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(fullPath)
    }
  }
  return files
}

async function countLines(filePath) {
  const text = await readFile(filePath, "utf8")
  if (text.length === 0) {
    return 0
  }
  return text.split("\n").length
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

function byLinesDesc(left, right) {
  return right.lines - left.lines || left.path.localeCompare(right.path)
}

function byWarning(left, right) {
  return right.lines - left.lines || left.path.localeCompare(right.path)
}

function printTextReport(report) {
  console.log("Wanex Structure Audit")
  console.log("")
  console.log(`Packages: ${report.totals.packages}`)
  console.log(`Source files: ${report.totals.sourceFiles}`)
  console.log(`Source lines: ${report.totals.sourceLines}`)
  console.log(`Warnings: ${report.totals.warnings}`)
  console.log("")
  console.log("Largest files:")
  for (const file of report.largestFiles.slice(0, 10)) {
    console.log(`- ${file.path}: ${file.lines}`)
  }
  console.log("")
  console.log("Warnings:")
  if (report.warnings.length === 0) {
    console.log("- none")
  } else {
    for (const warning of report.warnings) {
      console.log(
        `- [${warning.code}] ${warning.path}: ${warning.lines} (${warning.message})`
      )
    }
  }
}
