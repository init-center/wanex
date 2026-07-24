#!/usr/bin/env node
import { execFile } from "node:child_process"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { promisify } from "node:util"
import { resolvePackageBinary } from "./process-step.mjs"
import { loadSdkDistributionPolicy, workspaceRoot } from "./sdk/distribution-policy.mjs"

const execFileAsync = promisify(execFile)
const policy = await loadSdkDistributionPolicy()
const report = JSON.parse(await readFile(
  join(policy.outputDir, "reports/artifacts.json"),
  "utf8"
))
const failures = []

for (const artifact of report.packages) {
  const tarball = join(policy.outputDir, "tarballs", artifact.filename)
  for (const validation of [
    {
      name: "publint",
      command: process.execPath,
      args: [
        resolvePackageBinary("publint", "publint"),
        "run",
        tarball,
        "--strict"
      ]
    },
    {
      name: "attw",
      command: process.execPath,
      args: [
        resolvePackageBinary("@arethetypeswrong/cli", "attw"),
        tarball,
        "--profile",
        "esm-only",
        "--quiet"
      ]
    }
  ]) {
    try {
      await execFileAsync(validation.command, validation.args, {
        cwd: workspaceRoot,
        maxBuffer: 10 * 1024 * 1024
      })
    } catch (error) {
      failures.push({
        package: artifact.name,
        validator: validation.name,
        message: error.stderr || error.stdout || error.message
      })
    }
  }
  console.log(`${artifact.name}: publint + attw`)
}

console.log(`SDK package validation failures: ${failures.length}`)
if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`${failure.package} ${failure.validator}: ${failure.message}`)
  }
  process.exitCode = 1
}
