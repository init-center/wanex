#!/usr/bin/env node
import { spawn } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const appDir = join(rootDir, "apps/product-app-tui")

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const demo = await createProductAppTuiDemoRun({
    forwardedArgs: process.argv.slice(2),
    env: process.env,
    createTempRoot: createProductAppTuiDemoTempRoot
  })
  try {
    await runStep(demo.step)
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
    env.WANEX_SERVICE_BIN ??
    join(rootDir, "target/debug/wanex-system-service")

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

function runStep(step) {
  return new Promise((resolve, reject) => {
    const child = spawn(step.command, step.args, {
      cwd: rootDir,
      env: {
        ...process.env,
        ...step.env
      },
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
