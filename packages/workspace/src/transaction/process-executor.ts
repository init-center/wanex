import type {
  WorkspaceChangeTransactionFileObservation,
  WorkspaceChangeTransactionFilePlan
} from "@wanex/protocol"
import type {
  ExecutionResult,
  ManagedExecutionProcess
} from "@wanex/runtime/execution"
import {
  WorkspaceTransactionHelperError,
  type WorkspaceTransactionExecutor,
  type WorkspaceTransactionOptions,
  type WorkspaceTransactionProgress
} from "./types.js"

const PROTOCOL = 1
const MAX_FRAME_BYTES = 50 * 1024 * 1024
const MAX_STDERR_BYTES = 8 * 1024
const DEFAULT_STARTUP_TIMEOUT_MS = 10_000
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 1_000

export async function spawnWorkspaceTransaction(
  options: WorkspaceTransactionOptions
): Promise<WorkspaceTransactionExecutor> {
  if (options.transactionId.length === 0) {
    throw new Error("workspace transaction id must not be empty")
  }
  const executor = new WorkspaceTransactionProcess({
    ...options,
    startupTimeoutMs: positiveTimeout(
      options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS,
      "startupTimeoutMs"
    ),
    shutdownTimeoutMs: positiveTimeout(
      options.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS,
      "shutdownTimeoutMs"
    )
  })
  try {
    await executor.start()
    return executor
  } catch (error) {
    await executor.terminate().catch(() => {})
    throw error
  }
}

class WorkspaceTransactionProcess implements WorkspaceTransactionExecutor {
  private readonly transactionId: string
  private readonly startupTimeoutMs: number
  private readonly shutdownTimeoutMs: number
  private readonly processPromise: Promise<ManagedExecutionProcess>
  private process: ManagedExecutionProcess | undefined
  private stdout: Buffer<ArrayBufferLike> = Buffer.alloc(0)
  private stderr: Buffer<ArrayBufferLike> = Buffer.alloc(0)
  private terminal: ExecutionResult | undefined
  private pumpFailure: unknown
  private closed = false
  private cleaned = false
  private commandPending = false
  private readonly progressWaiters = new Set<() => void>()

  constructor(options: WorkspaceTransactionOptions & {
    readonly startupTimeoutMs: number
    readonly shutdownTimeoutMs: number
  }) {
    this.transactionId = options.transactionId
    this.startupTimeoutMs = options.startupTimeoutMs
    this.shutdownTimeoutMs = options.shutdownTimeoutMs
    this.processPromise = options.executionScope.process.start({
      program: options.serviceBin,
      args: [
        ...(options.serviceArgsPrefix ?? []),
        "--workspace-transaction",
        "--root",
        options.rootDir,
        "--transaction",
        options.transactionId
      ],
      cwd: options.rootDir,
      output: {
        stdoutBytes: MAX_FRAME_BYTES,
        stderrBytes: MAX_STDERR_BYTES
      }
    })
  }

  async start(): Promise<void> {
    this.process = await this.processPromise
    void this.pump(this.process).catch(() => {})
    const frame = await this.readFrame(Date.now() + this.startupTimeoutMs)
    assertExactFrame(frame, {
      protocol: PROTOCOL,
      kind: "workspace_transaction_ready"
    })
  }

