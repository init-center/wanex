#!/usr/bin/env node
import { spawn } from "node:child_process"
import { createRequire } from "node:module"
import { join } from "node:path"
import { runProcessStep } from "../../../scripts/process-step.mjs"
import {
  buildDesktop,
  stageDesktopCredentialArtifact,
  workspaceRoot
} from "./build.mjs"

const DESKTOP_PROOF_ENVIRONMENT_KEYS = [
  "WANEX_DESKTOP_PROOF_RECEIPT",
  "WANEX_DESKTOP_PROOF_NORMAL_SCREENSHOT",
  "WANEX_DESKTOP_PROOF_NARROW_SCREENSHOT",
  "WANEX_DESKTOP_PROOF_USER_DATA",
  "WANEX_DESKTOP_PROOF_PROFILE_ID",
  "WANEX_DESKTOP_PROOF_STEP",
  "WANEX_DESKTOP_PROOF_PROVIDER_BASE_URL",
  "WANEX_DESKTOP_PROOF_PROVIDER_CREDENTIAL",
  "WANEX_DESKTOP_PROOF_EXTENSION_SELECTIONS"
]

if (import.meta.main) {
  try {
    assertCanonicalDesktopStartArgs(process.argv.slice(2))
    await startDesktop()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export function assertCanonicalDesktopStartArgs(args) {
  const normalized = args.filter((arg) => arg !== "--")
  if (normalized.length > 0) {
    throw new Error(`unknown Desktop start argument: ${normalized[0]}`)
  }
}

export function createDesktopStartPlan(options = {}) {
  const root = options.workspaceRoot ?? workspaceRoot
  const platform = options.platform ?? process.platform
  const environment = normalDesktopEnvironment({
    env: options.env ?? process.env,
    serviceBin: join(
      root,
      "target",
      "debug",
      platform === "win32"
        ? "wanex-system-service.exe"
        : "wanex-system-service"
    ),
    credentialDir: join(
      root,
      "target",
      "distribution",
      "desktop",
      "credentials"
    )
  })
  return {
    serviceBuild: {
      name: "System service binary",
      command: "cargo",
      args: ["build", "-p", "wanex-system-service"]
    },
    desktop: {
      command:
        options.electronExecutable ?? resolveWorkspaceElectronExecutable(),
      args: [
        join(
          root,
          "target",
          "distribution",
          "desktop",
          "staging-app"
        )
      ],
      cwd: root,
      env: environment
    }
  }
}

export async function startDesktop(options = {}) {
  const plan = createDesktopStartPlan(options)
  const runStep = options.runStep ?? runProcessStep
  const buildDesktop = options.buildDesktop ?? buildDesktop
  const stageCredentials =
    options.stageCredentials ?? stageDesktopCredentialArtifact
  const runDesktop = options.runDesktop ?? runDesktopChild

  await runStep(plan.serviceBuild, { cwd: plan.desktop.cwd })
  console.log("\n==> Desktop artifacts")
  await Promise.all([buildDesktop(), stageCredentials()])
  console.log("\n==> Wanex Desktop")
  await runDesktop(plan.desktop)
}

export function runDesktopChild(plan, options = {}) {
  const spawnProcess = options.spawnProcess ?? spawn
  const signalTarget = options.signalTarget ?? process
  return new Promise((resolve, reject) => {
    const child = spawnProcess(plan.command, plan.args, {
      cwd: plan.cwd,
      env: plan.env,
      stdio: "inherit",
      windowsHide: true
    })
    const signalHandlers = new Map()
    const cleanup = () => {
      for (const [signal, handler] of signalHandlers) {
        signalTarget.removeListener(signal, handler)
      }
    }
    for (const signal of ["SIGINT", "SIGTERM"]) {
      const handler = () => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill(signal)
        }
      }
      signalHandlers.set(signal, handler)
      signalTarget.once(signal, handler)
    }
    child.once("error", (error) => {
      cleanup()
      reject(error)
    })
    child.once("exit", (code, signal) => {
      cleanup()
      if (code === 0) {
        resolve()
        return
      }
      const detail =
        signal === null ? `exit code ${String(code)}` : `signal ${signal}`
      reject(new Error(`Wanex Desktop failed with ${detail}`))
    })
  })
}

function normalDesktopEnvironment(options) {
  const environment = { ...options.env }
  for (const key of DESKTOP_PROOF_ENVIRONMENT_KEYS) {
    delete environment[key]
  }
  environment.WANEX_SYSTEM_SERVICE_BIN = options.serviceBin
  environment.WANEX_DESKTOP_CREDENTIAL_DIR = options.credentialDir
  return environment
}

function resolveWorkspaceElectronExecutable() {
  const electronExecutable = createRequire(import.meta.url)("electron")
  if (typeof electronExecutable !== "string" || electronExecutable.length === 0) {
    throw new Error("workspace Electron executable is unavailable")
  }
  return electronExecutable
}
