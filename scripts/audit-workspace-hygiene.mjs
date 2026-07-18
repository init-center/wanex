#!/usr/bin/env node
import { fileURLToPath } from "node:url"
import { dirname } from "node:path"
import { findGeneratedArtifactFailures } from "./audit/workspace-hygiene/generated-artifact-policy.mjs"
import { findPackageBuildScriptFailures } from "./audit/workspace-hygiene/package-build-script-policy.mjs"
import { findTypeScriptConfigFailures } from "./audit/workspace-hygiene/typescript-config-policy.mjs"

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const json = process.argv.includes("--json")

const failures = [
  ...(await findGeneratedArtifactFailures(rootDir)),
  ...(await findPackageBuildScriptFailures(rootDir)),
  ...(await findTypeScriptConfigFailures(rootDir))
]
const report = {
  generatedAt: new Date().toISOString(),
  root: rootDir,
  failures: failures.sort((left, right) =>
    left.path.localeCompare(right.path) || left.code.localeCompare(right.code)
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

function printTextReport(report) {
  console.log("Wanex Workspace Hygiene Audit")
  console.log("")
  console.log(`Failures: ${report.failures.length}`)
  console.log("")
  console.log("Failures:")
  if (report.failures.length === 0) {
    console.log("- none")
    return
  }
  for (const failure of report.failures) {
    console.log(
      `- [${failure.code}] ${failure.path}: ${failure.message} (${formatBytes(failure.bytes)})`
    )
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  const units = ["KiB", "MiB", "GiB"]
  let value = bytes / 1024
  for (const unit of units) {
    if (value < 1024) {
      return `${value.toFixed(1)} ${unit}`
    }
    value /= 1024
  }
  return `${value.toFixed(1)} TiB`
}
