#!/usr/bin/env node
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { dirname } from "node:path"

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))

if (process.argv[1] === fileURLToPath(import.meta.url)) {
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
    await runStep(step, env)
  }
}

function runStep(step, parentEnv) {
  const env = {
    ...parentEnv,
    ...(step.env ?? {})
  }
  console.log(`\n==> ${step.name}`)
  console.log(`$ ${step.command} ${step.args.join(" ")}`)
  return new Promise((resolve, reject) => {
    const child = spawn(step.command, step.args, {
      cwd: rootDir,
      env,
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
