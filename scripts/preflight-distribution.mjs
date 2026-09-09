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
  const targetId = `${process.platform}-${process.arch}`
  const desktopHost = process.platform === "darwin" || process.platform === "win32"
  const tuiProof = process.platform === "linux"
    ? {
        name: "Installed TUI distribution proof",
        command: "node",
        args: [
          "scripts/run-linux-keyring-session.mjs",
          "pnpm",
          "proof:tui",
          "--",
          "--native-artifact-dir",
          "target/distribution/native"
        ]
      }
    : {
        name: "Installed TUI distribution proof",
        command: "pnpm",
        args: [
          "proof:tui",
          "--",
          "--native-artifact-dir",
          "target/distribution/native"
        ]
      }
  const steps = [
    {
      name: "Git diff check",
      command: "git",
      args: ["diff", "--check"]
    },
    {
      name: "Staged diff check",
      command: "git",
      args: ["diff", "--cached", "--check"]
    },
    {
      name: "Distribution preflight tests",
      command: "pnpm",
      args: ["test:preflight-distribution"]
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
      name: "Current Desktop ASAR",
      command: "node",
      args: ["apps/desktop/scripts/preflight.mjs"]
    },
    {
      name: "TUI package distribution",
      command: "pnpm",
      args: ["--filter", "@wanex/tui", "exec", "vitest", "run", "test/distribution.test.mjs", "--maxWorkers=1"]
    },
    {
      name: "System Service binary",
      command: "cargo",
      args: ["build", "-p", "wanex-system-service"]
    },
    {
      name: "Server process lifecycle",
      command: "pnpm",
      args: [
        "exec",
        "vitest",
        "run",
        "apps/server/test/process-config.test.ts",
        "scripts/build-server-distribution.test.mjs",
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
      args: ["proof:server-distribution", "--", "--target", targetId]
    },
    {
      name: "TUI distribution contracts",
      command: "pnpm",
      args: ["test:tui-script"]
    }
  ]
  if (desktopHost) {
    steps.push(
      {
        name: "Electron artifact preparation",
        command: "pnpm",
        args: ["--filter", "@wanex/desktop", "prepare:electron"]
      },
      {
        name: "Installed Desktop proof",
        command: "pnpm",
        args: ["proof:desktop"]
      }
    )
  }
  steps.push({
    name: "Native Runtime proof",
    command: "pnpm",
    args: ["proof:native-runtime", "--", "--artifact-dir", "target/distribution/native"]
  })
  steps.push(tuiProof)
  if (desktopHost) {
    steps.push({
      name: "Desktop distribution receipt",
      command: "pnpm",
      args: ["proof:desktop-distribution", "--", "--target", targetId]
    })
  }
  steps.push({
    name: "Desktop distribution contracts",
    command: "pnpm",
    args: [
      "exec",
      "vitest",
      "run",
      "apps/desktop/test/packaging-policy.test.mjs",
      "apps/desktop/test/bundle-preflight.test.mjs",
      "apps/desktop/test/startup.test.ts",
      "scripts/desktop-distribution-receipt.test.mjs",
      "scripts/audit-host-distribution.test.mjs",
      "--no-file-parallelism",
      "--maxWorkers=1"
    ]
  })
  const auditArgs = ["audit:host-distribution", "--", "--target", targetId]
  if (desktopHost) {
    auditArgs.push(
      "--tui-receipt",
      "target/distribution/tui/installed-proof.json",
      "--desktop-distribution-receipt",
      "target/distribution/desktop/desktop-distribution-receipt.json"
    )
  } else {
    auditArgs.push("--tui-receipt", "target/distribution/tui/installed-proof.json")
  }
  steps.push({
    name: "Host distribution audit",
    command: "pnpm",
    args: auditArgs
  })
  return steps
}

export async function runDistributionPreflight(options = {}) {
  const steps = createDistributionPreflightSteps()
  for (const step of steps) {
    await runProcessStep(step, {
      cwd: options.cwd ?? workspaceRoot,
      env: options.env ?? process.env
    })
  }
}
