import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { access } from "node:fs/promises"
import { constants } from "node:fs"
import { resolve } from "node:path"
import type {
  WorkspaceChangeTransactionFileObservation,
  WorkspaceChangeTransactionFilePlan
} from "@wanex/protocol"
import {
  WorkspaceTransactionHelperError,
  type NativeWorkspaceTransactionExecutor,
  type NativeWorkspaceTransactionOptions,
  type NativeWorkspaceTransactionProgress
} from "./types.js"

const PROTOCOL = 1
const MAX_FRAME_BYTES = 64 * 1024 * 1024
const MAX_STDERR_BYTES = 8 * 1024
const DEFAULT_STARTUP_TIMEOUT_MS = 10_000
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 1_000

export async function spawnNativeWorkspaceTransaction(
  options: NativeWorkspaceTransactionOptions
): Promise<NativeWorkspaceTransactionExecutor> {
  const rootDir = resolve(options.rootDir)
  const startupTimeoutMs = positiveTimeout(
    options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS,
    "startupTimeoutMs"
  )
  const shutdownTimeoutMs = positiveTimeout(
    options.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS,
    "shutdownTimeoutMs"
  )
  if (options.transactionId.length === 0) {
    throw new Error("workspace transaction id must not be empty")
  }
  try {
    await access(options.serviceBin, constants.X_OK)
  } catch (error) {
    throw new WorkspaceTransactionHelperError(
      "spawn_failed",
      "workspace transaction helper is not executable",
      error
    )
  }

  const child = spawn(options.serviceBin, [
    ...(options.serviceArgsPrefix ?? []),
    "--workspace-transaction",
    "--root",
    rootDir,
    "--transaction",
    options.transactionId
  ], {
    detached: false,
    shell: false,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"]
  })
  const executor = new NativeTransactionProcess(
    child,
    options.transactionId,
    startupTimeoutMs,
    shutdownTimeoutMs
  )
  try {
    await executor.start()
    return executor
  } catch (error) {
    await executor.terminate()
    throw error
  }
}

class NativeTransactionProcess implements NativeWorkspaceTransactionExecutor {
  private stdout: Buffer<ArrayBufferLike> = Buffer.alloc(0)
  private stderr: Buffer<ArrayBufferLike> = Buffer.alloc(0)
  private closed = false
  private exitCode: number | null = null
  private signalCode: NodeJS.Signals | null = null
  private spawnError: Error | null = null
  private commandPending = false
  private cleaned = false
  private readonly progressWaiters = new Set<() => void>()

  constructor(
    private readonly child: ChildProcessWithoutNullStreams,
    private readonly transactionId: string,
    private readonly startupTimeoutMs: number,
    private readonly shutdownTimeoutMs: number
  ) {
    child.stdin.on("error", () => {})
    child.stdout.on("data", (chunk: Buffer) => {
      this.stdout = appendBoundedBuffer(
        this.stdout,
        chunk,
        MAX_FRAME_BYTES + 1
      )
      this.notifyProgress()
    })
    child.stderr.on("data", (chunk: Buffer) => {
      this.stderr = appendBoundedBuffer(this.stderr, chunk, MAX_STDERR_BYTES)
    })
    child.once("error", (error) => {
      this.spawnError = error
      this.notifyProgress()
    })
    child.once("close", (code, signal) => {
      this.closed = true
      this.exitCode = code
      this.signalCode = signal
      this.notifyProgress()
    })
  }

  async start(): Promise<void> {
    const frame = await this.readFrame(Date.now() + this.startupTimeoutMs)
    assertExactFrame(frame, {
      protocol: PROTOCOL,
      kind: "workspace_transaction_ready"
    })
  }

  async prepare(
    files: readonly WorkspaceChangeTransactionFilePlan[],
    onProgress: (progress: NativeWorkspaceTransactionProgress) => Promise<void> = async () => {}
  ): Promise<void> {
    await this.runCommand(
      {
        protocol: PROTOCOL,
        command: "prepare",
        transaction_id: this.transactionId,
        files: toWireFiles(files)
      },
      "workspace_transaction_prepared",
      "prepared",
      onProgress
    )
  }

  async inspect(
    files: readonly WorkspaceChangeTransactionFilePlan[]
  ): Promise<readonly WorkspaceChangeTransactionFileObservation[]> {
    return await this.withCommand(async () => {
      await this.writeCommand({
        protocol: PROTOCOL,
        command: "inspect",
        transaction_id: this.transactionId,
        files: toWireFiles(files)
      })
      const frame = await this.readFrame()
      if (
        frame.protocol !== PROTOCOL ||
        frame.kind !== "workspace_transaction_inspection" ||
        frame.transaction_id !== this.transactionId ||
        !Array.isArray(frame.observations) ||
        Object.keys(frame).length !== 4
      ) {
        throw this.failure(
          "invalid_protocol",
          "workspace transaction helper returned an invalid inspection frame"
        )
      }
      return frame.observations.map((value, index) =>
        parseObservation(value, index)
      )
    })
  }

