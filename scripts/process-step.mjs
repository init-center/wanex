import { spawn } from "node:child_process"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"

const require = createRequire(import.meta.url)
const defaultVitestCli = resolvePackageBinary("vitest", "vitest")

export function resolveStepCommand(step, options = {}) {
  const platform = options.platform ?? process.platform
  const env = options.env ?? process.env
  const nodeExecutable = options.nodeExecutable ?? process.execPath

  if (step.command === "node") {
    return {
      command: nodeExecutable,
      args: [...step.args]
    }
  }

  if (step.command === "vitest") {
    return {
      command: nodeExecutable,
      args: [options.vitestCli ?? defaultVitestCli, ...step.args]
    }
  }

  if (step.command === "pnpm" && platform === "win32") {
    const packageManagerCli = options.packageManagerCli ?? env.npm_execpath
    if (!isPnpmJavaScriptCli(packageManagerCli)) {
      throw new Error(
        "Windows repository scripts must run through pnpm so npm_execpath identifies its JavaScript CLI"
      )
    }
    return {
      command: nodeExecutable,
      args: [packageManagerCli, ...step.args]
    }
  }

  return {
    command: step.command,
    args: [...step.args]
  }
}

export function runProcessStep(step, options = {}) {
  const env = options.env ?? process.env
  const resolved = resolveStepCommand(step, {
    env,
    ...(options.platform === undefined ? {} : { platform: options.platform }),
    ...(options.nodeExecutable === undefined
      ? {}
      : { nodeExecutable: options.nodeExecutable }),
    ...(options.packageManagerCli === undefined
      ? {}
      : { packageManagerCli: options.packageManagerCli })
  })
  if (options.log !== false) {
    console.log(`\n==> ${step.name}`)
    console.log(`$ ${step.command} ${step.args.join(" ")}`)
  }
  return new Promise((resolve, reject) => {
    const child = spawn(resolved.command, resolved.args, {
      cwd: options.cwd,
      env,
      stdio: options.stdio ?? "inherit",
      windowsHide: true
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

function isPnpmJavaScriptCli(value) {
  if (typeof value !== "string" || value.length === 0) {
    return false
  }
  return /(?:^|[\\/])pnpm(?:\.[cm]?js)?$/i.test(value)
}

function resolvePackageBinary(packageName, binaryName) {
  const manifestPath = require.resolve(`${packageName}/package.json`)
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
  const bin = typeof manifest.bin === "string"
    ? manifest.bin
    : manifest.bin?.[binaryName]
  if (typeof bin !== "string" || bin.length === 0) {
    throw new Error(`${packageName} does not declare the ${binaryName} binary`)
  }
  return resolve(dirname(manifestPath), bin)
}
