#!/usr/bin/env node
import { fileURLToPath } from "node:url"
import { dirname } from "node:path"
import { runProcessStep } from "./process-step.mjs"

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const defaultWorkspaceConcurrency = 2

if (import.meta.main) {
  await runWorkspaceTests({
    env: process.env,
    vitestArgs: process.argv.slice(2)
  })
  console.log("\nwanex package tests passed")
}

export function createWorkspaceTestSteps(options = {}) {
  const workspaceConcurrency = options.workspaceConcurrency ??
    defaultWorkspaceConcurrency
  assertPositiveInteger(workspaceConcurrency, "workspace test concurrency")
  const vitestArgs = options.vitestArgs ?? []
  const parallelVitestArgs = withDefaultPackageWorkerLimit(vitestArgs)
  return [
    {
      name: "System service binary",
      command: "cargo",
      args: ["build", "-p", "wanex-system-service"]
    },
    {
      name: "Runtime package tests",
      command: "pnpm",
      args: [
        "--filter",
        "@wanex/runtime",
        "test",
        ...vitestArgs
      ],
      env: {
        WANEX_SKIP_SYSTEM_SERVICE_BUILD: "1"
      }
    },
    {
      name: "Assistant Host package tests",
      command: "pnpm",
      args: [
        "--filter",
        "@wanex/assistant-host",
        "test",
        ...parallelVitestArgs
      ],
      env: {
        WANEX_SKIP_SYSTEM_SERVICE_BUILD: "1"
      }
    },
    {
      name: "Remote Host TLS conformance",
      command: "pnpm",
      args: ["test:remote-host-conformance"],
      env: {
        WANEX_SKIP_SYSTEM_SERVICE_BUILD: "1"
      }
    },
    {
      name: "Parallel package tests",
      command: "pnpm",
      args: [
        "-r",
        "--filter",
        "!@wanex/runtime",
        "--filter",
        "!@wanex/assistant-host",
        "--if-present",
        `--workspace-concurrency=${workspaceConcurrency}`,
        "test",
        ...parallelVitestArgs
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
  const workspaceConcurrency = parseWorkspaceTestConcurrency(
    env.WANEX_TEST_CONCURRENCY
  )

  for (const step of createWorkspaceTestSteps({
    vitestArgs,
    workspaceConcurrency
  })) {
    await runProcessStep(step, {
      cwd: rootDir,
      env: {
        ...env,
        ...(step.env ?? {})
      }
    })
  }
}

export function parseWorkspaceTestConcurrency(value) {
  if (value === undefined || value === "") return defaultWorkspaceConcurrency
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error("WANEX_TEST_CONCURRENCY must be a positive integer")
  }
  return Number.parseInt(value, 10)
}

function withDefaultPackageWorkerLimit(vitestArgs) {
  if (vitestArgs.some((arg) =>
    arg === "--maxWorkers" || arg.startsWith("--maxWorkers=")
  )) {
    return [...vitestArgs]
  }
  return ["--maxWorkers=1", ...vitestArgs]
}

function assertPositiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`)
  }
}
