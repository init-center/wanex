#!/usr/bin/env node
import { spawn } from "node:child_process"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runEvalHarness(process.argv.slice(2))
}

export function createEvalHarnessStep(
  forwardedArgs = [],
  platform = process.platform
) {
  const executable = platform === "win32"
    ? "wanex-system-service.exe"
    : "wanex-system-service"
  return {
    name: "Eval harness CLI smoke",
    command: "pnpm",
    args: [
      "--filter",
      "@wanex/eval-harness",
      "eval",
      "--",
      "--service-bin",
      `../../target/debug/${executable}`,
      "--plugin-host-fixture",
      "../plugin/test/fixtures/plugin-host-fixture.mjs",
      ...forwardedArgs.filter((arg) => arg !== "--")
    ]
  }
}

export async function runEvalHarness(forwardedArgs = []) {
  await runStep(createEvalHarnessStep(forwardedArgs))
}

function runStep(step) {
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
