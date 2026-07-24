#!/usr/bin/env node
import { fileURLToPath } from "node:url"
import { dirname } from "node:path"
import { runProcessStep } from "./process-step.mjs"

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
  await runProcessStep(step, { cwd: rootDir })
}

console.log("\nwanex build passed")
