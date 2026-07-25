import { spawn } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { findPackageJSON } from "node:module"
import { dirname, resolve } from "node:path"

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
      args: [
        options.vitestCli ?? resolvePackageBinary("vitest", "vitest"),
        ...step.args
      ]
    }
  }

  if (step.command === "pnpm") {
    const packageManagerCli = options.packageManagerCli ?? env.npm_execpath
    if (isPnpmJavaScriptCli(packageManagerCli)) {
      return {
        command: nodeExecutable,
        args: [packageManagerCli, ...step.args]
      }
    }
    if (platform === "win32") {
      throw new Error(
        "Windows repository scripts must run through pnpm so npm_execpath identifies its JavaScript CLI"
      )
    }
  }

  if (step.command === "npm" && platform === "win32") {
    const npmCli =
      options.npmCli ??
      resolveBundledNpmCli({ env, nodeExecutable })
    if (!isNpmJavaScriptCli(npmCli)) {
      throw new Error(
        "Windows npm steps must run through the npm JavaScript CLI bundled with Node"
      )
    }
    return {
      command: nodeExecutable,
      args: [npmCli, ...step.args]
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
      : { packageManagerCli: options.packageManagerCli }),
    ...(options.npmCli === undefined ? {} : { npmCli: options.npmCli })
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

function isNpmJavaScriptCli(value) {
  if (typeof value !== "string" || value.length === 0) {
    return false
  }
  return /(?:^|[\\/])npm-cli\.js$/i.test(value)
}

function resolveBundledNpmCli(options) {
  const nodeDir = dirname(options.nodeExecutable)
  const candidates = [
    options.env.npm_execpath,
    resolve(nodeDir, "node_modules/npm/bin/npm-cli.js"),
    resolve(nodeDir, "../lib/node_modules/npm/bin/npm-cli.js")
  ]
  const npmCli = candidates.find(
    (candidate) => isNpmJavaScriptCli(candidate) && existsSync(candidate)
  )
  if (npmCli === undefined) {
    throw new Error(
      "Windows npm steps require the npm JavaScript CLI bundled with the active Node installation"
    )
  }
  return npmCli
}

export function resolvePackageBinary(packageName, binaryName) {
  const manifestPath = findPackageJSON(packageName, import.meta.url)
  if (manifestPath === undefined) {
    throw new Error(`cannot locate the ${packageName} package manifest`)
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
  const bin = typeof manifest.bin === "string"
    ? manifest.bin
    : manifest.bin?.[binaryName]
  if (typeof bin !== "string" || bin.length === 0) {
    throw new Error(`${packageName} does not declare the ${binaryName} binary`)
  }
  return resolve(dirname(manifestPath), bin)
}
