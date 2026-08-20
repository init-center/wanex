import { spawn } from "node:child_process"
import { randomBytes, randomUUID } from "node:crypto"
import type { ChildProcessWithoutNullStreams } from "node:child_process"
import { BoundedExecutionCapture } from "./capture.js"
import {
  ExecutionAbortedError,
  ExecutionCleanupRequiredError,
  ExecutionSpawnError,
  errorMessage
} from "./errors.js"
import {
  createTaskkillTreeTerminator,
  terminateProcessTree
} from "./process-tree.js"
import type {
  ExecutionCleanupStatus,
  ExecutionHost,
  ExecutionRequest,
  ExecutionResult,
  ExecutionTerminationReason,
  NodeExecutionHostOptions,
  WindowsTreeTerminator
} from "./types.js"
import { supervisorRequestFromExecution } from "./supervisor-types.js"

const DEFAULT_OUTPUT_LIMIT_BYTES = 64 * 1024
const DEFAULT_MAX_OUTPUT_LIMIT_BYTES = 50 * 1024 * 1024
const DEFAULT_MAX_STDIN_BYTES = 1024 * 1024
const DEFAULT_TERMINATION_GRACE_MS = 250
const DEFAULT_CLEANUP_TIMEOUT_MS = 2_000

export class NodeExecutionHost implements ExecutionHost {
  private readonly baseEnvironment: NodeJS.ProcessEnv
  private readonly defaultOutputLimitBytes: number
  private readonly maxOutputLimitBytes: number
  private readonly maxStdinBytes: number
  private readonly terminationGraceMs: number
  private readonly cleanupTimeoutMs: number
  private readonly platform: NodeJS.Platform
  private readonly windowsTreeTerminator: WindowsTreeTerminator
  private readonly childSupervisor: NodeExecutionHostOptions["childSupervisor"]
  private readonly supervisorClaim: NodeExecutionHostOptions["supervisorClaim"]

