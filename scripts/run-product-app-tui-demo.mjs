#!/usr/bin/env node
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { runProcessStep } from "./process-step.mjs"

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const appDir = join(rootDir, "apps/product-app-tui")

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const demo = await createProductAppTuiDemoRun({
    forwardedArgs: process.argv.slice(2),
    env: process.env,
    createTempRoot: createProductAppTuiDemoTempRoot
  })
  try {
    await runProcessStep(demo.step, {
      cwd: rootDir,
      env: {
        ...process.env,
        ...demo.step.env
      }
    })
  } finally {
    if (demo.cleanupDir !== undefined) {
      await rm(demo.cleanupDir, { recursive: true, force: true })
    }
  }
}

export async function createProductAppTuiDemoRun(options) {
  const env = options.env ?? {}
  const forwardedArgs = normalizeForwardedArgs(options.forwardedArgs ?? [])
  const explicitStoreDir = env.WANEX_STORE_DIR
  const storeDir = explicitStoreDir ?? await options.createTempRoot()
  const serviceBin =
    env.WANEX_SYSTEM_SERVICE_BIN ??
    join(rootDir, `target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`)

  return {
    cleanupDir: explicitStoreDir === undefined ? storeDir : undefined,
    step: {
      name: "Product App TUI demo",
      command: "pnpm",
      args: [
        "--silent",
        "--dir",
        appDir,
        "exec",
        "tsx",
        "./src/main.ts",
        ...forwardedArgs
      ],
      env: {
        WANEX_STORE_DIR: storeDir,
        WANEX_SYSTEM_SERVICE_BIN: serviceBin
      }
    }
  }
}

export async function createProductAppTuiDemoTempRoot() {
  return mkdtemp(join(tmpdir(), "wanex-product-app-tui-demo-"))
}

function normalizeForwardedArgs(args) {
  return args.filter((arg) => arg !== "--")
}
