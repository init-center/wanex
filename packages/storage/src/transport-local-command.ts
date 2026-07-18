import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { accessSync, constants } from "node:fs"
import { storageTransportError } from "./transport-error.js"

export function assertExecutable(
  serviceBin: string,
  code: string,
  message: string
): void {
  try {
    accessSync(serviceBin, constants.X_OK)
  } catch (error) {
    throw storageTransportError(code, message, error)
  }
}

export function runJsonCommand(
  serviceBin: string,
  storeDir: string,
  request: unknown
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    try {
      assertExecutable(
        serviceBin,
        "local_oneshot_spawn",
        "system-service one-shot process is not executable"
      )
    } catch (error) {
      reject(error)
      return
    }
    let child: ChildProcessWithoutNullStreams
    try {
      child = spawn(serviceBin, ["--store", storeDir], {
        stdio: ["pipe", "pipe", "pipe"]
      })
    } catch (error) {
      reject(
        storageTransportError(
          "local_oneshot_spawn",
          "system-service one-shot process failed to spawn",
          error
        )
      )
      return
    }

    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk))
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk))
    child.on("error", (error) => {
      reject(
        storageTransportError(
          "local_oneshot_spawn",
          "system-service one-shot process failed",
          error
        )
      )
    })
    child.on("close", () => {
      const output = Buffer.concat(stdout).toString("utf8")
      try {
        resolve(JSON.parse(output) as unknown)
      } catch (error) {
        reject(
          storageTransportError(
            "local_oneshot_invalid_json",
            `system-service one-shot returned invalid JSON; stderr=${Buffer.concat(stderr).toString("utf8")}`,
            error
          )
        )
      }
    })

    child.stdin.end(JSON.stringify(request))
  })
}
