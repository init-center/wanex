import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { BoundedExecutionCapture } from "./capture.js"
import { ExecutionSpawnError, errorMessage } from "./errors.js"
import { terminateProcessTree } from "./process-tree.js"
import type {
  ExecutionCleanupStatus,
  ExecutionResult,
  ExecutionTerminationReason,
  ManagedExecutionEvent,
  ManagedExecutionProcess,
  ManagedExecutionRequest,
  WindowsTreeTerminator
} from "./types.js"

interface NativeManagedExecutionProcessOptions {
  readonly request: ManagedExecutionRequest
  readonly launchEnvironment: Readonly<Record<string, string>>
  readonly platform: NodeJS.Platform
  readonly windowsTreeTerminator: WindowsTreeTerminator
  readonly terminationGraceMs: number
  readonly cleanupTimeoutMs: number
  readonly maxStdinBytes: number
  readonly stdoutLimitBytes: number
  readonly stderrLimitBytes: number
  readonly onSettled: (process: ManagedExecutionProcess) => void
}

export class NativeManagedExecutionProcess implements ManagedExecutionProcess {
  readonly events: AsyncIterable<ManagedExecutionEvent>
  readonly #child: ChildProcessWithoutNullStreams
  readonly #request: ManagedExecutionRequest
  readonly #platform: NodeJS.Platform
  readonly #windowsTreeTerminator: WindowsTreeTerminator
  readonly #terminationGraceMs: number
  readonly #cleanupTimeoutMs: number
  readonly #maxStdinBytes: number
  readonly #stdoutEventLimitBytes: number
  readonly #stderrEventLimitBytes: number
  readonly #stdout: BoundedExecutionCapture
  readonly #stderr: BoundedExecutionCapture
  readonly #eventQueue = new AsyncEventQueue<ManagedExecutionEvent>()
  readonly #result: Promise<ExecutionResult>
  #inputClosed = false
  #stdoutEventBytes = 0
  #stderrEventBytes = 0
  #termination: Exclude<ExecutionTerminationReason, "exited" | "signaled"> | undefined
  #terminationPromise: Promise<void> | undefined

