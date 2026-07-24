#!/usr/bin/env node
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { runProcessStep } from "./process-step.mjs"

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))

if (import.meta.main) {
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
  await runProcessStep(createEvalHarnessStep(forwardedArgs), {
    cwd: rootDir,
    log: false
  })
}
