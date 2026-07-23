#!/usr/bin/env node
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
if (process.argv[1] === fileURLToPath(import.meta.url)) {
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
      name: "Electron boundary typecheck",
      command: "pnpm",
      args: ["check:electron-boundary"]
    },
    {
      name: "Electron boundary policy tests",
      command: "pnpm",
      args: ["test:electron-boundary"]
    },
    {
      name: "Product App Web demo tests",
      command: "pnpm",
      args: ["test:product-app-web-demo"]
    },
    {
      name: "Product App Local smoke script tests",
      command: "pnpm",
      args: ["test:product-app-local-smoke-script"]
    },
    {
      name: "Product App TUI demo script tests",
      command: "pnpm",
      args: ["test:product-app-tui-demo-script"]
    },
    {
      name: "Verify script tests",
      command: "pnpm",
      args: ["test:verify-script"]
    },
    {
      name: "Test runner tests",
      command: "pnpm",
      args: ["test:runner"]
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
      command: "pnpm",
      args: [
        "--filter",
        "@wanex/eval-harness",
        "eval",
        "--",
        "--service-bin",
        "../../target/debug/wanex-system-service",
        "--plugin-host-fixture",
        "../plugin/test/fixtures/plugin-host-fixture.mjs"
      ]
    }
  ]
}

export async function runVerify() {
  for (const step of createVerifySteps()) {
    await runStep(step)
  }
}

function runStep(step) {
  console.log(`\n==> ${step.name}`)
  console.log(`$ ${step.command} ${step.args.join(" ")}`)
  return new Promise((resolve, reject) => {
    const child = spawn(step.command, step.args, {
      cwd: rootDir,
      stdio: "inherit",
      shell: process.platform === "win32"
    })
    child.on("error", reject)
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }
      const detail =
        signal === null ? `exit code ${String(code)}` : `signal ${signal}`
      reject(new Error(`${step.name} failed with ${detail}`))
    })
  })
}
