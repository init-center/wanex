#!/usr/bin/env node
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { runProcessStep } from "./process-step.mjs"

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const appDir = join(rootDir, "apps/assistant-host")
const modelEndpointFlags = [
  "model-endpoint-id",
  "provider-connection-id",
  "provider-protocol",
  "provider-id",
  "provider-model-id",
  "model-operations",
  "model-input-modalities",
  "model-output-modalities",
  "model-features",
  "model-reasoning-replay",
  "provider-base-url",
  "provider-secret-ref",
  "model-endpoints-file",
  "model-endpoints-json",
  "active-model-endpoint-id"
]

if (import.meta.main) {
  const smoke = await createAssistantHostSmokeRun({
    forwardedArgs: process.argv.slice(2),
    createTempRoot: createSmokeTempRoot
  })
  try {
    await runProcessStep(smoke.step, { cwd: rootDir })
  } finally {
    if (smoke.cleanupDir !== undefined) {
      await rm(smoke.cleanupDir, { recursive: true, force: true })
    }
  }
}

export async function createAssistantHostSmokeRun(options) {
  const forwardedArgs = normalizeForwardedArgs(options.forwardedArgs ?? [])
  const usesStoreDir = hasFlag(forwardedArgs, "store-dir")
  const usesProfileRoot = hasFlag(forwardedArgs, "profile-root")
  const usesProfileId = hasFlag(forwardedArgs, "profile-id")
  const usesSmoke = hasFlag(forwardedArgs, "smoke")
  const usesSetupProvider = hasFlag(forwardedArgs, "setup-provider")
  const configuresModelEndpoint = modelEndpointFlags.some((flag) =>
    hasFlag(forwardedArgs, flag)
  )
  if (usesSmoke && usesSetupProvider) {
    throw new Error("Assistant Host one-shot runner cannot combine smoke and setup-provider")
  }
  const defaultCliArgs = []
  let cleanupDir

  if (!usesStoreDir && !usesProfileRoot) {
    const tempRoot = await options.createTempRoot()
    cleanupDir = tempRoot
    defaultCliArgs.push("--profile-root", tempRoot)
  }
  if (!usesStoreDir && !usesProfileId) {
    defaultCliArgs.push("--profile-id", "smoke")
  }

  defaultCliArgs.push("--summary-format", "json")
  if (!usesSmoke && !usesSetupProvider) {
    defaultCliArgs.push("--smoke")
  }
  if (!usesSetupProvider && !configuresModelEndpoint) {
    defaultCliArgs.push(
      "--model-endpoint-id",
      "assistant-host-smoke",
      "--provider-protocol",
      "fake",
      "--provider-id",
      "fake",
      "--provider-model-id",
      "assistant-host-smoke-model",
      "--active-model-endpoint-id",
      "assistant-host-smoke"
    )
  }

  return {
    cleanupDir,
    step: {
      name: usesSetupProvider
        ? "Assistant Host provider setup"
        : "Assistant Host smoke",
      command: "pnpm",
      args: [
        "--silent",
        "--dir",
        appDir,
        "exec",
        "tsx",
        "./src/cli/main.ts",
        ...defaultCliArgs,
        ...forwardedArgs
      ]
    }
  }
}

export async function createSmokeTempRoot() {
  return mkdtemp(join(tmpdir(), "wanex-assistant-host-smoke-"))
}

function normalizeForwardedArgs(args) {
  return args.filter((arg) => arg !== "--")
}

function hasFlag(args, flagName) {
  return args.some((arg) => arg === `--${flagName}`)
}
