import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import type { StorageRpcRequestEnvelope } from "./generated/storage-rpc.js"
import { StorageTransportError } from "./errors.js"
import {
  PendingTransportCallQueue,
  type PendingTransportCall
} from "./transport-pending-queue.js"
import { createStorageProcessTreeTerminator } from "./transport-process-tree.js"
import {
  defaultTransportRestartSleep,
  TransportRestartBackoff
} from "./transport-restart-backoff.js"
import { storageTransportError } from "./transport-error.js"
import { assertExecutable } from "./transport-local-command.js"
import type {
  PersistentSystemServiceTransportOptions,
  StorageProcessTreeTerminator,
  StorageWireTransport
} from "./transport-types.js"

const DEFAULT_STARTUP_TIMEOUT_MS = 5_000
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000
const DEFAULT_SHUTDOWN_GRACE_MS = 1_000
const DEFAULT_CLEANUP_TIMEOUT_MS = 2_000
const DEFAULT_TERMINATION_GRACE_MS = 250

export class PersistentSystemServiceStorageWireTransport
  implements StorageWireTransport {
  readonly storeDir: string
  readonly serviceBin: string
  private readonly restartBackoff: TransportRestartBackoff
  private readonly startupTimeoutMs: number
  private readonly requestTimeoutMs: number
  private readonly shutdownGraceMs: number
  private readonly cleanupTimeoutMs: number
  private readonly platform: NodeJS.Platform
  private readonly processTreeTerminator: StorageProcessTreeTerminator
  private child: ChildProcessWithoutNullStreams | null = null
  private starting: Promise<ChildProcessWithoutNullStreams> | null = null
  private cleanupPromise: Promise<void> | null = null
  private cleanupFailure: Error | null = null
  private closePromise: Promise<void> | null = null
  private stdoutBuffer = ""
  private closed = false
  private lastChildFailure: Error | null = null
  private readonly pending = new PendingTransportCallQueue()
  private epoch = 0

  constructor(options: PersistentSystemServiceTransportOptions) {
    this.storeDir = options.storeDir
    this.serviceBin = options.serviceBin
    this.restartBackoff = new TransportRestartBackoff(
      options.restartBackoffMs ?? 25,
      options.sleep ?? defaultTransportRestartSleep
    )
    this.startupTimeoutMs = positiveTimeout(
      options.startupTimeoutMs,
      DEFAULT_STARTUP_TIMEOUT_MS,
      "startupTimeoutMs"
    )
    this.requestTimeoutMs = positiveTimeout(
      options.requestTimeoutMs,
      DEFAULT_REQUEST_TIMEOUT_MS,
      "requestTimeoutMs"
    )
    this.shutdownGraceMs = positiveTimeout(
      options.shutdownGraceMs,
      DEFAULT_SHUTDOWN_GRACE_MS,
      "shutdownGraceMs"
    )
    this.cleanupTimeoutMs = positiveTimeout(
      options.cleanupTimeoutMs,
      DEFAULT_CLEANUP_TIMEOUT_MS,
      "cleanupTimeoutMs"
    )
    this.platform = options.platform ?? process.platform
    this.processTreeTerminator =
      options.processTreeTerminator ?? createStorageProcessTreeTerminator()
  }

  async close(): Promise<void> {
    if (this.closePromise !== null) return await this.closePromise
    this.closed = true
    const closeError = new StorageTransportError(
      "system-service persistent transport closed",
      { code: "local_persistent_transport_closed" }
    )
    this.rejectAll(closeError)
    this.closePromise = this.closeOwnedResources()
    return await this.closePromise
  }

  connectionEpoch(): number | null {
    return this.child === null ? null : this.epoch
  }

  async exchange(request: StorageRpcRequestEnvelope): Promise<unknown> {
    this.assertOpen()
    await this.restartBackoff.waitIfNeeded()
    if (this.cleanupPromise !== null) await this.cleanupPromise
    this.throwIfCleanupFailed()
    this.assertOpen()
    const child = await this.ensureChild()
    this.assertOpen()
    return await new Promise((resolve, reject) => {
      let settled = false
      const timeout = setTimeout(() => {
        if (settled) return
        settled = true
        this.removePending(pending)
        const error = new StorageTransportError(
          `system-service persistent request exceeded ${this.requestTimeoutMs}ms`,
          { code: "local_persistent_request_timeout" }
        )
        reject(error)
        this.failCurrentChild(error)
      }, this.requestTimeoutMs)
      const pending: PendingTransportCall = {
        resolve: (value) => {
          if (settled) return
          settled = true
          clearTimeout(timeout)
          resolve(value)
        },
        reject: (error) => {
          if (settled) return
          settled = true
          clearTimeout(timeout)
          reject(error)
        }
      }
      this.pending.push(pending)
      if (!this.isWritableChild(child)) {
        this.removePending(pending)
        pending.reject(this.lastChildFailure ?? closedProcessError())
        this.restartBackoff.markFailure()
        return
      }
      child.stdin.write(`${JSON.stringify(request)}\n`, (error) => {
        if (!error) return
        this.removePending(pending)
        const failure = storageTransportError(
          "local_persistent_write_failed",
          "system-service persistent write failed",
          error
        )
        pending.reject(failure)
        this.markChildFailed(child, failure)
      })
    })
  }

  private async ensureChild(): Promise<ChildProcessWithoutNullStreams> {
    this.assertOpen()
    if (this.child !== null) return this.child
    if (this.starting !== null) return await this.starting
    this.starting = this.spawnChild()
    try {
      return await this.starting
    } finally {
      this.starting = null
    }
  }

  private async spawnChild(): Promise<ChildProcessWithoutNullStreams> {
    try {
      assertExecutable(
        this.serviceBin,
        "local_persistent_spawn",
        "system-service persistent process is not executable"
      )
    } catch (error) {
      throw error
    }
    let child: ChildProcessWithoutNullStreams
    try {
      child = spawn(this.serviceBin, ["--store", this.storeDir, "--serve"], {
        detached: this.platform !== "win32",
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"]
      })
    } catch (error) {
      throw storageTransportError(
        "local_persistent_spawn",
        "system-service persistent process failed to spawn",
        error
      )
    }
    this.child = child
    this.lastChildFailure = null
    this.stdoutBuffer = ""
    this.installChildListeners(child)
    try {
      await waitForSpawn(child, this.startupTimeoutMs)
    } catch (error) {
      const failure = storageTransportError(
        "local_persistent_startup_timeout",
        `system-service persistent process did not spawn within ${this.startupTimeoutMs}ms`,
        error
      )
      this.markChildFailed(child, failure)
      throw failure
    }
    if (this.closed || this.child !== child) {
      throw this.lastChildFailure ?? new StorageTransportError(
        "system-service persistent transport closed during startup",
        { code: "local_persistent_transport_closed" }
      )
    }
    this.epoch += 1
    return child
  }

  private installChildListeners(child: ChildProcessWithoutNullStreams): void {
    child.stdout.on("data", (chunk: Buffer) => {
      if (this.child !== child) return
      this.stdoutBuffer += chunk.toString("utf8")
      this.drainStdoutBuffer()
    })
    child.stderr.on("data", () => {})
    child.on("error", (error) => {
      if (this.child !== child) return
      this.recordChildFailure(storageTransportError(
        "local_persistent_spawn",
        "system-service persistent process failed",
        error
      ))
      this.child = null
    })
    child.on("close", () => {
      if (this.child !== child) return
      this.child = null
      if (!this.closed) this.recordChildFailure(closedProcessError())
    })
  }

  private drainStdoutBuffer(): void {
    while (true) {
      const newlineIndex = this.stdoutBuffer.indexOf("\n")
      if (newlineIndex < 0) return
      const line = this.stdoutBuffer.slice(0, newlineIndex)
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1)
      const pending = this.pending.shift()
      if (pending === undefined) {
        this.failCurrentChild(new StorageTransportError(
          "system-service persistent returned an unmatched response",
          { code: "local_persistent_unmatched_response" }
        ))
        continue
      }
      try {
        pending.resolve(JSON.parse(line) as unknown)
      } catch (error) {
        const failure = storageTransportError(
          "local_persistent_invalid_json",
          "system-service persistent returned invalid JSON",
          error
        )
        pending.reject(failure)
        this.failCurrentChild(failure)
      }
    }
  }

  private async closeOwnedResources(): Promise<void> {
    if (this.starting !== null) await this.starting.catch(() => {})
    if (this.cleanupPromise !== null) await this.cleanupPromise
    this.throwIfCleanupFailed()
    const child = this.child
    if (child === null) return
    this.child = null
    child.stdin.end()
    if (await waitForClose(child, this.shutdownGraceMs)) return
    await this.terminateChild(child)
  }

  private failCurrentChild(error: Error): void {
    const child = this.child
    if (child === null) {
      this.recordChildFailure(error)
      return
    }
    this.markChildFailed(child, error)
  }

  private markChildFailed(
    child: ChildProcessWithoutNullStreams,
    error: Error
  ): void {
    if (this.child === child) this.child = null
    this.recordChildFailure(error)
    if (this.cleanupPromise === null) {
      const cleanup = this.terminateChild(child)
      this.cleanupPromise = cleanup
      void cleanup.then(undefined, (failure: unknown) => {
        this.cleanupFailure = failure instanceof Error
          ? failure
          : new Error(String(failure))
      }).finally(() => {
        if (this.cleanupPromise === cleanup) this.cleanupPromise = null
      })
    }
  }

  private async terminateChild(child: ChildProcessWithoutNullStreams): Promise<void> {
    if (isClosed(child)) return
    const cleanup = this.processTreeTerminator.terminate({
      child,
      platform: this.platform,
      graceMs: DEFAULT_TERMINATION_GRACE_MS,
      waitForClose: async (timeoutMs) => await waitForClose(child, timeoutMs)
    })
    await withDeadline(
      cleanup,
      this.cleanupTimeoutMs,
      () => cleanupTimeoutError(this.cleanupTimeoutMs)
    )
    if (!isClosed(child) && !await waitForClose(child, this.cleanupTimeoutMs)) {
      throw cleanupTimeoutError(this.cleanupTimeoutMs)
    }
  }

  private recordChildFailure(error: Error): void {
    this.lastChildFailure = this.lastChildFailure ?? error
    if (!this.closed) this.restartBackoff.markFailure()
    this.rejectAll(error)
  }

  private rejectAll(error: Error): void {
    this.pending.rejectAll(error)
  }

  private removePending(pending: PendingTransportCall): void {
    this.pending.remove(pending)
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new StorageTransportError(
        "system-service persistent transport closed",
        { code: "local_persistent_transport_closed" }
      )
    }
  }

  private throwIfCleanupFailed(): void {
    if (this.cleanupFailure !== null) throw this.cleanupFailure
  }

  private isWritableChild(child: ChildProcessWithoutNullStreams): boolean {
    return child === this.child && !isClosed(child) &&
      !child.stdin.destroyed && !child.stdin.writableEnded
  }
}

