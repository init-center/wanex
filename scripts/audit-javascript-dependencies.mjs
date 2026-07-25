#!/usr/bin/env node
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { resolveStepCommand } from "./process-step.mjs"
import { workspaceRoot } from "./sdk/distribution-policy.mjs"

const execFileAsync = promisify(execFile)
const steps = [
  ["Production dependency audit", ["audit", "--prod"]],
  ["Complete dependency audit", ["audit"]]
]

for (const [name, args] of steps) {
  process.stdout.write(`\n==> ${name}\n`)
  const command = resolveStepCommand({ command: "pnpm", args })
  const result = await execFileAsync(command.command, command.args, {
    cwd: workspaceRoot,
    maxBuffer: 20 * 1024 * 1024
  })
  process.stdout.write(result.stdout)
  process.stderr.write(result.stderr)
}

process.stdout.write("\nJavaScript dependency audits passed\n")
