import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { access } from "node:fs/promises"
import { constants } from "node:fs"
import { createHash } from "node:crypto"
import { BoundedExecutionCapture } from "./capture.js"
import type {
  ChildProcessRun,
  ChildSupervisor,
  ChildSupervisorStartRequest,
  ChildTerminalEvidence
} from "./supervisor-types.js"

const PROTOCOL = 1
const MAX_FRAME_BYTES = 2 * 1024 * 1024
const MAX_STDERR_BYTES = 8 * 1024
const DEFAULT_STARTUP_TIMEOUT_MS = 10_000
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 2_000
const DEFAULT_TERMINATION_GRACE_MS = 250

export interface NativeChildSupervisorOptions {
  readonly serviceBin: string
  readonly serviceArgsPrefix?: readonly string[]
  readonly startupTimeoutMs?: number
  readonly shutdownTimeoutMs?: number
}

export class NativeChildSupervisor implements ChildSupervisor {
  private readonly serviceBin: string
  private readonly serviceArgsPrefix: readonly string[]
  private readonly startupTimeoutMs: number
  private readonly shutdownTimeoutMs: number

  constructor(options: NativeChildSupervisorOptions) {
    if (options.serviceBin.trim().length === 0) {
      throw new Error("native child supervisor serviceBin must not be empty")
    }
    this.serviceBin = options.serviceBin
    this.serviceArgsPrefix = [...(options.serviceArgsPrefix ?? [])]
    this.startupTimeoutMs = positiveTimeout(
      options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS,
      "startupTimeoutMs"
    )
    this.shutdownTimeoutMs = positiveTimeout(
      options.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS,
      "shutdownTimeoutMs"
    )
  }

  async start(request: ChildSupervisorStartRequest): Promise<ChildProcessRun> {
    validateRequest(request)
    try {
      await access(this.serviceBin, constants.X_OK)
    } catch (error) {
      throw new NativeChildSupervisorError(
        "spawn_failed",
        "workspace child supervisor helper is not executable",
        error
      )
    }
    const child = spawn(
      this.serviceBin,
      [...this.serviceArgsPrefix, "--workspace-child"],
      {
        detached: false,
        shell: false,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"]
      }
    )
    const process = new NativeChildProcess(
      child,
      request,
      this.startupTimeoutMs,
      this.shutdownTimeoutMs
    )
    try {
      await process.start()
      return process
    } catch (error) {
      await process.terminate("cancelled").catch(() => {})
      throw error
    }
  }
}

export type NativeChildSupervisorErrorCode =
  | "spawn_failed"
  | "startup_timeout"
  | "invalid_protocol"
  | "helper_exited"
  | "write_failed"
  | "shutdown_failed"

export class NativeChildSupervisorError extends Error {
  readonly code: NativeChildSupervisorErrorCode

  constructor(
    code: NativeChildSupervisorErrorCode,
    message: string,
    cause?: unknown
  ) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = "NativeChildSupervisorError"
    this.code = code
  }
}

class NativeChildProcess implements ChildProcessRun {
  private readonly stdout: BoundedExecutionCapture
  private readonly stderr: BoundedExecutionCapture
  private stdoutBuffer: Buffer<ArrayBufferLike> = Buffer.alloc(0)
  private stderrBuffer: Buffer<ArrayBufferLike> = Buffer.alloc(0)
  private closed = false
  private exitCode: number | null = null
  private signal: NodeJS.Signals | null = null
  private spawnError: Error | undefined
  private terminal: ChildTerminalEvidence | undefined
  private terminalPromise: Promise<ChildTerminalEvidence> | undefined
  private commandPending = false
  private terminated = false
  private readonly progressWaiters = new Set<() => void>()