  async prepare(
    files: readonly WorkspaceChangeTransactionFilePlan[],
    onProgress: (progress: WorkspaceTransactionProgress) => Promise<void> = async () => {}
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
    onProgress: (progress: WorkspaceTransactionProgress) => Promise<void>
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
      if (this.terminal?.exitCode !== 0) {
        throw this.failure(
          "shutdown_failed",
          "workspace transaction helper failed after cleanup"
        )
      }
    })
  }

  async terminate(): Promise<void> {
    if (this.closed) return
    const process = this.process ?? await this.processPromise.catch(() => undefined)
    if (process === undefined) return
    await process.terminate("cancelled").catch(() => {})
    await process.wait().catch(() => {})
    await this.waitForClose(this.shutdownTimeoutMs, false)
  }

  private async pump(process: ManagedExecutionProcess): Promise<void> {
    try {
      for await (const event of process.events) {
        switch (event.type) {
          case "stdout":
            this.stdout = appendBoundedBuffer(
              this.stdout,
              event.bytes,
              MAX_FRAME_BYTES + 1
            )
            this.notifyProgress()
            break
          case "stderr":
            this.stderr = appendBoundedBuffer(
              this.stderr,
              event.bytes,
              MAX_STDERR_BYTES
            )
            break
          case "terminal":
            this.terminal = event.result
            this.closed = true
            this.notifyProgress()
            break
        }
      }
      this.closed = true
      this.notifyProgress()
    } catch (error) {
      this.pumpFailure = error
      this.closed = true
      this.notifyProgress()
    }
  }

  private async runCommand(
    command: Record<string, unknown>,
    doneKind: string,
    state: WorkspaceTransactionProgress["state"],
    onProgress: (progress: WorkspaceTransactionProgress) => Promise<void>
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
          if (acknowledgmentFailure !== undefined) throw acknowledgmentFailure
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
    try {
      await this.processOrThrow().write(`${JSON.stringify(command)}\n`)
    } catch (error) {
      throw new WorkspaceTransactionHelperError(
        "write_failed",
        "workspace transaction helper command write failed",
        error
      )
    }
  }

  private async readFrame(deadline = Number.POSITIVE_INFINITY): Promise<Record<string, unknown>> {
    while (true) {
      const newline = this.stdout.indexOf(0x0a)
      if (newline >= 0) {
        let line = this.stdout.subarray(0, newline)
        this.stdout = this.stdout.subarray(newline + 1)
        if (line.at(-1) === 0x0d) line = line.subarray(0, line.length - 1)
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
      if (this.pumpFailure !== undefined) {
        throw this.failure(
          "helper_exited",
          "workspace transaction helper failed while streaming output",
          this.pumpFailure
        )
      }
      if (this.closed) {
        throw this.failure(
          "helper_exited",
          "workspace transaction helper exited before completing its command"
        )
      }
      await this.waitForProgress(deadline)
    }
  }

  private async waitForProgress(deadline: number): Promise<void> {
    const remaining = deadline - Date.now()
    if (remaining <= 0) {
      throw this.failure(
        "startup_timeout",
        "workspace transaction helper timed out"
      )
    }
    await new Promise<void>((resolve, reject) => {
      let settled = false
      const finish = (error?: Error): void => {
        if (settled) return
        settled = true
        if (timer !== undefined) clearTimeout(timer)
        this.progressWaiters.delete(progress)
        error === undefined ? resolve() : reject(error)
      }
      const progress = (): void => finish()
      const timer = Number.isFinite(remaining)
        ? setTimeout(() => finish(this.failure(
            "startup_timeout",
            "workspace transaction helper timed out"
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
    const process = this.process
    if (process === undefined) return false
    const closed = await Promise.race([
      process.wait().then(() => true, () => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs))
    ])
    if (!closed && fail) {
      throw this.failure(
        "shutdown_failed",
        "workspace transaction helper did not exit before its deadline"
      )
    }
    return closed
  }

  private processOrThrow(): ManagedExecutionProcess {
    if (this.process === undefined) {
      throw this.failure(
        "helper_exited",
        "workspace transaction helper process is unavailable"
      )
    }
    return this.process
  }

  private failure(
    code: "startup_timeout" | "invalid_protocol" | "helper_exited" | "shutdown_failed",
    message: string,
    cause?: unknown
  ): WorkspaceTransactionHelperError {
    const status = this.terminal === undefined
      ? "running"
      : `exit=${String(this.terminal.exitCode)}`
    const diagnostic = this.stderr.toString("utf8").trim()
    return new WorkspaceTransactionHelperError(
      code,
      `${message}; ${status}${diagnostic.length === 0 ? "" : `; stderr=${diagnostic}`}`,
      cause
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
  expectedState: WorkspaceTransactionProgress["state"]
): WorkspaceTransactionProgress {
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
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
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

function resolvePath(path: string): string {
  return path
}

function appendBoundedBuffer(
  current: Buffer<ArrayBufferLike>,
  chunk: Uint8Array,
  limit: number
): Buffer<ArrayBufferLike> {
  if (current.length >= limit) return current
  return Buffer.concat([current, Buffer.from(chunk).subarray(0, limit - current.length)])
}
