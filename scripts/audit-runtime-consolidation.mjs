#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { findRuntimeConsolidationFailures } from "./audit/runtime-consolidation-policy.mjs"

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const manifests = []
const sources = []

await walk(join(rootDir, "packages"))
await walk(join(rootDir, "apps"))

const failures = findRuntimeConsolidationFailures({ manifests, sources })
const report = {
  manifestCount: manifests.length,
  sourceCount: sources.length,
  failures
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2))
} else {
  console.log("Wanex Runtime Consolidation Audit")
  console.log("")
  console.log(`Manifests: ${report.manifestCount}`)
  console.log(`Sources: ${report.sourceCount}`)
  console.log(`Failures: ${failures.length}`)
  for (const failure of failures) {
    console.log(`- [${failure.code}] ${failure.subject}: ${failure.message}`)
  }
}

if (failures.length > 0) process.exitCode = 1

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    if ([".git", "node_modules", "target"].includes(entry.name)) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      await walk(path)
      continue
    }
    if (!entry.isFile()) continue
    const relPath = relative(rootDir, path).replaceAll("\\", "/")
    if (entry.name === "package.json") {
      const manifest = JSON.parse(await readFile(path, "utf8"))
      if (typeof manifest.name === "string") {
        manifests.push({ name: manifest.name, path: relPath, manifest })
      }
      continue
    }
    if (/\.(?:ts|mts|cts|mjs)$/.test(entry.name)) {
      sources.push({ path: relPath, text: await readFile(path, "utf8") })
    }
  }
}
