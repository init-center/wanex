import { spawn } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, resolve, win32 } from "node:path"

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
    if (isPnpmJavaScriptCli(packageManagerCli)) {
      return {
        command: nodeExecutable,
        args: [packageManagerCli, ...step.args]
      }
    }

    const packageManagerPowerShell =
      options.packageManagerPowerShell ??
      resolvePnpmPowerShellScript(
        env,
        packageManagerCli,
        options.fileExists ?? existsSync
      )
    if (packageManagerPowerShell === undefined) {
      throw new Error(
        "Windows repository scripts require a pnpm JavaScript CLI or pnpm.ps1 shim"
      )
    }

    return {
      command:
        options.powerShellExecutable ??
        resolvePowerShellExecutable(env),
      args: [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        packageManagerPowerShell,
        ...step.args
      ]
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
    ...(options.packageManagerPowerShell === undefined
      ? {}
      : { packageManagerPowerShell: options.packageManagerPowerShell }),
    ...(options.powerShellExecutable === undefined
      ? {}
      : { powerShellExecutable: options.powerShellExecutable })
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
  return /(?:^|[\\/])pnpm(?:\.c?js)?$/i.test(value)
}

function resolvePnpmPowerShellScript(env, packageManagerCli, fileExists) {
  const candidates = []
  if (typeof packageManagerCli === "string" && packageManagerCli.length > 0) {
    candidates.push(packageManagerCli.replace(/\.(?:cmd|c?js)$/i, ".ps1"))
  }
  if (typeof env.PNPM_HOME === "string" && env.PNPM_HOME.length > 0) {
    candidates.push(
      win32.join(env.PNPM_HOME, "bin", "pnpm.ps1"),
      win32.join(env.PNPM_HOME, "pnpm.ps1")
    )
  }
  const pathValue = env.Path ?? env.PATH
  if (typeof pathValue === "string") {
    for (const entry of pathValue.split(";")) {
      if (entry.length > 0) {
        candidates.push(win32.join(entry, "pnpm.ps1"))
      }
    }
  }
  return candidates.find((candidate) => fileExists(candidate))
}

function resolvePowerShellExecutable(env) {
  if (typeof env.SystemRoot !== "string" || env.SystemRoot.length === 0) {
    return "powershell.exe"
  }
  return win32.join(
    env.SystemRoot,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe"
  )
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
