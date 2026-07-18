import { spawn } from "node:child_process"
import type { ChildProcessWithoutNullStreams } from "node:child_process"
import type { WindowsTreeTerminator } from "./types.js"

export interface ProcessTreeTerminationRequest {
  readonly child: ChildProcessWithoutNullStreams
  readonly platform: NodeJS.Platform
  readonly graceMs: number
  readonly waitForClose: (timeoutMs: number) => Promise<boolean>
  readonly windowsTreeTerminator: WindowsTreeTerminator
}

export async function terminateProcessTree(
  request: ProcessTreeTerminationRequest
): Promise<void> {
  const pid = request.child.pid
  if (pid === undefined || isClosed(request.child)) {
    return
  }

  if (request.platform === "win32") {
    await request.windowsTreeTerminator.terminate(pid)
    return
  }

  signalUnixProcessGroup(pid, "SIGTERM")
  if (await request.waitForClose(request.graceMs)) {
    return
  }
  signalUnixProcessGroup(pid, "SIGKILL")
}

export function createTaskkillTreeTerminator(): WindowsTreeTerminator {
  return {
    async terminate(pid) {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(
          "taskkill",
          ["/PID", String(pid), "/T", "/F"],
          {
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

function signalUnixProcessGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
      throw error
    }
  }
}

function isClosed(child: ChildProcessWithoutNullStreams): boolean {
  return child.exitCode !== null || child.signalCode !== null
}
