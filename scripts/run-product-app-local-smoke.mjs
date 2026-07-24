#!/usr/bin/env node
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { runProcessStep } from "./process-step.mjs"

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const appDir = join(rootDir, "apps/product-app-local")

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const smoke = await createProductAppLocalSmokeRun({
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

export async function createProductAppLocalSmokeRun(options) {
  const forwardedArgs = normalizeForwardedArgs(options.forwardedArgs ?? [])
  const usesStoreDir = hasFlag(forwardedArgs, "store-dir")
  const usesProfileRoot = hasFlag(forwardedArgs, "profile-root")
  const usesProfileId = hasFlag(forwardedArgs, "profile-id")
  const usesSmoke = hasFlag(forwardedArgs, "smoke")
  const usesSetupProvider = hasFlag(forwardedArgs, "setup-provider")
  if (usesSmoke && usesSetupProvider) {
    throw new Error("Product App Local one-shot runner cannot combine smoke and setup-provider")
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

  defaultCliArgs.push(
    "--poll-interval-ms",
    "0",
    "--summary-format",
    "json"
  )
  if (!usesSmoke && !usesSetupProvider) {
    defaultCliArgs.push("--smoke")
  }

  return {
    cleanupDir,
    step: {
      name: usesSetupProvider
        ? "Product App Local provider setup"
        : "Product App Local smoke",
      command: "pnpm",
      args: [
        "--silent",
        "--dir",
        appDir,
        "exec",
        "tsx",
        "./src/main.ts",
        ...defaultCliArgs,
        ...forwardedArgs
      ]
    }
  }
}

export async function createSmokeTempRoot() {
  return mkdtemp(join(tmpdir(), "wanex-product-app-local-smoke-"))
}

function normalizeForwardedArgs(args) {
  return args.filter((arg) => arg !== "--")
}

function hasFlag(args, flagName) {
  return args.some((arg) => arg === `--${flagName}`)
}
