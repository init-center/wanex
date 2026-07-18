#!/usr/bin/env node
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { dirname } from "node:path"

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))

const steps = [
  {
    name: "TypeScript package checks",
    command: "pnpm",
    args: ["check"]
  },
  {
    name: "Compiled SDK staging",
    command: "node",
    args: ["./scripts/build-sdk.mjs"]
  },
  {
    name: "System service binary",
    command: "cargo",
    args: ["build", "-p", "wanex-system-service"]
  }
]

for (const step of steps) {
  await runStep(step)
}

console.log("\nwanex build passed")

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