  constructor(options: NativeManagedExecutionProcessOptions) {
    this.#request = options.request
    this.#platform = options.platform
    this.#windowsTreeTerminator = options.windowsTreeTerminator
    this.#terminationGraceMs = options.terminationGraceMs
    this.#cleanupTimeoutMs = options.cleanupTimeoutMs
    this.#maxStdinBytes = options.maxStdinBytes
    this.#stdoutEventLimitBytes = options.stdoutLimitBytes
    this.#stderrEventLimitBytes = options.stderrLimitBytes
    this.#stdout = new BoundedExecutionCapture(options.stdoutLimitBytes)
    this.#stderr = new BoundedExecutionCapture(options.stderrLimitBytes)
    this.events = this.#eventQueue.iterable
    try {
      this.#child = spawn(options.request.program, [...(options.request.args ?? [])], {
        cwd: options.request.cwd,
        env: {
          ...options.launchEnvironment,
          ...(options.request.environment ?? {})
        },
        detached: options.platform !== "win32",
        shell: false,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"]
      })
    } catch (error) {
      throw new ExecutionSpawnError(options.request.program, error)
    }
    const startedAt = Date.now()
    this.#child.stdout.on("data", (chunk: Buffer) => {
      this.#stdout.append(chunk)
      const retained = boundedEventBytes(
        chunk,
        this.#stdoutEventBytes,
        this.#stdoutEventLimitBytes
      )
      this.#stdoutEventBytes += retained.byteLength
      if (retained.byteLength > 0) {
        this.#eventQueue.push({ type: "stdout", bytes: retained })
      }
    })
    this.#child.stderr.on("data", (chunk: Buffer) => {
      this.#stderr.append(chunk)
      const retained = boundedEventBytes(
        chunk,
        this.#stderrEventBytes,
        this.#stderrEventLimitBytes
      )
      this.#stderrEventBytes += retained.byteLength
      if (retained.byteLength > 0) {
        this.#eventQueue.push({ type: "stderr", bytes: retained })
      }
    })
    this.#child.stdin.on("error", () => {})
    this.#result = this.#settle(startedAt).finally(() => options.onSettled(this))
    const abort = (): void => { void this.terminate("cancelled") }
    options.request.signal?.addEventListener("abort", abort, { once: true })
    let timeout: NodeJS.Timeout | undefined
    if (options.request.timeoutMs !== undefined) {
      timeout = setTimeout(() => { void this.terminate("timed_out") }, options.request.timeoutMs)
    }
    void this.#result.finally(() => {
      if (timeout !== undefined) clearTimeout(timeout)
      options.request.signal?.removeEventListener("abort", abort)
    }).catch(() => {})
    if (options.request.signal?.aborted === true) void this.terminate("cancelled")
  }

  async write(input: string | Uint8Array): Promise<void> {
    if (this.#inputClosed) throw new Error("managed process input is closed")
    const bytes = typeof input === "string" ? Buffer.from(input, "utf8") : Buffer.from(input)
    if (bytes.byteLength > this.#maxStdinBytes) {
      throw new Error(
        `managed process stdin exceeds limit: ${bytes.byteLength} > ${this.#maxStdinBytes}`
      )
    }
    await new Promise<void>((resolve, reject) => {
      this.#child.stdin.write(bytes, (error) => {
        if (error === null || error === undefined) resolve()
        else reject(error)
      })
    })
  }

  async closeInput(): Promise<void> {
    if (this.#inputClosed) return
    this.#inputClosed = true
    await new Promise<void>((resolve) => this.#child.stdin.end(resolve))
  }

  async terminate(reason: "cancelled" | "timed_out" = "cancelled"): Promise<void> {
    this.#termination ??= reason
    this.#terminationPromise ??= this.#terminateTree()
    await this.#terminationPromise
  }

  async wait(): Promise<ExecutionResult> {
    return await this.#result
  }

  async #settle(startedAt: number): Promise<ExecutionResult> {
    const closed = await new Promise<{
      readonly code: number | null
      readonly signal: NodeJS.Signals | null
      readonly error?: Error
    }>((resolve) => {
      let settled = false
      this.#child.once("error", (error) => {
        if (settled) return
        settled = true
        resolve({ code: null, signal: null, error })
      })
      this.#child.once("close", (code, signal) => {
        if (settled) return
        settled = true
        resolve({ code, signal })
      })
    })
    if (closed.error !== undefined) {
      const error = new ExecutionSpawnError(this.#request.program, closed.error)
      this.#eventQueue.fail(error)
      throw error
    }
    let cleanup: ExecutionCleanupStatus = "not_required"
    let cleanupError: string | undefined
    if (this.#terminationPromise !== undefined) {
      try {
        await this.#terminationPromise
        cleanup = "completed"
      } catch (error) {
        cleanup = "failed"
        cleanupError = errorMessage(error)
      }
    }
    const result: ExecutionResult = {
      program: this.#request.program,
      args: [...(this.#request.args ?? [])],
      cwd: this.#request.cwd,
      exitCode: closed.code,
      signal: closed.signal,
      termination: this.#termination ?? (closed.code === null ? "signaled" : "exited"),
      cleanup,
      ...(cleanupError === undefined ? {} : { cleanupError }),
      durationMs: Date.now() - startedAt,
      stdout: this.#stdout.snapshot(),
      stderr: this.#stderr.snapshot()
    }
    this.#eventQueue.push({ type: "terminal", result })
    this.#eventQueue.close()
    return result
  }

  async #terminateTree(): Promise<void> {
    let closed = false
    const waitForClose = async (timeoutMs: number): Promise<boolean> => {
      if (this.#child.exitCode !== null || this.#child.signalCode !== null) return true
      return await new Promise<boolean>((resolve) => {
        const finish = (value: boolean): void => {
          clearTimeout(timeout)
          this.#child.removeListener("close", onClose)
          resolve(value)
        }
        const onClose = (): void => { closed = true; finish(true) }
        const timeout = setTimeout(() => finish(false), timeoutMs)
        this.#child.once("close", onClose)
      })
    }
    await terminateProcessTree({
      child: this.#child,
      platform: this.#platform,
      graceMs: this.#terminationGraceMs,
      cleanupTimeoutMs: this.#cleanupTimeoutMs,
      waitForClose,
      windowsTreeTerminator: this.#windowsTreeTerminator
    })
    void closed
  }
}

function boundedEventBytes(
  chunk: Buffer,
  observedBytes: number,
  limitBytes: number
): Uint8Array {
  const remaining = Math.max(0, limitBytes - observedBytes)
  return Uint8Array.from(chunk.subarray(0, remaining))
}

class AsyncEventQueue<T> {
  readonly #values: T[] = []
  readonly #waiters: Array<{
    readonly resolve: (value: IteratorResult<T>) => void
    readonly reject: (error: unknown) => void
  }> = []
  #closed = false
  #failure: unknown

  readonly iterable: AsyncIterable<T> = {
    [Symbol.asyncIterator]: () => ({ next: async () => await this.next() })
  }

  push(value: T): void {
    if (this.#closed) return
    const waiter = this.#waiters.shift()
    if (waiter === undefined) this.#values.push(value)
    else waiter.resolve({ done: false, value })
  }

  close(): void {
    if (this.#closed) return
    this.#closed = true
    for (const waiter of this.#waiters.splice(0)) {
      waiter.resolve({ done: true, value: undefined })
    }
  }

  fail(error: unknown): void {
    if (this.#closed) return
    this.#closed = true
    this.#failure = error
    for (const waiter of this.#waiters.splice(0)) waiter.reject(error)
  }

  private async next(): Promise<IteratorResult<T>> {
    const value = this.#values.shift()
    if (value !== undefined) return { done: false, value }
    if (this.#failure !== undefined) throw this.#failure
    if (this.#closed) return { done: true, value: undefined }
    return await new Promise<IteratorResult<T>>((resolve, reject) => {
      this.#waiters.push({ resolve, reject })
    })
  }
}