  async commit(
    files: readonly WorkspaceChangeTransactionFilePlan[],
    ordinals: readonly number[],
    onProgress: (progress: NativeWorkspaceTransactionProgress) => Promise<void>
  ): Promise<void> {
    await this.runCommand(
      {
        protocol: PROTOCOL,
        command: "commit",
        transaction_id: this.transactionId,
        files: toWireFiles(files),
        ordinals: [...ordinals]
      },
      "workspace_transaction_committed",
      "committed",
      onProgress
    )
  }

  async cleanup(files: readonly WorkspaceChangeTransactionFilePlan[]): Promise<void> {
    await this.withCommand(async () => {
      await this.writeCommand({
        protocol: PROTOCOL,
        command: "cleanup",
        transaction_id: this.transactionId,
        files: toWireFiles(files)
      })
      assertExactFrame(await this.readFrame(), {
        protocol: PROTOCOL,
        kind: "workspace_transaction_cleaned",
        transaction_id: this.transactionId
      })
      this.cleaned = true
      await this.waitForClose(this.shutdownTimeoutMs)
      if (this.exitCode !== 0) {
        throw this.failure(
          "shutdown_failed",
          "workspace transaction helper failed after cleanup"
        )
      }
    })
  }

  async terminate(): Promise<void> {
    if (this.closed) return
    this.child.kill("SIGTERM")
    if (await this.waitForClose(250, false)) return
    this.child.kill("SIGKILL")
    await this.waitForClose(this.shutdownTimeoutMs, false)
  }

  private async runCommand(
    command: Record<string, unknown>,
    doneKind: string,
    state: NativeWorkspaceTransactionProgress["state"],
    onProgress: (progress: NativeWorkspaceTransactionProgress) => Promise<void>
  ): Promise<void> {
    await this.withCommand(async () => {
      await this.writeCommand(command)
      let acknowledgmentFailure: unknown
      while (true) {
        const frame = await this.readFrame()
        if (
          frame.protocol === PROTOCOL &&
          frame.kind === doneKind &&
          frame.transaction_id === this.transactionId &&
          Object.keys(frame).length === 3
        ) {
          if (acknowledgmentFailure !== undefined) {
            throw acknowledgmentFailure
          }
          return
        }
        const progress = parseProgress(frame, this.transactionId, state)
        if (acknowledgmentFailure === undefined) {
          try {
            await onProgress(progress)
          } catch (error) {
            acknowledgmentFailure = error
          }
        }
      }
    })
  }

  private async withCommand<T>(operation: () => Promise<T>): Promise<T> {
    if (this.commandPending) {
      throw new Error("workspace transaction helper already has a pending command")
    }
    if (this.cleaned || this.closed) {
      throw this.failure(
        "helper_exited",
        "workspace transaction helper is no longer available"
      )
    }
    this.commandPending = true
    try {
      return await operation()
    } finally {
      this.commandPending = false
    }
  }

  private async writeCommand(command: Record<string, unknown>): Promise<void> {
    const frame = `${JSON.stringify(command)}\n`
    await new Promise<void>((resolve, reject) => {
      this.child.stdin.write(frame, (error) => {
        if (error === null || error === undefined) resolve()
        else reject(new WorkspaceTransactionHelperError(
          "write_failed",
          "workspace transaction helper command write failed",
          error
        ))
      })
    })
  }

  private async readFrame(deadline?: number): Promise<Record<string, unknown>> {
    const effectiveDeadline = deadline ?? Number.POSITIVE_INFINITY
    while (true) {
      const newline = this.stdout.indexOf(0x0a)
      if (newline >= 0) {
        let line = this.stdout.subarray(0, newline)
        this.stdout = this.stdout.slice(newline + 1)
        if (line.at(-1) === 0x0d) line = line.subarray(0, -1)
        try {
          const value = JSON.parse(line.toString("utf8")) as unknown
          if (value !== null && typeof value === "object" && !Array.isArray(value)) {
            return value as Record<string, unknown>
          }
        } catch {}
        throw this.failure(
          "invalid_protocol",
          "workspace transaction helper returned invalid JSON"
        )
      }
      if (this.stdout.length > MAX_FRAME_BYTES) {
        throw this.failure(
          "invalid_protocol",
          "workspace transaction helper frame exceeded its limit"
        )
      }
      if (this.spawnError !== null) {
        throw new WorkspaceTransactionHelperError(
          "spawn_failed",
          "workspace transaction helper failed to spawn",
          this.spawnError
        )
      }
      if (this.closed) {
        throw this.failure(
          "helper_exited",
          "workspace transaction helper exited before completing its command"
        )
      }
      await this.waitForProgress(effectiveDeadline)
    }
  }