  constructor(options: NodeExecutionHostOptions = {}) {
    this.baseEnvironment = options.baseEnvironment ?? process.env
    this.defaultOutputLimitBytes =
      options.defaultOutputLimitBytes ?? DEFAULT_OUTPUT_LIMIT_BYTES
    this.maxOutputLimitBytes =
      options.maxOutputLimitBytes ?? DEFAULT_MAX_OUTPUT_LIMIT_BYTES
    this.maxStdinBytes = options.maxStdinBytes ?? DEFAULT_MAX_STDIN_BYTES
    this.terminationGraceMs =
      options.terminationGraceMs ?? DEFAULT_TERMINATION_GRACE_MS
    this.cleanupTimeoutMs =
      options.cleanupTimeoutMs ?? DEFAULT_CLEANUP_TIMEOUT_MS
    this.platform = options.platform ?? process.platform
    this.windowsTreeTerminator =
      options.windowsTreeTerminator ?? createTaskkillTreeTerminator()
    this.childSupervisor = options.childSupervisor
    this.supervisorClaim = options.supervisorClaim
    if (this.supervisorClaim !== undefined && this.childSupervisor === undefined) {
      throw new Error("execution supervisorClaim requires a childSupervisor")
    }
    if (this.supervisorClaim !== undefined) {
      validateSupervisorClaim(this.supervisorClaim)
    }
    validateHostOptions({
      defaultOutputLimitBytes: this.defaultOutputLimitBytes,
      maxOutputLimitBytes: this.maxOutputLimitBytes,
      maxStdinBytes: this.maxStdinBytes,
      terminationGraceMs: this.terminationGraceMs,
      cleanupTimeoutMs: this.cleanupTimeoutMs
    })
  }

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    validateRequest(request)
    if (request.signal?.aborted === true) {
      throw new ExecutionAbortedError()
    }
    if (this.childSupervisor !== undefined) {
      return await this.executeWithSupervisor(request)
    }
    return await this.executeDirect(request)
  }

  private async executeWithSupervisor(
    request: ExecutionRequest
  ): Promise<ExecutionResult> {
    const supervisor = this.childSupervisor
    if (supervisor === undefined) {
      throw new Error("execution child supervisor is not configured")
    }
    const args = [...(request.args ?? [])]
    const stdoutLimit = this.outputLimit(request.output?.stdoutBytes)
    const stderrLimit = this.outputLimit(request.output?.stderrBytes)
    const stdin = stdinBytes(request.stdin)
    if (stdin.byteLength > this.maxStdinBytes) {
      throw new Error(
        `execution stdin exceeds limit: ${stdin.byteLength} > ${this.maxStdinBytes}`
      )
    }
    const startedAt = Date.now()
    const executionId = randomUUID().replaceAll("-", "")
    let run
    try {
      run = await supervisor.start(
        supervisorRequestFromExecution(request, {
          claim: this.supervisorClaim ?? {
            runId: `exec_${executionId}`,
            attemptId: `exat_${executionId}`,
            claimToken: randomBytes(32).toString("hex")
          },
          childId: `exch_${executionId}`,
          environment: {
            ...definedEnvironment(this.baseEnvironment),
            ...(request.environment === undefined
              ? {}
              : definedEnvironment(request.environment))
          },
          stdin,
          stdoutLimitBytes: stdoutLimit,
          stderrLimitBytes: stderrLimit,
          terminationGraceMs: this.terminationGraceMs
        })
      )
    } catch (error) {
      if (isSafePreSpawnFailure(error)) throw error
      throw new ExecutionCleanupRequiredError()
    }
    let requestedTermination: "timed_out" | "cancelled" | undefined
    let timeout: NodeJS.Timeout | undefined
    let terminationError: unknown
    const requestTermination = (reason: "timed_out" | "cancelled"): void => {
      if (requestedTermination !== undefined) return
      requestedTermination = reason
      void run.terminate(reason).catch((error: unknown) => {
        terminationError ??= error
      })
    }
    const abort = (): void => requestTermination("cancelled")
    request.signal?.addEventListener("abort", abort, { once: true })
    if (request.signal?.aborted === true) {
      requestTermination("cancelled")
    }
    if (request.timeoutMs !== undefined) {
      timeout = setTimeout(
        () => requestTermination("timed_out"),
        request.timeoutMs
      )
    }
    try {
      const evidence = await run.wait()
      if (terminationError !== undefined) throw terminationError
      const cleanup = evidence.cleanup === "completed" ? "completed" : "failed"
      return {
        program: request.program,
        args,
        cwd: request.cwd,
        exitCode: evidence.exitCode,
        signal: evidence.signal,
        termination: requestedTermination ?? evidence.termination,
        cleanup,
        ...(cleanup === "failed"
          ? {
              cleanupError:
                evidence.cleanupError ??
                "child supervisor could not prove process tree termination"
            }
          : {}),
        durationMs: Date.now() - startedAt,
        stdout: evidence.stdout,
        stderr: evidence.stderr
      }
    } catch {
      await run.terminate(requestedTermination ?? "cancelled").catch(() => {})
      throw new ExecutionCleanupRequiredError()
    } finally {
      if (timeout !== undefined) clearTimeout(timeout)
      request.signal?.removeEventListener("abort", abort)
    }
  }

  private async executeDirect(request: ExecutionRequest): Promise<ExecutionResult> {

    const args = [...(request.args ?? [])]
    const stdout = new BoundedExecutionCapture(
      this.outputLimit(request.output?.stdoutBytes)
    )
    const stderr = new BoundedExecutionCapture(
      this.outputLimit(request.output?.stderrBytes)
    )
    const stdin = stdinBytes(request.stdin)
    if (stdin.byteLength > this.maxStdinBytes) {
      throw new Error(
        `execution stdin exceeds limit: ${stdin.byteLength} > ${this.maxStdinBytes}`
      )
    }

    const startedAt = Date.now()
    let child: ChildProcessWithoutNullStreams
    try {
      child = spawn(request.program, args, {
        cwd: request.cwd,
        env: {
          ...this.baseEnvironment,
          ...(request.environment ?? {})
        },
        detached: this.platform !== "win32",
        shell: false,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"]
      })
    } catch (error) {
      throw new ExecutionSpawnError(request.program, error)
    }

    child.stdout.on("data", (chunk: Buffer) => stdout.append(chunk))
    child.stderr.on("data", (chunk: Buffer) => stderr.append(chunk))

    return await new Promise<ExecutionResult>((resolve, reject) => {
      const pid = child.pid
      if (pid === undefined) {
        let failed = false
        child.once("error", (error) => {
          failed = true
          reject(new ExecutionSpawnError(request.program, error))
        })
        child.once("close", () => {
          if (!failed) {
            reject(
              new ExecutionSpawnError(
                request.program,
                new Error("spawned process has no pid")
              )
            )
          }
        })
        child.stdin.once("error", () => {})
        child.stdin.end(stdin)
        return
      }
      let closed = false
      let exitCode: number | null = null
      let signalName: NodeJS.Signals | null = null
      let requestedTermination: Exclude<
        ExecutionTerminationReason,
        "exited" | "signaled"
      > | undefined
      let cleanup: ExecutionCleanupStatus = "not_required"
      let cleanupError: string | undefined
      let terminationFinished = true
      let settled = false
      let timeout: NodeJS.Timeout | undefined
      let cleanupDeadline: NodeJS.Timeout | undefined
      const closeWaiters = new Set<(closed: boolean) => void>()

      const cleanupListeners = (): void => {
        if (timeout !== undefined) clearTimeout(timeout)
        if (cleanupDeadline !== undefined) clearTimeout(cleanupDeadline)
        request.signal?.removeEventListener("abort", abort)
      }

      const finish = (): void => {
        if (settled || !closed || !terminationFinished) {
          return
        }
        settled = true
        cleanupListeners()
        const termination =
          requestedTermination ?? (exitCode === null ? "signaled" : "exited")
        resolve({
          program: request.program,
          args,
          cwd: request.cwd,
          exitCode,
          signal: signalName,
          termination,
          cleanup,
          ...(cleanupError === undefined ? {} : { cleanupError }),
          durationMs: Date.now() - startedAt,
          stdout: stdout.snapshot(),
          stderr: stderr.snapshot()
        })
      }

      const waitForClose = async (timeoutMs: number): Promise<boolean> => {
        if (closed) return true
        return await new Promise<boolean>((resolveWait) => {
          const waiter = (didClose: boolean): void => {
            clearTimeout(waitTimeout)
            closeWaiters.delete(waiter)
            resolveWait(didClose)
          }
          const waitTimeout = setTimeout(() => waiter(false), timeoutMs)
          closeWaiters.add(waiter)
        })
      }

      const requestTermination = (
        reason: "timed_out" | "cancelled"
      ): void => {
        if (requestedTermination !== undefined || closed) {
          return
        }
        requestedTermination = reason
        cleanup = "completed"
        terminationFinished = false
        cleanupDeadline = setTimeout(() => {
          cleanup = "failed"
          cleanupError ??= "process tree did not close before cleanup deadline"
          terminationFinished = true
          if (!closed) {
            closed = true
            for (const waiter of closeWaiters) waiter(true)
          }
          finish()
        }, this.cleanupTimeoutMs)
        void terminateProcessTree({
          child,
          platform: this.platform,
          graceMs: this.terminationGraceMs,
          waitForClose,
          windowsTreeTerminator: this.windowsTreeTerminator
        })
          .catch((error) => {
            cleanup = "failed"
            cleanupError = errorMessage(error)
          })
          .finally(() => {
            terminationFinished = true
            finish()
          })
      }

      const abort = (): void => requestTermination("cancelled")
      request.signal?.addEventListener("abort", abort, { once: true })
      if (request.timeoutMs !== undefined) {
        timeout = setTimeout(
          () => requestTermination("timed_out"),
          request.timeoutMs
        )
      }

      child.once("error", (error) => {
        if (settled) return
        settled = true
        cleanupListeners()
        reject(new ExecutionSpawnError(request.program, error))
      })
      child.once("close", (code, closeSignal) => {
        closed = true
        exitCode = code
        signalName = closeSignal
        for (const waiter of closeWaiters) waiter(true)
        finish()
      })
      child.stdin.once("error", () => {})
      child.stdin.end(stdin)
    })
  }

  private outputLimit(requested: number | undefined): number {
    const limit = requested ?? this.defaultOutputLimitBytes
    if (
      !Number.isInteger(limit) ||
      limit < 0 ||
      limit > this.maxOutputLimitBytes
    ) {
      throw new Error(
        `execution output limit must be between 0 and ${this.maxOutputLimitBytes}`
      )
    }
    return limit
  }
}