function waitForSpawn(
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number
): Promise<void> {
  if (child.pid !== undefined && !child.killed) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error("spawn deadline exceeded"))
    }, timeoutMs)
    const spawned = (): void => {
      cleanup()
      resolve()
    }
    const failed = (error: Error): void => {
      cleanup()
      reject(error)
    }
    const cleanup = (): void => {
      clearTimeout(timeout)
      child.off("spawn", spawned)
      child.off("error", failed)
    }
    child.once("spawn", spawned)
    child.once("error", failed)
  })
}

function waitForClose(
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number
): Promise<boolean> {
  if (isClosed(child)) return Promise.resolve(true)
  return new Promise((resolve) => {
    const timeout = setTimeout(() => finish(false), timeoutMs)
    const closed = (): void => finish(true)
    const finish = (value: boolean): void => {
      clearTimeout(timeout)
      child.off("close", closed)
      resolve(value)
    }
    child.once("close", closed)
  })
}

function withDeadline<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutError: () => Error
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(timeoutError()),
      timeoutMs
    )
    promise.then(
      (value) => {
        clearTimeout(timeout)
        resolve(value)
      },
      (error) => {
        clearTimeout(timeout)
        reject(error)
      }
    )
  })
}

function positiveTimeout(
  value: number | undefined,
  fallback: number,
  name: string
): number {
  const resolved = value ?? fallback
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw new Error(`persistent storage ${name} must be a positive integer`)
  }
  return resolved
}

function isClosed(child: ChildProcessWithoutNullStreams): boolean {
  return child.exitCode !== null || child.signalCode !== null
}

function closedProcessError(): StorageTransportError {
  return new StorageTransportError("system-service persistent process closed", {
    code: "local_persistent_closed"
  })
}

function cleanupTimeoutError(timeoutMs: number): StorageTransportError {
  return new StorageTransportError(
    `system-service process tree did not close within ${timeoutMs}ms`,
    { code: "local_persistent_cleanup_timeout" }
  )
}
