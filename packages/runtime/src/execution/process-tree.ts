import { spawn } from "node:child_process"
import type { ChildProcessWithoutNullStreams } from "node:child_process"
import { reviewedNativeLaunchEnvironment } from "./native-launch-environment.js"
import type { WindowsTreeTerminator } from "./types.js"

export interface ProcessTreeTerminationRequest {
  readonly child: ChildProcessWithoutNullStreams
  readonly platform: NodeJS.Platform
  readonly graceMs: number
  readonly cleanupTimeoutMs: number
  readonly waitForClose: (timeoutMs: number) => Promise<boolean>
  readonly windowsTreeTerminator: WindowsTreeTerminator
}

const PROCESS_GROUP_PROBE_INTERVAL_MS = 20

export async function terminateProcessTree(
  request: ProcessTreeTerminationRequest
): Promise<void> {
  const pid = request.child.pid
  if (
    pid === undefined ||
    (request.platform === "win32" && isClosed(request.child))
  ) {
    return
  }

  const deadline = Date.now() + request.cleanupTimeoutMs

  if (request.platform === "win32") {
    await withinDeadline(
      request.windowsTreeTerminator.terminate(pid),
      remainingMs(deadline),
      "Windows process tree termination exceeded its cleanup deadline"
    )
    if (!(await request.waitForClose(remainingMs(deadline)))) {
      throw new Error("Windows process tree did not close before cleanup deadline")
    }
    return
  }

  const gracefulTerminationError = signalUnixProcessGroup(pid, "SIGTERM")
  const gracefulWaitMs = Math.min(request.graceMs, remainingMs(deadline))
  const gracefulExit = await waitForUnixProcessGroupExit(pid, gracefulWaitMs)
  if (gracefulExit.gone) {
    await request.waitForClose(remainingMs(deadline))
    return
  }
  const forcedTerminationError = signalUnixProcessGroup(pid, "SIGKILL")
  const forcedExit = await waitForUnixProcessGroupExit(
    pid,
    remainingMs(deadline)
  )
  if (forcedExit.gone) {
    await request.waitForClose(remainingMs(deadline))
    return
  }
  throw new Error(
    forcedExit.probeError ??
      forcedTerminationError ??
      gracefulExit.probeError ??
      gracefulTerminationError ??
      "POSIX process group did not exit before cleanup deadline"
  )
}

export function createTaskkillTreeTerminator(): WindowsTreeTerminator {
  const launchEnvironment = reviewedNativeLaunchEnvironment(process.env)
  return {
    async terminate(pid) {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(
          "taskkill",
          ["/PID", String(pid), "/T", "/F"],
          {
            env: launchEnvironment,
            windowsHide: true,
            stdio: "ignore",
            shell: false
          }
        )
        child.once("error", reject)
        child.once("close", (code) => {
          if (code === 0 || code === 128) {
            resolve()
          } else {
            reject(new Error(`taskkill exited with code ${String(code)}`))
          }
        })
      })
    }
  }
}

function signalUnixProcessGroup(
  pid: number,
  signal: NodeJS.Signals
): string | undefined {
  try {
    process.kill(-pid, signal)
    return undefined
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return code === "ESRCH"
      ? undefined
      : `POSIX process group ${signal} failed${code === undefined ? "" : ` (${code})`}`
  }
}

async function waitForUnixProcessGroupExit(
  pid: number,
  timeoutMs: number
): Promise<{ readonly gone: boolean; readonly probeError?: string }> {
  const deadline = Date.now() + timeoutMs
  let probeError: string | undefined
  while (true) {
    const status = unixProcessGroupStatus(pid)
    if (status.kind === "gone") {
      return { gone: true }
    }
    if (status.kind === "error") {
      probeError = status.message
    }
    const remaining = remainingMs(deadline)
    if (remaining === 0) {
      return {
        gone: false,
        ...(probeError === undefined ? {} : { probeError })
      }
    }
    await delay(Math.min(PROCESS_GROUP_PROBE_INTERVAL_MS, remaining))
  }
}

function unixProcessGroupStatus(pid: number):
  | { readonly kind: "alive" | "gone" }
  | { readonly kind: "error"; readonly message: string } {
  try {
    process.kill(-pid, 0)
    return { kind: "alive" }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === "ESRCH") {
      return { kind: "gone" }
    }
    return {
      kind: "error",
      message: `POSIX process group membership probe failed${code === undefined ? "" : ` (${code})`}`
    }
  }
}

async function withinDeadline<T>(
  operation: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  let timeout: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
      })
    ])
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
  }
}

function remainingMs(deadline: number): number {
  return Math.max(0, deadline - Date.now())
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

function isClosed(child: ChildProcessWithoutNullStreams): boolean {
  return child.exitCode !== null || child.signalCode !== null
}