function validateHostOptions(host: {
  readonly defaultOutputLimitBytes: number
  readonly maxOutputLimitBytes: number
  readonly maxStdinBytes: number
  readonly terminationGraceMs: number
  readonly cleanupTimeoutMs: number
}): void {
  for (const [name, value] of Object.entries(host)) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`execution host ${name} must be a non-negative integer`)
    }
  }
  if (host.defaultOutputLimitBytes > host.maxOutputLimitBytes) {
    throw new Error("execution default output limit exceeds hard maximum")
  }
  if (host.cleanupTimeoutMs <= host.terminationGraceMs) {
    throw new Error("execution cleanup timeout must exceed termination grace")
  }
}

function validateRequest(request: ExecutionRequest): void {
  if (request.program.trim().length === 0 || request.program.includes("\0")) {
    throw new Error("execution program must not be empty or contain NUL")
  }
  if (request.cwd.length === 0 || request.cwd.includes("\0")) {
    throw new Error("execution cwd must not be empty or contain NUL")
  }
  if (request.args?.some((arg) => arg.includes("\0"))) {
    throw new Error("execution args must not contain NUL")
  }
  if (
    request.timeoutMs !== undefined &&
    (!Number.isInteger(request.timeoutMs) || request.timeoutMs <= 0)
  ) {
    throw new Error("execution timeoutMs must be a positive integer")
  }
}

function validateSupervisorClaim(
  claim: NonNullable<NodeExecutionHostOptions["supervisorClaim"]>
): void {
  if (
    !/^[A-Za-z0-9_.:-]{1,256}$/u.test(claim.runId) ||
    !/^[A-Za-z0-9_.:-]{1,256}$/u.test(claim.attemptId) ||
    claim.claimToken.length < 32 ||
    claim.claimToken.length > 512 ||
    claim.claimToken.includes("\0")
  ) {
    throw new Error("execution supervisor claim is invalid")
  }
}

function isSafePreSpawnFailure(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "name" in error &&
    error.name === "NativeChildSupervisorError" &&
    "code" in error &&
    error.code === "spawn_failed"
  )
}

function definedEnvironment(
  environment: NodeJS.ProcessEnv | Readonly<Record<string, string>>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(environment).filter(
      (entry): entry is [string, string] => entry[1] !== undefined
    )
  )
}

function stdinBytes(stdin: ExecutionRequest["stdin"]): Buffer {
  if (stdin === undefined) return Buffer.alloc(0)
  return typeof stdin === "string" ? Buffer.from(stdin, "utf8") : Buffer.from(stdin)
}
