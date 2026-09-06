#!/usr/bin/env node
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { runProcessStep } from "./process-step.mjs"

const workspaceRoot = dirname(dirname(fileURLToPath(import.meta.url)))

if (import.meta.main) {
  await runDistributionPreflight()
  console.log("\nwanex distribution preflight passed")
}

export function createDistributionPreflightSteps() {
  return [
    {
      name: "Git diff check",
      command: "git",
      args: ["diff", "--check"]
    },
    {
      name: "Server type check",
      command: "pnpm",
      args: ["--filter", "@wanex/server", "check"]
    },
    {
      name: "TUI type check",
      command: "pnpm",
      args: ["--filter", "@wanex/tui", "check"]
    },
    {
      name: "Desktop type check",
      command: "pnpm",
      args: ["check:desktop"]
    },
    {
      name: "Server process lifecycle",
      command: "pnpm",
      args: [
        "exec",
        "vitest",
        "run",
        "apps/server/test/process-config.test.ts",
        "--no-file-parallelism",
        "--maxWorkers=1"
      ]
    },
    {
      name: "Server distribution proof contract",
      command: "pnpm",
      args: ["test:server-distribution-proof"]
    },
    {
      name: "Server distribution proof",
      command: "pnpm",
      args: ["proof:server-distribution"]
    },
    {
      name: "TUI distribution contracts",
      command: "pnpm",
      args: ["test:tui-script"]
    },
    {
      name: "Desktop distribution contracts",
      command: "pnpm",
      args: [
        "exec",
        "vitest",
        "run",
        "apps/desktop/test/packaging-policy.test.mjs",
        "scripts/desktop-distribution-receipt.test.mjs",
        "scripts/audit-host-distribution.test.mjs",
        "--no-file-parallelism",
        "--maxWorkers=1"
      ]
    }
  ]
}

export async function runDistributionPreflight(options = {}) {
  const steps = options.steps ?? createDistributionPreflightSteps()
  for (const step of steps) {
    await runProcessStep(step, {
      cwd: options.cwd ?? workspaceRoot,
      env: options.env ?? process.env
    })
  }
}