  constructor(
    private readonly child: ChildProcessWithoutNullStreams,
    private readonly request: ChildSupervisorStartRequest,
    private readonly startupTimeoutMs: number,
    private readonly shutdownTimeoutMs: number
  ) {
    const pid = child.pid
    if (pid === undefined) {
      throw new NativeChildSupervisorError(
        "spawn_failed",
        "workspace child supervisor helper has no pid"
      )
    }
    this.stdout = new BoundedExecutionCapture(request.stdoutLimitBytes)
    this.stderr = new BoundedExecutionCapture(request.stderrLimitBytes)
    child.stdin.on("error", () => {})
    child.stdout.on("data", (chunk: Buffer) => {
      this.stdoutBuffer = appendBoundedBuffer(
        this.stdoutBuffer,
        chunk,
        MAX_FRAME_BYTES + 1
      )
      this.notifyProgress()
    })
    child.stderr.on("data", (chunk: Buffer) => {
      this.stderrBuffer = appendBoundedBuffer(
        this.stderrBuffer,
        chunk,
        MAX_STDERR_BYTES
      )
      this.notifyProgress()
    })
    child.once("error", (error) => {
      this.spawnError = error
      this.notifyProgress()
    })
    child.once("close", (code, signal) => {
      this.closed = true
      this.exitCode = code
      this.signal = signal
      this.notifyProgress()
    })
  }

  async start(): Promise<void> {
    await this.writeFrame({
      protocol: PROTOCOL,
      kind: "workspace_child_start",
      run_id: this.request.claim.runId,
      attempt_id: this.request.claim.attemptId,
      child_id: this.request.childId,
      claim_token_sha256: claimTokenHash(this.request.claim.claimToken),
      program: this.request.program,
      args: this.request.args,
      cwd: this.request.cwd,
      environment: this.request.environment,
      stdin_base64: Buffer.from(this.request.stdin).toString("base64"),
      stdout_limit_bytes: this.request.stdoutLimitBytes,
      stderr_limit_bytes: this.request.stderrLimitBytes,
      termination_grace_ms: this.request.terminationGraceMs
    }, "start")
    const frame = await this.readFrame(Date.now() + this.startupTimeoutMs)
    if (
      frame.protocol !== PROTOCOL ||
      frame.kind !== "workspace_child_ready" ||
      frame.run_id !== this.request.claim.runId ||
      frame.attempt_id !== this.request.claim.attemptId ||
      frame.child_id !== this.request.childId ||
      frame.claim_token_sha256 !== claimTokenHash(this.request.claim.claimToken) ||
      Object.keys(frame).length !== 6
    ) {
      throw this.failure(
        "invalid_protocol",
        "workspace child supervisor helper returned an invalid ready frame"
      )
    }
  }

  wait(): Promise<ChildTerminalEvidence> {
    this.terminalPromise ??= this.readUntilTerminal()
    return this.terminalPromise
  }

  async terminate(reason: "timed_out" | "cancelled"): Promise<void> {
    if (this.terminated || this.closed || this.terminal !== undefined) return
    this.terminated = true
    await this.writeFrame({
      protocol: PROTOCOL,
      command: "terminate",
      run_id: this.request.claim.runId,
      attempt_id: this.request.claim.attemptId,
      child_id: this.request.childId,
      claim_token_sha256: claimTokenHash(this.request.claim.claimToken),
      reason
    }, "terminate")
  }

  private async readUntilTerminal(): Promise<ChildTerminalEvidence> {
    while (this.terminal === undefined) {
      const frame = await this.readFrame()
      if (
        frame.protocol !== PROTOCOL ||
        frame.run_id !== this.request.claim.runId ||
        frame.attempt_id !== this.request.claim.attemptId ||
        frame.child_id !== this.request.childId ||
        frame.claim_token_sha256 !== claimTokenHash(this.request.claim.claimToken)
      ) {
        throw this.failure(
          "invalid_protocol",
          "workspace child supervisor helper returned an invalid attempt identity"
        )
      }
      switch (frame.kind) {
        case "workspace_child_stdout":
          this.appendOutput(frame, this.stdout, "stdout")
          break
        case "workspace_child_stderr":
          this.appendOutput(frame, this.stderr, "stderr")
          break
        case "workspace_child_terminal":
          this.terminal = parseTerminal(frame, this.stdout, this.stderr)
          break
        default:
          throw this.failure(
            "invalid_protocol",
            "workspace child supervisor helper returned an unknown frame"
          )
      }
    }
    await this.waitForClose(this.shutdownTimeoutMs)
    return this.terminal
  }

