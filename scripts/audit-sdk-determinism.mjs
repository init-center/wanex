#!/usr/bin/env node
import { execFile } from "node:child_process"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { promisify } from "node:util"
import { loadSdkDistributionPolicy, workspaceRoot } from "./sdk/distribution-policy.mjs"

const execFileAsync = promisify(execFile)
const policy = await loadSdkDistributionPolicy()
const first = await buildSnapshot()
const second = await buildSnapshot()
const failures = []

if (first.report !== second.report) {
  failures.push("artifacts.json differs between clean builds")
}
for (const [filename, sha256] of first.hashes) {
  if (second.hashes.get(filename) !== sha256) {
    failures.push(`${filename} is not byte-identical between clean builds`)
  }
}

console.log("Wanex Compiled SDK Determinism Audit")
console.log("")
console.log(`Tarballs: ${first.hashes.size}`)
console.log(`Failures: ${failures.length}`)
console.log("")
console.log("Failures:")
if (failures.length === 0) {
  console.log("- none")
} else {
  for (const failure of failures) console.log(`- ${failure}`)
  process.exitCode = 1
}

async function buildSnapshot() {
  await execFileAsync(process.execPath, ["./scripts/build-sdk.mjs"], {
    cwd: workspaceRoot,
    maxBuffer: 20 * 1024 * 1024
  })
  await execFileAsync(process.execPath, ["./scripts/pack-sdk.mjs"], {
    cwd: workspaceRoot,
    maxBuffer: 20 * 1024 * 1024
  })
  const reportPath = join(policy.outputDir, "reports/artifacts.json")
  const report = await readFile(reportPath, "utf8")
  const parsed = JSON.parse(report)
  return {
    report,
    hashes: new Map(parsed.packages.map((item) => [item.filename, item.sha256]))
  }
}
