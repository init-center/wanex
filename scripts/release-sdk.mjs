#!/usr/bin/env node
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { workspaceRoot } from "./sdk/distribution-policy.mjs"

const execFileAsync = promisify(execFile)
const steps = [
  ["Build compiled staging", "./scripts/build-sdk.mjs"],
  ["Pack deterministic tarballs", "./scripts/pack-sdk.mjs"],
  ["Audit compiled artifacts", "./scripts/audit-sdk-artifacts.mjs"],
  ["Check public API reports", "./scripts/generate-sdk-api-reports.mjs"],
  ["Validate package resolvers", "./scripts/validate-sdk-packages.mjs"],
  ["Smoke external consumer", "./scripts/smoke-sdk-external.mjs"]
]

for (const [name, script] of steps) {
  console.log(`\n==> ${name}`)
  const result = await execFileAsync(process.execPath, [script], {
    cwd: workspaceRoot,
    maxBuffer: 30 * 1024 * 1024
  })
  process.stdout.write(result.stdout)
  process.stderr.write(result.stderr)
}

console.log("\nWanex SDK release proof passed")