  private appendOutput(
    frame: Record<string, unknown>,
    capture: BoundedExecutionCapture,
    stream: "stdout" | "stderr"
  ): void {
    if (Object.keys(frame).length !== 7 || typeof frame.data_base64 !== "string") {
      throw this.failure(
        "invalid_protocol",
        `workspace child ${stream} frame is invalid`
      )
    }
    if (!isCanonicalBase64(frame.data_base64)) {
      throw this.failure(
        "invalid_protocol",
        `workspace child ${stream} frame is not valid base64`
      )
    }
    const bytes = Buffer.from(frame.data_base64, "base64")
    capture.append(bytes)
  }

  private async writeFrame(
    frame: Record<string, unknown>,
    operation: "start" | "terminate"
  ): Promise<void> {
    const encoded = `${JSON.stringify(frame)}\n`
    await new Promise<void>((resolve, reject) => {
      this.child.stdin.write(encoded, (error) => {
        if (error === null || error === undefined) resolve()
        else {
          reject(this.failure(
            "write_failed",
            `workspace child supervisor ${operation} command write failed`,
            error
          ))
        }
      })
    })
  }

  private async readFrame(deadline = Number.POSITIVE_INFINITY): Promise<Record<string, unknown>> {
    while (true) {
      const newline = this.stdoutBuffer.indexOf(0x0a)
      if (newline >= 0) {
        let line = this.stdoutBuffer.subarray(0, newline)
        this.stdoutBuffer = this.stdoutBuffer.subarray(newline + 1)
        if (line.at(-1) === 0x0d) line = line.subarray(0, line.length - 1)
        let value: unknown
        try {
          value = JSON.parse(line.toString("utf8"))
        } catch (error) {
          throw this.failure("invalid_protocol", "workspace child supervisor helper returned invalid JSON", error)
        }
        if (
          value === null ||
          typeof value !== "object" ||
          Array.isArray(value)
        ) {
          throw this.failure(
            "invalid_protocol",
            "workspace child supervisor helper returned a non-object frame"
          )
        }
        return value as Record<string, unknown>
      }
      if (this.stdoutBuffer.length > MAX_FRAME_BYTES) {
        throw this.failure(
          "invalid_protocol",
          "workspace child supervisor helper frame exceeded its limit"
        )
      }
      if (this.spawnError !== undefined) {
        throw new NativeChildSupervisorError(
          "spawn_failed",
          "workspace child supervisor helper failed to spawn",
          this.spawnError
        )
      }
      if (this.closed) {
        throw this.failure(
          "helper_exited",
          "workspace child supervisor helper exited before terminal evidence"
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
        "workspace child supervisor helper timed out"
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
        ? setTimeout(
            () => finish(this.failure(
              "startup_timeout",
              "workspace child supervisor helper timed out"
            )),
            remaining
          )
        : undefined
      this.progressWaiters.add(progress)
    })
  }

  private notifyProgress(): void {
    for (const notify of this.progressWaiters) notify()
  }

  private async waitForClose(timeoutMs: number): Promise<void> {
    if (this.closed) return
    const closed = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), timeoutMs)
      this.child.once("close", () => {
        clearTimeout(timer)
        resolve(true)
      })
    })
    if (!closed) {
      throw this.failure(
        "shutdown_failed",
        "workspace child supervisor helper did not exit before its deadline"
      )
    }
  }

  private failure(
    code: NativeChildSupervisorErrorCode,
    message: string,
    cause?: unknown
  ): NativeChildSupervisorError {
    const status = this.signal === null
      ? `exit=${String(this.exitCode)}`
      : `signal=${this.signal}`
    const diagnostic = this.stderrBuffer.toString("utf8").trim()
    return new NativeChildSupervisorError(
      code,
      `${message}; ${status}${diagnostic.length === 0 ? "" : `; stderr=${diagnostic}`}`,
      cause
    )
  }
}

