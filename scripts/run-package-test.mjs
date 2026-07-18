#!/usr/bin/env node
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { dirname } from "node:path"

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runPackageTest({
    env: process.env,
    vitestArgs: process.argv.slice(2)
  })
}

export function createPackageTestSteps(options = {}) {
  const skipSystemServiceBuild = options.skipSystemServiceBuild ?? false
  const vitestArgs = options.vitestArgs ?? []
  const steps = []

  if (!skipSystemServiceBuild) {
    steps.push({
      name: "System service binary",
      command: "cargo",
      args: ["build", "-p", "wanex-system-service"]
    })
  }

  steps.push({
    name: "Package Vitest",
    command: "vitest",
    args: ["run", ...vitestArgs]
  })

  return steps
}

export async function runPackageTest(options = {}) {
  const env = options.env ?? process.env
  const vitestArgs = options.vitestArgs ?? []
  const packageDir = options.packageDir ?? process.cwd()
  const skipSystemServiceBuild = env.WANEX_SKIP_SYSTEM_SERVICE_BUILD === "1"

  for (const step of createPackageTestSteps({
    skipSystemServiceBuild,
    vitestArgs
  })) {
    await runStep(step, env, step.command === "cargo" ? rootDir : packageDir)
  }
}

function runStep(step, env, cwd) {
  console.log(`\n==> ${step.name}`)
  console.log(`$ ${step.command} ${step.args.join(" ")}`)
  return new Promise((resolve, reject) => {
    const child = spawn(step.command, step.args, {
      cwd,
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
