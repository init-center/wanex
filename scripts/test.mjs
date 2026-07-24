#!/usr/bin/env node
import { fileURLToPath } from "node:url"
import { dirname } from "node:path"
import { runProcessStep } from "./process-step.mjs"

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))

if (import.meta.main) {
  await runWorkspaceTests({
    env: process.env,
    vitestArgs: process.argv.slice(2)
  })
  console.log("\nwanex package tests passed")
}

export function createWorkspaceTestSteps(options = {}) {
  const vitestArgs = options.vitestArgs ?? []
  return [
    {
      name: "System service binary",
      command: "cargo",
      args: ["build", "-p", "wanex-system-service"]
    },
    {
      name: "Package tests",
      command: "pnpm",
      args: [
        "-r",
        "--if-present",
        "--workspace-concurrency=1",
        "test",
        ...vitestArgs
      ],
      env: {
        WANEX_SKIP_SYSTEM_SERVICE_BUILD: "1"
      }
    }
  ]
}

export async function runWorkspaceTests(options = {}) {
  const env = options.env ?? process.env
  const vitestArgs = options.vitestArgs ?? []

  for (const step of createWorkspaceTestSteps({ vitestArgs })) {
    await runProcessStep(step, {
      cwd: rootDir,
      env: {
        ...env,
        ...(step.env ?? {})
      }
    })
  }
}