function parseTerminal(
  frame: Record<string, unknown>,
  stdout: BoundedExecutionCapture,
  stderr: BoundedExecutionCapture
): ChildTerminalEvidence {
  const keys = [
    "protocol",
    "kind",
    "run_id",
    "attempt_id",
    "child_id",
    "claim_token_sha256",
    "exit_code",
    "signal",
    "termination",
    "cleanup",
    "cleanup_error",
    "stdout_observed_bytes",
    "stderr_observed_bytes",
    "stdout_truncated",
    "stderr_truncated"
  ]
  if (
    Object.keys(frame).length !== keys.length ||
    !keys.every((key) => key in frame) ||
    (frame.exit_code !== null && !Number.isSafeInteger(frame.exit_code)) ||
    (frame.signal !== null && typeof frame.signal !== "string") ||
    !["exited", "signaled", "cancelled", "timed_out", "pipe_eof"].includes(String(frame.termination)) ||
    !["completed", "ambiguous"].includes(String(frame.cleanup)) ||
    (frame.cleanup_error !== null && typeof frame.cleanup_error !== "string") ||
    !Number.isSafeInteger(frame.stdout_observed_bytes) ||
    !Number.isSafeInteger(frame.stderr_observed_bytes) ||
    typeof frame.stdout_truncated !== "boolean" ||
    typeof frame.stderr_truncated !== "boolean"
  ) {
    throw new NativeChildSupervisorError(
      "invalid_protocol",
      "workspace child supervisor helper returned an invalid terminal frame"
    )
  }
  const stdoutValue = outputWithEvidence(
    stdout.snapshot(),
    frame.stdout_observed_bytes as number,
    frame.stdout_truncated as boolean
  )
  const stderrValue = outputWithEvidence(
    stderr.snapshot(),
    frame.stderr_observed_bytes as number,
    frame.stderr_truncated as boolean
  )
  if (
    stdoutValue.observedBytes < stdoutValue.retainedBytes ||
    stderrValue.observedBytes < stderrValue.retainedBytes ||
    stdoutValue.truncated !== (stdoutValue.observedBytes > stdoutValue.retainedBytes) ||
    stderrValue.truncated !== (stderrValue.observedBytes > stderrValue.retainedBytes)
  ) {
    throw new NativeChildSupervisorError(
      "invalid_protocol",
      "workspace child terminal output evidence does not match captured output"
    )
  }
  return {
    exitCode: frame.exit_code as number | null,
    signal: frame.signal as string | null,
    termination: frame.termination as ChildTerminalEvidence["termination"],
    cleanup: frame.cleanup as ChildTerminalEvidence["cleanup"],
    ...(frame.cleanup_error === null
      ? {}
      : { cleanupError: frame.cleanup_error as string }),
    stdout: stdoutValue,
    stderr: stderrValue
  }
}

function outputWithEvidence(
  capture: ReturnType<BoundedExecutionCapture["snapshot"]>,
  observedBytes: number,
  truncated: boolean
): ReturnType<BoundedExecutionCapture["snapshot"]> {
  return {
    ...capture,
    observedBytes,
    truncated
  }
}

function validateRequest(request: ChildSupervisorStartRequest): void {
  if (
    !/^[A-Za-z0-9_.:-]{1,256}$/u.test(request.claim.runId) ||
    !/^[A-Za-z0-9_.:-]{1,256}$/u.test(request.claim.attemptId) ||
    !/^[A-Za-z0-9_.:-]{1,256}$/u.test(request.childId) ||
    request.claim.claimToken.length < 32 ||
    request.claim.claimToken.length > 512 ||
    request.claim.claimToken.includes("\0") ||
    request.program.trim().length === 0 ||
    request.program.includes("\0") ||
    request.cwd.length === 0 ||
    request.cwd.includes("\0") ||
    request.args.some((arg) => arg.includes("\0"))
  ) {
    throw new Error("workspace child supervisor request contains invalid input")
  }
  nonNegativeInteger(request.stdoutLimitBytes, "stdoutLimitBytes")
  nonNegativeInteger(request.stderrLimitBytes, "stderrLimitBytes")
  positiveInteger(request.terminationGraceMs, "terminationGraceMs")
}

function positiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`workspace child supervisor ${name} must be a positive integer`)
  }
}

function nonNegativeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`workspace child supervisor ${name} must be a non-negative integer`)
  }
}

function positiveTimeout(value: number, name: string): number {
  positiveInteger(value, name)
  return value
}

function appendBoundedBuffer(
  current: Buffer,
  chunk: Buffer,
  limit: number
): Buffer {
  if (current.length >= limit) return current
  return Buffer.concat([current, chunk.subarray(0, limit - current.length)])
}

function isCanonicalBase64(value: string): boolean {
  return value.length % 4 === 0 &&
    /^[A-Za-z0-9+/]*={0,2}$/u.test(value) &&
    Buffer.from(value, "base64").toString("base64") === value
}

function claimTokenHash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}
