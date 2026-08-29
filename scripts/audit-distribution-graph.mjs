#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { repositoryRelativePath } from "./audit/repository-path.mjs"

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const json = process.argv.includes("--json")
const enforce = process.argv.includes("--enforce")

const coldEntries = [
  "@wanex/cli",
  "@wanex/runtime",
  "@wanex/app"
]
const forbiddenPackages = [
  "@wanex/plugin",
  "@wanex/connector",
  "@wanex/workspace"
]

const manifests = await readWorkspaceManifests(rootDir)
const graph = buildWorkspaceGraph(manifests)
const violations = []

for (const entry of coldEntries) {
  for (const forbidden of forbiddenPackages) {
    const path = findDependencyPath(graph, entry, forbidden)
    if (path !== undefined) {
      violations.push({
        entry,
        forbidden,
        path,
        code: "forbidden-transitive-cold-path-dependency"
      })
    }
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  mode: enforce ? "enforce" : "report",
  coldEntries,
  forbiddenPackages,
  violations
}

if (json) {
  console.log(JSON.stringify(report, null, 2))
} else {
  console.log("Wanex Distribution Graph Audit")
  console.log("")
  console.log(`Mode: ${report.mode}`)
  console.log(`Cold entries: ${coldEntries.length}`)
  console.log(`Forbidden packages: ${forbiddenPackages.length}`)
  console.log(`Violations: ${violations.length}`)
  console.log("")
  console.log("Violations:")
  if (violations.length === 0) {
    console.log("- none")
  } else {
    for (const violation of violations) {
      console.log(
        `- [${violation.code}] ${violation.entry} -> ${violation.forbidden}: ${violation.path.join(" -> ")}`
      )
    }
  }
}

if (enforce && violations.length > 0) {
  process.exitCode = 1
}

async function readWorkspaceManifests(root) {
  const manifests = new Map()
  for (const packageJsonPath of await findPackageJsons(root)) {
    const manifest = JSON.parse(await readFile(packageJsonPath, "utf8"))
    if (typeof manifest.name !== "string" || !manifest.name.startsWith("@wanex/")) {
      continue
    }
    manifests.set(manifest.name, {
      name: manifest.name,
      path: repositoryRelativePath(root, packageJsonPath),
      dependencies: Object.keys({
        ...(manifest.dependencies ?? {}),
        ...(manifest.optionalDependencies ?? {})
      })
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
      manifest.dependencies.filter((dependency) => manifests.has(dependency)).sort()
    )
  }
  return graph
}

function findDependencyPath(graph, start, target) {
  if (!graph.has(start) || !graph.has(target)) {
    return undefined
  }
  const queue = [[start]]
  const seen = new Set([start])
  while (queue.length > 0) {
    const path = queue.shift()
    const current = path[path.length - 1]
    if (current === target) {
      return path
    }
    for (const next of graph.get(current) ?? []) {
      if (seen.has(next)) {
        continue
      }
      seen.add(next)
      queue.push([...path, next])
    }
  }
  return undefined
}