  private async waitForProgress(deadline: number): Promise<void> {
    const remaining = deadline - Date.now()
    if (remaining <= 0) {
      throw this.failure(
        "startup_timeout",
        "workspace transaction helper startup timed out"
      )
    }
    await new Promise<void>((resolve, reject) => {
      let settled = false
      const finish = (error?: Error): void => {
        if (settled) return
        settled = true
        if (timeout !== undefined) clearTimeout(timeout)
        this.progressWaiters.delete(progress)
        error === undefined ? resolve() : reject(error)
      }
      const progress = (): void => finish()
      const timeout = Number.isFinite(remaining)
        ? setTimeout(() => finish(this.failure(
            "startup_timeout",
            "workspace transaction helper startup timed out"
          )), remaining)
        : undefined
      this.progressWaiters.add(progress)
    })
  }

  private notifyProgress(): void {
    for (const notify of this.progressWaiters) notify()
  }

  private async waitForClose(timeoutMs: number, fail = true): Promise<boolean> {
    if (this.closed) return true
    const closed = await new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => resolve(false), timeoutMs)
      this.child.once("close", () => {
        clearTimeout(timeout)
        resolve(true)
      })
    })
    if (!closed && fail) {
      throw this.failure(
        "shutdown_failed",
        "workspace transaction helper did not exit before its deadline"
      )
    }
    return closed
  }

  private failure(
    code: "startup_timeout" | "invalid_protocol" | "helper_exited" | "shutdown_failed",
    message: string
  ): WorkspaceTransactionHelperError {
    const status = this.signalCode === null
      ? `exit=${String(this.exitCode)}`
      : `signal=${this.signalCode}`
    const diagnostic = this.stderr.toString("utf8").trim()
    return new WorkspaceTransactionHelperError(
      code,
      `${message}; ${status}${diagnostic.length === 0 ? "" : `; stderr=${diagnostic}`}`
    )
  }
}

function toWireFiles(files: readonly WorkspaceChangeTransactionFilePlan[]) {
  return files.map((file) => ({
    ordinal: file.ordinal,
    path: file.path,
    before_sha256: file.beforeSha256 ?? null,
    after_text: file.afterText ?? null,
    after_sha256: file.afterSha256 ?? null
  }))
}

function parseProgress(
  frame: Record<string, unknown>,
  transactionId: string,
  expectedState: NativeWorkspaceTransactionProgress["state"]
): NativeWorkspaceTransactionProgress {
  if (
    frame.protocol !== PROTOCOL ||
    frame.kind !== "workspace_transaction_file" ||
    frame.transaction_id !== transactionId ||
    !Number.isSafeInteger(frame.ordinal) ||
    (frame.ordinal as number) < 0 ||
    frame.state !== expectedState ||
    Object.keys(frame).length !== 5
  ) {
    throw new WorkspaceTransactionHelperError(
      "invalid_protocol",
      "workspace transaction helper returned an invalid progress frame"
    )
  }
  return { ordinal: frame.ordinal as number, state: expectedState }
}

function parseObservation(
  value: unknown,
  index: number
): WorkspaceChangeTransactionFileObservation {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new WorkspaceTransactionHelperError(
      "invalid_protocol",
      `workspace transaction observation ${index} is invalid`
    )
  }
  const observation = value as Record<string, unknown>
  if (
    !Number.isSafeInteger(observation.ordinal) ||
    (observation.ordinal as number) < 0 ||
    !["before", "after", "other"].includes(String(observation.current)) ||
    !(observation.sha256 === null || typeof observation.sha256 === "string") ||
    Object.keys(observation).length !== 3
  ) {
    throw new WorkspaceTransactionHelperError(
      "invalid_protocol",
      `workspace transaction observation ${index} is invalid`
    )
  }
  return {
    ordinal: observation.ordinal as number,
    current: observation.current as "before" | "after" | "other"
  }
}

function assertExactFrame(
  actual: Record<string, unknown>,
  expected: Record<string, unknown>
): void {
  const keys = Object.keys(expected)
  if (
    Object.keys(actual).length !== keys.length ||
    keys.some((key) => actual[key] !== expected[key])
  ) {
    throw new WorkspaceTransactionHelperError(
      "invalid_protocol",
      "workspace transaction helper returned an unexpected frame"
    )
  }
}

function positiveTimeout(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`workspace transaction ${name} must be a positive integer`)
  }
  return value
}

function appendBoundedBuffer(
  current: Buffer<ArrayBufferLike>,
  chunk: Buffer<ArrayBufferLike>,
  limit: number
): Buffer<ArrayBufferLike> {
  if (current.length >= limit) return current
  return Buffer.concat([current, chunk.subarray(0, limit - current.length)])
}
