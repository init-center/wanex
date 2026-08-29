#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { findExecutionBoundaryViolations } from "./audit/execution-boundary-policy.mjs"

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const sources = []
await collectSources(join(rootDir, "packages"))
await collectSources(join(rootDir, "apps"))
const violations = findExecutionBoundaryViolations(sources)
const report = {
  sourceCount: sources.length,
  violationCount: violations.length,
  violations
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2))
} else {
  console.log("Wanex Execution Boundary Audit")
  console.log("")
  console.log(`Production sources: ${report.sourceCount}`)
  console.log(`Violations: ${report.violationCount}`)
  for (const violation of violations) {
    console.log(`- [${violation.code}] ${violation.path}: ${violation.message}`)
  }
}
if (violations.length > 0) process.exitCode = 1

async function collectSources(root) {
  const entries = await readdir(root, { withFileTypes: true })
  for (const entry of entries) {
    if (["node_modules", "dist", "build"].includes(entry.name)) continue
    const path = join(root, entry.name)
    if (entry.isDirectory()) {
      await collectSources(path)
      continue
    }
    if (
      entry.isFile() &&
      /\.(?:ts|tsx|mts|cts|js|mjs|cjs)$/u.test(entry.name) &&
      relative(rootDir, path).replaceAll("\\", "/").includes("/src/")
    ) {
      sources.push({
        path: relative(rootDir, path).replaceAll("\\", "/"),
        text: await readFile(path, "utf8")
      })
    }
  }
}
