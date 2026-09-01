import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import type { StorageProcessTreeTerminator } from "./transport-types.js"

export function createStorageProcessTreeTerminator(): StorageProcessTreeTerminator {
  return {
    async terminate(request) {
      const pid = request.child.pid
      if (pid === undefined || isClosed(request.child)) return
      if (request.platform === "win32") {
        await terminateWindowsTree(pid)
        return
      }
      signalUnixGroup(request.child, pid, "SIGTERM")
      if (await request.waitForClose(request.graceMs)) return
      signalUnixGroup(request.child, pid, "SIGKILL")
    }
  }
}

function terminateWindowsTree(pid: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
      shell: false
    })
    child.once("error", reject)
    child.once("close", (code) => {
      if (code === 0 || code === 128) resolve()
      else reject(new Error(`taskkill exited with code ${String(code)}`))
    })
  })
}

function signalUnixGroup(
  child: ChildProcessWithoutNullStreams,
  pid: number,
  signal: NodeJS.Signals
): void {
  try {
    process.kill(-pid, signal)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === "ESRCH") return
    try {
      if (child.kill(signal)) return
    } catch (fallbackError) {
      throw new Error(
        `POSIX process group ${signal} failed${code === undefined ? "" : ` (${code})`}`,
        { cause: fallbackError }
      )
    }
    throw new Error(
      `POSIX process group ${signal} failed${code === undefined ? "" : ` (${code})`}`
    )
  }
}

function isClosed(child: ChildProcessWithoutNullStreams): boolean {
  return child.exitCode !== null || child.signalCode !== null
}
