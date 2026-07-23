#!/usr/bin/env node
import { readdir, readFile, stat } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { repositoryRelativePath } from "./audit/repository-path.mjs"

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const json = process.argv.includes("--json")
const enforce = process.argv.includes("--enforce")

const entries = [
  { name: "@wanex/runtime", kind: "cold-runtime-facade" },
  { name: "@wanex/cli", kind: "cold-product" },
  { name: "@wanex/app", kind: "slim-hot-product" },
  { name: "@wanex/product-app", kind: "slim-hot-product" },
  { name: "@wanex/product-app-command-host", kind: "hot-product" },
  { name: "@wanex/product-app-local", kind: "interactive-product" },
  { name: "@wanex/product-app-web", kind: "interactive-product" },
  { name: "@wanex/product-app-tui", kind: "interactive-product" },
]

const forbiddenPackages = [
  "@wanex/plugin",
  "@wanex/connector"
]

const concreteAdapterPackages = []

const excludedPackageDirs = new Set([
  "node_modules",
  "dist",
  "target",
  "coverage",
  ".turbo",
  ".next"
])

const manifests = await readWorkspaceManifests(rootDir)
const graph = buildWorkspaceGraph(manifests)
const packageMetrics = await readPackageMetrics(manifests)

const entryReports = entries.map((entry) =>
  buildEntryReport({
    entry,
    manifests,
    graph,
    packageMetrics
  })
)
const failures = entryReports.flatMap(footprintFailures)

const report = {
  generatedAt: new Date().toISOString(),
  mode: enforce ? "enforce" : "report",
  entries: entryReports,
  failures,
  totals: {
    entries: entryReports.length,
    workspacePackages: manifests.size,
    failures: failures.length
  }
}

if (json) {
  console.log(JSON.stringify(report, null, 2))
} else {
  printTextReport(report)
}

if (enforce && failures.length > 0) {
  process.exitCode = 1
}

async function readWorkspaceManifests(root) {
  const manifests = new Map()
  for (const packageJsonPath of await findPackageJsons(root)) {
    const manifest = JSON.parse(await readFile(packageJsonPath, "utf8"))
    if (typeof manifest.name !== "string" || !manifest.name.startsWith("@wanex/")) {
      continue
    }
    const packageDir = dirname(packageJsonPath)
    manifests.set(manifest.name, {
      name: manifest.name,
      path: repositoryRelativePath(root, packageJsonPath),
      dir: packageDir,
      manifest,
      dependencies: Object.keys({
        ...(manifest.dependencies ?? {}),
        ...(manifest.optionalDependencies ?? {})
      }).sort()
    })
  }
  return manifests
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

function buildWorkspaceGraph(manifests) {
  const graph = new Map()
  for (const manifest of manifests.values()) {
    graph.set(
      manifest.name,
      manifest.dependencies.filter((dependency) => manifests.has(dependency))
    )
  }
  return graph
}

async function readPackageMetrics(manifests) {
  const metrics = new Map()
  for (const manifest of manifests.values()) {
    const files = await findPackageFiles(manifest.dir)
    const fileStats = await Promise.all(
      files.map(async (filePath) => {
        const fileStat = await stat(filePath)
        const packageRelativePath = repositoryRelativePath(manifest.dir, filePath)
        return {
          path: repositoryRelativePath(rootDir, filePath),
          packageRelativePath,
          bytes: fileStat.size,
          isSource: packageRelativePath.startsWith("src/") && packageRelativePath.endsWith(".ts"),
          isFixture: packageRelativePath.includes("/fixtures/") || packageRelativePath.startsWith("fixtures/"),
          isTest: packageRelativePath.startsWith("test/")
        }
      })
    )
    metrics.set(manifest.name, {
      fileCount: fileStats.length,
      packageBytes: sum(fileStats.map((file) => file.bytes)),
      sourceFileCount: fileStats.filter((file) => file.isSource).length,
      sourceBytes: sum(fileStats.filter((file) => file.isSource).map((file) => file.bytes)),
      testFileCount: fileStats.filter((file) => file.isTest).length,
      fixtureFileCount: fileStats.filter((file) => file.isFixture).length,
      fixtureBytes: sum(fileStats.filter((file) => file.isFixture).map((file) => file.bytes)),
      largestFiles: [...fileStats]
        .sort((left, right) => right.bytes - left.bytes || left.path.localeCompare(right.path))
        .slice(0, 5)
    })
  }
  return metrics
}

async function findPackageFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    if (excludedPackageDirs.has(entry.name)) {
      continue
    }
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await findPackageFiles(fullPath)))
      continue
    }
    if (entry.isFile()) {
      files.push(fullPath)
    }
  }
  return files
}

