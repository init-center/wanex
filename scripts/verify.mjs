#!/usr/bin/env node
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { runProcessStep } from "./process-step.mjs"

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
if (import.meta.main) {
  parseVerifyArgs(process.argv.slice(2))
  await runVerify()
  console.log("\nwanex verify passed")
}

export function parseVerifyArgs(args) {
  for (const arg of args) {
    throw new Error(`unknown verify argument: ${arg}`)
  }
}

export function createVerifySteps() {
  return [
    {
      name: "Toolchain doctor",
      command: "pnpm",
      args: ["doctor:toolchain"]
    },
    {
      name: "Toolchain doctor tests",
      command: "pnpm",
      args: ["test:toolchain-doctor"]
    },
    {
      name: "Test runner tests",
      command: "pnpm",
      args: ["test:runner"]
    },
    {
      name: "Verify script tests",
      command: "pnpm",
      args: ["test:verify-script"]
    },
    {
      name: "Public contract audit tests",
      command: "pnpm",
      args: ["test:public-contract-audit"]
    },
    {
      name: "Workspace hygiene audit tests",
      command: "pnpm",
      args: ["test:workspace-hygiene-audit"]
    },
    {
      name: "Package packlist audit tests",
      command: "pnpm",
      args: ["test:package-packlist-audit"]
    },
    {
      name: "Package governance audit tests",
      command: "pnpm",
      args: ["test:package-governance-audit"]
    },
    {
      name: "Facade footprint audit tests",
      command: "pnpm",
      args: ["test:facade-footprint-audit"]
    },
    {
      name: "Execution boundary audit tests",
      command: "pnpm",
      args: ["test:execution-boundary-audit"]
    },
    {
      name: "SDK distribution tests",
      command: "pnpm",
      args: ["test:sdk-distribution"]
    },
    {
      name: "Storage RPC ownership audit tests",
      command: "pnpm",
      args: ["test:storage-rpc-ownership-audit"]
    },
    {
      name: "Storage RPC schema tests",
      command: "pnpm",
      args: ["test:storage-rpc-schema"]
    },
    {
      name: "Storage RPC schema migration policy tests",
      command: "pnpm",
      args: ["test:storage-rpc-schema-migration-policy"]
    },
    {
      name: "Workspace hygiene audit",
      command: "pnpm",
      args: ["audit:workspace-hygiene"]
    },
    {
      name: "Public contract audit",
      command: "pnpm",
      args: ["audit:public-contracts"]
    },
    {
      name: "Package governance audit",
      command: "pnpm",
      args: ["audit:package-governance"]
    },
    {
      name: "Storage RPC ownership audit",
      command: "pnpm",
      args: ["audit:storage-rpc-ownership"]
    },
    {
      name: "Storage static boundary audit",
      command: "pnpm",
      args: ["audit:storage-boundary"]
    },
    {
      name: "Execution boundary audit",
      command: "pnpm",
      args: ["audit:execution-boundaries"]
    },
    {
      name: "Storage RPC generation audit",
      command: "pnpm",
      args: ["audit:storage-rpc-generation"]
    },
    {
      name: "Structure audit",
      command: "pnpm",
      args: ["audit:structure"]
    },
    {
      name: "Distribution audit",
      command: "pnpm",
      args: ["audit:distribution"]
    },
    {
      name: "Distribution graph audit",
      command: "node",
      args: ["./scripts/audit-distribution-graph.mjs", "--enforce"]
    },
    {
      name: "Distribution footprint audit",
      command: "node",
      args: ["./scripts/audit-distribution-footprint.mjs", "--enforce"]
    },
    {
      name: "Facade static footprint audit",
      command: "pnpm",
      args: ["audit:facade-footprint"]
    },
    {
      name: "Package packlist audit",
      command: "pnpm",
      args: ["audit:package-packlist"]
    },
    {
      name: "TypeScript package checks",
      command: "pnpm",
      args: ["check"]
    },
    {
      name: "TypeScript package tests",
      command: "pnpm",
      args: ["test"]
    },
    {
      name: "Native artifact staging tests",
      command: "pnpm",
      args: ["test:native-artifact"]
    },
    {
      name: "Native Runtime proof tests",
      command: "pnpm",
      args: ["test:native-runtime-proof"]
    },
    {
      name: "Host distribution budget tests",
      command: "pnpm",
      args: ["test:host-distribution-budget"]
    },
    {
      name: "Desktop distribution receipt tests",
      command: "pnpm",
      args: ["test:desktop-distribution-receipt"]
    },
    {
      name: "Assistant Host smoke script tests",
      command: "pnpm",
      args: ["test:assistant-host-smoke-script"]
    },
    {
      name: "TUI demo script tests",
      command: "pnpm",
      args: ["test:tui-script"]
    },
    {
      name: "Compiled SDK release proof",
      command: "pnpm",
      args: ["release:sdk"]
    },
    {
      name: "Packed SDK runtime consumer proofs",
      command: "pnpm",
      args: ["proof:sdk-consumers"]
    },
    {
      name: "Installed TUI proof",
      command: "pnpm",
      args: ["proof:tui"]
    },
    {
      name: "Compiled SDK determinism audit",
      command: "pnpm",
      args: ["audit:sdk-determinism"]
    },
    {
      name: "Rust formatting",
      command: "cargo",
      args: ["fmt", "--", "--check"]
    },
    {
      name: "Rust tests",
      command: "cargo",
      args: ["test"]
    },
    {
      name: "Rust clippy",
      command: "cargo",
      args: ["clippy", "--all-targets", "--", "-D", "warnings"]
    },
    {
      name: "Eval harness CLI smoke",
      command: "node",
      args: ["./scripts/run-eval-harness.mjs"]
    }
  ]
}

export async function runVerify() {
  for (const step of createVerifySteps()) {
    await runProcessStep(step, { cwd: rootDir })
  }
}