function buildEntryReport(request) {
  const closure = dependencyClosure(request.graph, request.entry.name)
  const missing = request.manifests.has(request.entry.name) ? [] : [request.entry.name]
  const closureMetrics = closure.map((packageName) => ({
    name: packageName,
    path: request.manifests.get(packageName)?.path,
    metrics: request.packageMetrics.get(packageName)
  }))
  const forbiddenClosure = forbiddenPackages.filter((packageName) =>
    closure.includes(packageName)
  )
  const concreteAdapterClosure = concreteAdapterPackages.filter((packageName) =>
    closure.includes(packageName)
  )
  const totals = {
    packageCount: closure.length,
    packageBytes: sum(closureMetrics.map((item) => item.metrics?.packageBytes ?? 0)),
    sourceFileCount: sum(closureMetrics.map((item) => item.metrics?.sourceFileCount ?? 0)),
    sourceBytes: sum(closureMetrics.map((item) => item.metrics?.sourceBytes ?? 0)),
    fixtureFileCount: sum(closureMetrics.map((item) => item.metrics?.fixtureFileCount ?? 0)),
    fixtureBytes: sum(closureMetrics.map((item) => item.metrics?.fixtureBytes ?? 0))
  }

  return {
    entry: request.entry.name,
    kind: request.entry.kind,
    missing,
    totals,
    contains: {
      pluginRuntime: closure.includes("@wanex/plugin"),
      connectorRuntime: closure.includes("@wanex/connector"),
      concreteAdapters: concreteAdapterClosure,
      forbiddenPackages: forbiddenClosure
    },
    workspaceClosure: closure,
    largestPackages: closureMetrics
      .map((item) => ({
        name: item.name,
        packageBytes: item.metrics?.packageBytes ?? 0,
        sourceBytes: item.metrics?.sourceBytes ?? 0,
        fixtureBytes: item.metrics?.fixtureBytes ?? 0
      }))
      .sort((left, right) => right.packageBytes - left.packageBytes || left.name.localeCompare(right.name))
      .slice(0, 8)
  }
}

function footprintFailures(entry) {
  if (entry.entry === "@wanex/product-app-command-host") {
    const failures = []
    if (!entry.contains.pluginRuntime) {
      failures.push({
        code: "footprint_required_plugin_runtime_missing",
        entry: entry.entry,
        message: "product command host must include plugin runtime"
      })
    }
    if (entry.contains.connectorRuntime) {
      failures.push({
        code: "footprint_unrelated_connector_runtime",
        entry: entry.entry,
        message: "product command host must not include connector runtime"
      })
    }
    return failures
  }
  if (!entry.kind.startsWith("cold-") && entry.kind !== "slim-hot-product") {
    return []
  }
  const failures = []
  if (entry.missing.length > 0) {
    failures.push({
      code: "footprint_entry_missing",
      entry: entry.entry,
      message: `${entry.kind} footprint audit entry is missing`,
      detail: {
        missing: entry.missing
      }
    })
  }
  if (entry.contains.forbiddenPackages.length > 0) {
    failures.push({
      code: "footprint_forbidden_closure",
      entry: entry.entry,
      message: `${entry.kind} entry includes forbidden plugin/connector closure`,
      detail: {
        packages: entry.contains.forbiddenPackages
      }
    })
  }
  if (entry.contains.concreteAdapters.length > 0) {
    failures.push({
      code: "footprint_concrete_adapter_closure",
      entry: entry.entry,
      message: `${entry.kind} entry includes concrete connector adapter closure`,
      detail: {
        packages: entry.contains.concreteAdapters
      }
    })
  }
  if (entry.totals.fixtureFileCount > 0 || entry.totals.fixtureBytes > 0) {
    failures.push({
      code: "footprint_fixture_closure",
      entry: entry.entry,
      message: `${entry.kind} entry includes fixture files in package closure`,
      detail: {
        fixtureFileCount: entry.totals.fixtureFileCount,
        fixtureBytes: entry.totals.fixtureBytes
      }
    })
  }
  return failures
}

function dependencyClosure(graph, start) {
  if (!graph.has(start)) {
    return []
  }
  const queue = [start]
  const seen = new Set([start])
  while (queue.length > 0) {
    const current = queue.shift()
    for (const next of graph.get(current) ?? []) {
      if (seen.has(next)) {
        continue
      }
      seen.add(next)
      queue.push(next)
    }
  }
  return [...seen].sort()
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0)
}

function printTextReport(report) {
  console.log("Wanex Distribution Footprint Audit")
  console.log("")
  console.log(`Mode: ${report.mode}`)
  console.log(`Entries: ${report.totals.entries}`)
  console.log(`Workspace packages: ${report.totals.workspacePackages}`)
  console.log(`Failures: ${report.totals.failures}`)
  console.log("")
  for (const entry of report.entries) {
    console.log(`${entry.entry} (${entry.kind})`)
    if (entry.missing.length > 0) {
      console.log(`  missing: ${entry.missing.join(", ")}`)
      continue
    }
    console.log(`  closure packages: ${entry.totals.packageCount}`)
    console.log(`  package bytes: ${formatBytes(entry.totals.packageBytes)}`)
    console.log(`  source bytes: ${formatBytes(entry.totals.sourceBytes)} (${entry.totals.sourceFileCount} files)`)
    console.log(`  fixture bytes: ${formatBytes(entry.totals.fixtureBytes)} (${entry.totals.fixtureFileCount} files)`)
    console.log(`  plugin runtime: ${entry.contains.pluginRuntime ? "yes" : "no"}`)
    console.log(`  connector runtime: ${entry.contains.connectorRuntime ? "yes" : "no"}`)
    console.log(
      `  concrete adapters: ${
        entry.contains.concreteAdapters.length === 0
          ? "none"
          : entry.contains.concreteAdapters.join(", ")
      }`
    )
    console.log(
      `  forbidden closure: ${
        entry.contains.forbiddenPackages.length === 0
          ? "none"
          : entry.contains.forbiddenPackages.join(", ")
      }`
    )
    console.log("  largest packages:")
    for (const packageSummary of entry.largestPackages.slice(0, 5)) {
      console.log(
        `    - ${packageSummary.name}: ${formatBytes(packageSummary.packageBytes)} package, ${formatBytes(packageSummary.sourceBytes)} source`
      )
    }
    console.log("")
  }
  console.log("Failures:")
  if (report.failures.length === 0) {
    console.log("- none")
  } else {
    for (const failure of report.failures) {
      console.log(
        `- [${failure.code}] ${failure.entry}: ${failure.message}`
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
