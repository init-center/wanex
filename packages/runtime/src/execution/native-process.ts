import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { BoundedExecutionCapture } from "./capture.js";
import { NativeManagedExecutionProcess } from "./native-managed-process.js";
import {
  ExecutionAbortedError,
  ExecutionCleanupRequiredError,
  ExecutionSpawnError,
  UnsupportedExecutionCapabilityError,
  errorMessage,
} from "./errors.js";
import {
  createTaskkillTreeTerminator,
  terminateProcessTree,
} from "./process-tree.js";
import type {
  ChildManagedProcess,
  ChildInteractiveTerminalEvent,
  ChildInteractiveTerminalEvidence,
  ChildInteractiveTerminalProcess,
  ChildProcessEvent,
  ChildTerminalEvidence,
} from "./supervisor-types.js";
import type {
  ExecutionCleanupStatus,
  ExecutionProcess,
  ManagedExecutionProcess,
  ManagedExecutionRequest,
  ExecutionRequest,
  ExecutionResult,
  ExecutionTerminationReason,
  ExecutionTerminalProcess,
  ExecutionTerminalRequest,
  ExecutionTerminalEvent,
  ExecutionTerminalResult,
  NativeExecutionProcessOptions,
  WindowsTreeTerminator,
} from "./types.js";
import { supervisorRequestFromExecution } from "./supervisor-types.js";

const DEFAULT_OUTPUT_LIMIT_BYTES = 64 * 1024;
const DEFAULT_MAX_OUTPUT_LIMIT_BYTES = 50 * 1024 * 1024;
const DEFAULT_MAX_STDIN_BYTES = 1024 * 1024;
const DEFAULT_TERMINATION_GRACE_MS = 250;
const DEFAULT_CLEANUP_TIMEOUT_MS = 2_000;

export class NativeExecutionProcess implements ExecutionProcess {
  private readonly launchEnvironment: Readonly<Record<string, string>>;
  private readonly allowedEnvironmentVariables: ReadonlySet<string>;
  private readonly strategy: NativeExecutionProcessOptions["strategy"];
  private readonly allowOneShotProcess: boolean;
  private readonly allowManagedProcess: boolean;
  private readonly allowTerminalProcess: boolean;
  private readonly defaultOutputLimitBytes: number;
  private readonly maxOutputLimitBytes: number;
  private readonly maxStdinBytes: number;
  private readonly terminationGraceMs: number;
  private readonly cleanupTimeoutMs: number;
  private readonly platform: NodeJS.Platform;
  private readonly windowsTreeTerminator: WindowsTreeTerminator;
  private readonly supervisorClaim: NativeExecutionProcessOptions["supervisorClaim"];
  private readonly onManagedProcess: NativeExecutionProcessOptions["onManagedProcess"];
  private readonly onManagedProcessSettled: NativeExecutionProcessOptions["onManagedProcessSettled"];

  constructor(options: NativeExecutionProcessOptions) {
    this.launchEnvironment = normalizeLaunchEnvironment(
      options.launchEnvironment,
    );
    this.allowedEnvironmentVariables = new Set(
      options.allowedEnvironmentVariables,
    );
    this.strategy = options.strategy;
    this.allowOneShotProcess = options.allowOneShotProcess;
    this.allowManagedProcess = options.allowManagedProcess;
    this.allowTerminalProcess =
      supportsNativeTerminal(options.platform ?? process.platform) &&
      options.strategy.kind === "supervised" &&
      options.strategy.childSupervisor.startTerminal !== undefined;
    this.defaultOutputLimitBytes =
      options.defaultOutputLimitBytes ?? DEFAULT_OUTPUT_LIMIT_BYTES;
    this.maxOutputLimitBytes =
      options.maxOutputLimitBytes ?? DEFAULT_MAX_OUTPUT_LIMIT_BYTES;
    this.maxStdinBytes = options.maxStdinBytes ?? DEFAULT_MAX_STDIN_BYTES;
    this.terminationGraceMs =
      options.terminationGraceMs ?? DEFAULT_TERMINATION_GRACE_MS;
    this.cleanupTimeoutMs =
      options.cleanupTimeoutMs ?? DEFAULT_CLEANUP_TIMEOUT_MS;
    this.platform = options.platform ?? process.platform;
    this.windowsTreeTerminator =
      options.windowsTreeTerminator ?? createTaskkillTreeTerminator();
    this.supervisorClaim = options.supervisorClaim;
    this.onManagedProcess = options.onManagedProcess;
    this.onManagedProcessSettled = options.onManagedProcessSettled;
    if (
      this.supervisorClaim !== undefined &&
      this.strategy.kind !== "supervised"
    ) {
      throw new Error("execution supervisorClaim requires supervised strategy");
    }
    if (this.supervisorClaim !== undefined) {
      validateSupervisorClaim(this.supervisorClaim);
    }
    validateHostOptions({
      defaultOutputLimitBytes: this.defaultOutputLimitBytes,
      maxOutputLimitBytes: this.maxOutputLimitBytes,
      maxStdinBytes: this.maxStdinBytes,
      terminationGraceMs: this.terminationGraceMs,
      cleanupTimeoutMs: this.cleanupTimeoutMs,
    });
  }

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    validateRequest(request);
    this.validateRequestEnvironment(request.environment);
    if (!this.allowOneShotProcess) {
      throw new UnsupportedExecutionCapabilityError("process.oneShot");
    }
    if (request.signal?.aborted === true) {
      throw new ExecutionAbortedError();
    }
    if (this.strategy.kind === "supervised") {
      return await this.executeWithSupervisor(request);
    }
    return await this.executeDirect(request);
  }

  async start(
    request: ManagedExecutionRequest,
  ): Promise<ManagedExecutionProcess> {
    validateRequest(request);
    this.validateRequestEnvironment(request.environment);
    if (!this.allowManagedProcess) {
      throw new UnsupportedExecutionCapabilityError("process.managed");
    }
    if (request.signal?.aborted === true) {
      throw new ExecutionAbortedError();
    }
    if (this.strategy.kind === "supervised") {
      return await this.startWithSupervisor(request);
    }
    const managed = new NativeManagedExecutionProcess({
      request,
      launchEnvironment: this.launchEnvironment,
      platform: this.platform,
      windowsTreeTerminator: this.windowsTreeTerminator,
      terminationGraceMs: this.terminationGraceMs,
      cleanupTimeoutMs: this.cleanupTimeoutMs,
      maxStdinBytes: this.maxStdinBytes,
      stdoutLimitBytes: this.outputLimit(request.output?.stdoutBytes),
      stderrLimitBytes: this.outputLimit(request.output?.stderrBytes),
      onSettled: (process) => this.onManagedProcessSettled?.(process),
    });
    this.onManagedProcess?.(managed);
    return managed;
  }

  async startTerminal(
    request: ExecutionTerminalRequest,
  ): Promise<ExecutionTerminalProcess> {
    validateTerminalRequest(request);
    this.validateRequestEnvironment(request.environment);
    if (!this.allowManagedProcess) {
      throw new UnsupportedExecutionCapabilityError("process.managed");
    }
    if (!this.allowTerminalProcess) {
      throw new UnsupportedExecutionCapabilityError("pty");
    }
    if (request.signal?.aborted === true) {
      throw new ExecutionAbortedError();
    }
    if (this.strategy.kind !== "supervised") {
      throw new UnsupportedExecutionCapabilityError("pty");
    }
    const startTerminal = this.strategy.childSupervisor.startTerminal;
    if (startTerminal === undefined) {
      throw new UnsupportedExecutionCapabilityError("pty");
    }
    const startedAt = Date.now();
    const executionId = randomUUID().replaceAll("-", "");
    const claim = this.supervisorClaim ?? {
      runId: `exec_${executionId}`,
      attemptId: `exat_${executionId}`,
      claimToken: randomBytes(32).toString("hex"),
    };
    let run: ChildInteractiveTerminalProcess;
    try {
      run = await startTerminal.call(this.strategy.childSupervisor, {
        claim,
        childId: `exch_${executionId}`,
        program: request.program,
        args: [...(request.args ?? [])],
        cwd: request.cwd,
        environment: {
          ...this.launchEnvironment,
          ...(request.environment === undefined
            ? {}
            : definedEnvironment(request.environment)),
        },
        stdin: Buffer.alloc(0),
        inputMode: "open",
        stdoutLimitBytes: this.outputLimit(request.outputBytes),
        stderrLimitBytes: 0,
        terminationGraceMs: this.terminationGraceMs,
        terminal: request.size,
      });
    } catch (error) {
      if (error instanceof UnsupportedExecutionCapabilityError) throw error;
      if (isSafePreSpawnFailure(error)) throw error;
      throw new ExecutionCleanupRequiredError();
    }
    return new SupervisedExecutionTerminalProcess({
      request,
      run,
      startedAt,
      maxStdinBytes: this.maxStdinBytes,
    });
  }

  private async startWithSupervisor(
    request: ManagedExecutionRequest,
  ): Promise<ManagedExecutionProcess> {
    if (this.strategy.kind !== "supervised") {
      throw new UnsupportedExecutionCapabilityError("process.managed");
    }
    const startedAt = Date.now();
    const executionId = randomUUID().replaceAll("-", "");
    const claim = this.supervisorClaim ?? {
      runId: `exec_${executionId}`,
      attemptId: `exat_${executionId}`,
      claimToken: randomBytes(32).toString("hex"),
    };
    let run: ChildManagedProcess;
    try {
      if (this.strategy.childSupervisor.startManaged === undefined) {
        throw new UnsupportedExecutionCapabilityError("process.managed");
      }
      run = await this.strategy.childSupervisor.startManaged({
        claim,
        childId: `exch_${executionId}`,
        program: request.program,
        args: [...(request.args ?? [])],
        cwd: request.cwd,
        environment: {
          ...this.launchEnvironment,
          ...(request.environment === undefined
            ? {}
            : definedEnvironment(request.environment)),
        },
        stdin: Buffer.alloc(0),
        inputMode: "open",
        stdoutLimitBytes: this.outputLimit(request.output?.stdoutBytes),
        stderrLimitBytes: this.outputLimit(request.output?.stderrBytes),
        terminationGraceMs: this.terminationGraceMs,
      });
    } catch (error) {
      if (error instanceof UnsupportedExecutionCapabilityError) throw error;
      if (isSafePreSpawnFailure(error)) throw error;
      throw new ExecutionCleanupRequiredError();
    }
    const managed = new SupervisedManagedExecutionProcess({
      request,
      run,
      startedAt,
      maxStdinBytes: this.maxStdinBytes,
    });
    this.onManagedProcess?.(managed);
    void managed
      .wait()
      .finally(() => this.onManagedProcessSettled?.(managed))
      .catch(() => {});
    return managed;
  }

  private async executeWithSupervisor(
    request: ExecutionRequest,
  ): Promise<ExecutionResult> {
    const supervisor =
      this.strategy.kind === "supervised"
        ? this.strategy.childSupervisor
        : undefined;
    if (supervisor === undefined) {
      throw new Error("execution child supervisor is not configured");
    }
    const args = [...(request.args ?? [])];
    const stdoutLimit = this.outputLimit(request.output?.stdoutBytes);
    const stderrLimit = this.outputLimit(request.output?.stderrBytes);
    const stdin = stdinBytes(request.stdin);
    if (stdin.byteLength > this.maxStdinBytes) {
      throw new Error(
        `execution stdin exceeds limit: ${stdin.byteLength} > ${this.maxStdinBytes}`,
      );
    }
    const startedAt = Date.now();
    const executionId = randomUUID().replaceAll("-", "");
    let run;
    try {
      run = await supervisor.start(
        supervisorRequestFromExecution(request, {
          claim: this.supervisorClaim ?? {
            runId: `exec_${executionId}`,
            attemptId: `exat_${executionId}`,
            claimToken: randomBytes(32).toString("hex"),
          },
          childId: `exch_${executionId}`,
          environment: {
            ...this.launchEnvironment,
            ...(request.environment === undefined
              ? {}
              : definedEnvironment(request.environment)),
          },
          stdin,
          inputMode: "closed",
          stdoutLimitBytes: stdoutLimit,
          stderrLimitBytes: stderrLimit,
          terminationGraceMs: this.terminationGraceMs,
        }),
      );
    } catch (error) {
      if (isSafePreSpawnFailure(error)) throw error;
      throw new ExecutionCleanupRequiredError();
    }
    let requestedTermination: "timed_out" | "cancelled" | undefined;
    let timeout: NodeJS.Timeout | undefined;
    let terminationError: unknown;
    const requestTermination = (reason: "timed_out" | "cancelled"): void => {
      if (requestedTermination !== undefined) return;
      requestedTermination = reason;
      void run.terminate(reason).catch((error: unknown) => {
        terminationError ??= error;
      });
    };
    const abort = (): void => requestTermination("cancelled");
    request.signal?.addEventListener("abort", abort, { once: true });
    if (request.signal?.aborted === true) {
      requestTermination("cancelled");
    }
    if (request.timeoutMs !== undefined) {
      timeout = setTimeout(
        () => requestTermination("timed_out"),
        request.timeoutMs,
      );
    }
    try {
      const evidence = await run.wait();
      if (terminationError !== undefined) throw terminationError;
      const cleanup = evidence.cleanup === "completed" ? "completed" : "failed";
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
                "child supervisor could not prove process tree termination",
            }
          : {}),
        durationMs: Date.now() - startedAt,
        stdout: evidence.stdout,
        stderr: evidence.stderr,
      };
    } catch {
      await run.terminate(requestedTermination ?? "cancelled").catch(() => {});
      throw new ExecutionCleanupRequiredError();
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
      request.signal?.removeEventListener("abort", abort);
    }
  }

  private async executeDirect(
    request: ExecutionRequest,
  ): Promise<ExecutionResult> {
    const args = [...(request.args ?? [])];
    const stdout = new BoundedExecutionCapture(
      this.outputLimit(request.output?.stdoutBytes),
    );
    const stderr = new BoundedExecutionCapture(
      this.outputLimit(request.output?.stderrBytes),
    );
    const stdin = stdinBytes(request.stdin);
    if (stdin.byteLength > this.maxStdinBytes) {
      throw new Error(
        `execution stdin exceeds limit: ${stdin.byteLength} > ${this.maxStdinBytes}`,
      );
    }

    const startedAt = Date.now();
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(request.program, args, {
        cwd: request.cwd,
        env: {
          ...this.launchEnvironment,
          ...(request.environment ?? {}),
        },
        detached: this.platform !== "win32",
        shell: false,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (error) {
      throw new ExecutionSpawnError(request.program, error);
    }

    child.stdout.on("data", (chunk: Buffer) => stdout.append(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.append(chunk));

    return await new Promise<ExecutionResult>((resolve, reject) => {
      const pid = child.pid;
      if (pid === undefined) {
        let failed = false;
        child.once("error", (error) => {
          failed = true;
          reject(new ExecutionSpawnError(request.program, error));
        });
        child.once("close", () => {
          if (!failed) {
            reject(
              new ExecutionSpawnError(
                request.program,
                new Error("spawned process has no pid"),
              ),
            );
          }
        });
        child.stdin.once("error", () => {});
        child.stdin.end(stdin);
        return;
      }
      let closed = false;
      let exitCode: number | null = null;
      let signalName: NodeJS.Signals | null = null;
      let requestedTermination:
        | Exclude<ExecutionTerminationReason, "exited" | "signaled">
        | undefined;
      let cleanup: ExecutionCleanupStatus = "not_required";
      let cleanupError: string | undefined;
      let terminationFinished = true;
      let settled = false;
      let timeout: NodeJS.Timeout | undefined;
      const closeWaiters = new Set<(closed: boolean) => void>();

      const cleanupListeners = (): void => {
        if (timeout !== undefined) clearTimeout(timeout);
        request.signal?.removeEventListener("abort", abort);
      };

      const finish = (): void => {
        if (settled || !closed || !terminationFinished) {
          return;
        }
        settled = true;
        cleanupListeners();
        const termination =
          requestedTermination ?? (exitCode === null ? "signaled" : "exited");
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
          stderr: stderr.snapshot(),
        });
      };

      const waitForClose = async (timeoutMs: number): Promise<boolean> => {
        if (closed) return true;
        return await new Promise<boolean>((resolveWait) => {
          const waiter = (didClose: boolean): void => {
            clearTimeout(waitTimeout);
            closeWaiters.delete(waiter);
            resolveWait(didClose);
          };
          const waitTimeout = setTimeout(() => waiter(false), timeoutMs);
          closeWaiters.add(waiter);
        });
      };

      const requestTermination = (reason: "timed_out" | "cancelled"): void => {
        if (requestedTermination !== undefined || closed) {
          return;
        }
        requestedTermination = reason;
        cleanup = "completed";
        terminationFinished = false;
        void terminateProcessTree({
          child,
          platform: this.platform,
          graceMs: this.terminationGraceMs,
          cleanupTimeoutMs: this.cleanupTimeoutMs,
          waitForClose,
          windowsTreeTerminator: this.windowsTreeTerminator,
        })
          .catch((error) => {
            cleanup = "failed";
            cleanupError = errorMessage(error);
          })
          .finally(() => {
            terminationFinished = true;
            if (!closed) {
              closed = true;
              for (const waiter of closeWaiters) waiter(true);
            }
            finish();
          });
      };

      const abort = (): void => requestTermination("cancelled");
      request.signal?.addEventListener("abort", abort, { once: true });
      if (request.timeoutMs !== undefined) {
        timeout = setTimeout(
          () => requestTermination("timed_out"),
          request.timeoutMs,
        );
      }

      child.once("error", (error) => {
        if (settled) return;
        settled = true;
        cleanupListeners();
        reject(new ExecutionSpawnError(request.program, error));
      });
      child.once("close", (code, closeSignal) => {
        closed = true;
        exitCode = code;
        signalName = closeSignal;
        for (const waiter of closeWaiters) waiter(true);
        finish();
      });
      child.stdin.once("error", () => {});
      child.stdin.end(stdin);
    });
  }

  private outputLimit(requested: number | undefined): number {
    const limit = requested ?? this.defaultOutputLimitBytes;
    if (
      !Number.isInteger(limit) ||
      limit < 0 ||
      limit > this.maxOutputLimitBytes
    ) {
      throw new Error(
        `execution output limit must be between 0 and ${this.maxOutputLimitBytes}`,
      );
    }
    return limit;
  }

  private validateRequestEnvironment(
    environment: Readonly<Record<string, string>> | undefined,
  ): void {
    for (const [name, value] of Object.entries(environment ?? {})) {
      if (!this.allowedEnvironmentVariables.has(name)) {
        throw new Error(
          `execution environment variable is not admitted: ${name}`,
        );
      }
      validateEnvironmentEntry(name, value);
    }
  }
}

function validateHostOptions(host: {
  readonly defaultOutputLimitBytes: number;
  readonly maxOutputLimitBytes: number;
  readonly maxStdinBytes: number;
  readonly terminationGraceMs: number;
  readonly cleanupTimeoutMs: number;
}): void {
  for (const [name, value] of Object.entries(host)) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`execution host ${name} must be a non-negative integer`);
    }
  }
  if (host.defaultOutputLimitBytes > host.maxOutputLimitBytes) {
    throw new Error("execution default output limit exceeds hard maximum");
  }
  if (host.cleanupTimeoutMs <= host.terminationGraceMs) {
    throw new Error("execution cleanup timeout must exceed termination grace");
  }
}

function validateRequest(request: ExecutionRequest): void {
  if (request.program.trim().length === 0 || request.program.includes("\0")) {
    throw new Error("execution program must not be empty or contain NUL");
  }
  if (request.cwd.length === 0 || request.cwd.includes("\0")) {
    throw new Error("execution cwd must not be empty or contain NUL");
  }
  if (request.args?.some((arg) => arg.includes("\0"))) {
    throw new Error("execution args must not contain NUL");
  }
  if (
    request.timeoutMs !== undefined &&
    (!Number.isInteger(request.timeoutMs) || request.timeoutMs <= 0)
  ) {
    throw new Error("execution timeoutMs must be a positive integer");
  }
}

function validateSupervisorClaim(
  claim: NonNullable<NativeExecutionProcessOptions["supervisorClaim"]>,
): void {
  if (
    !/^[A-Za-z0-9_.:-]{1,256}$/u.test(claim.runId) ||
    !/^[A-Za-z0-9_.:-]{1,256}$/u.test(claim.attemptId) ||
    claim.claimToken.length < 32 ||
    claim.claimToken.length > 512 ||
    claim.claimToken.includes("\0")
  ) {
    throw new Error("execution supervisor claim is invalid");
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
  );
}

function definedEnvironment(
  environment: NodeJS.ProcessEnv | Readonly<Record<string, string>>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(environment).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
}

function normalizeLaunchEnvironment(
  environment: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  const normalized: Record<string, string> = {};
  for (const [name, value] of Object.entries(environment)) {
    validateEnvironmentEntry(name, value);
    normalized[name] = value;
  }
  return Object.freeze(normalized);
}

function validateEnvironmentEntry(name: string, value: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(name) || name.includes("\0")) {
    throw new Error(`execution environment variable name is invalid: ${name}`);
  }
  if (value.includes("\0")) {
    throw new Error(`execution environment variable contains NUL: ${name}`);
  }
}

function stdinBytes(stdin: ExecutionRequest["stdin"]): Buffer {
  if (stdin === undefined) return Buffer.alloc(0);
  return typeof stdin === "string"
    ? Buffer.from(stdin, "utf8")
    : Buffer.from(stdin);
}

class SupervisedManagedExecutionProcess implements ManagedExecutionProcess {
  readonly events: AsyncIterable<import("./types.js").ManagedExecutionEvent>;
  #inputClosed = false;
  #result: Promise<ExecutionResult> | undefined;
  #timeout: NodeJS.Timeout | undefined;
  readonly #abort: () => void;

  constructor(
    private readonly options: {
      readonly request: ManagedExecutionRequest;
      readonly run: ChildManagedProcess;
      readonly startedAt: number;
      readonly maxStdinBytes: number;
    },
  ) {
    this.events = mapChildEvents(
      options.run.events,
      options.request,
      options.startedAt,
    );
    this.#result = options.run
      .wait()
      .then((evidence) =>
        executionResult(options.request, evidence, options.startedAt),
      )
      .finally(() => this.#release());
    this.#abort = () => {
      void this.terminate("cancelled");
    };
    options.request.signal?.addEventListener("abort", this.#abort, {
      once: true,
    });
    if (options.request.timeoutMs !== undefined) {
      this.#timeout = setTimeout(() => {
        void this.terminate("timed_out");
      }, options.request.timeoutMs);
    }
    if (options.request.signal?.aborted === true)
      void this.terminate("cancelled");
  }

  async write(input: string | Uint8Array): Promise<void> {
    if (this.#inputClosed) throw new Error("managed process input is closed");
    const bytes =
      typeof input === "string"
        ? Buffer.from(input, "utf8")
        : Buffer.from(input);
    if (bytes.byteLength > this.options.maxStdinBytes) {
      throw new Error(
        `managed process stdin exceeds limit: ${bytes.byteLength} > ${this.options.maxStdinBytes}`,
      );
    }
    await this.options.run.write(bytes);
  }

  async closeInput(): Promise<void> {
    if (this.#inputClosed) return;
    this.#inputClosed = true;
    await this.options.run.closeInput();
  }

  async terminate(
    reason: "cancelled" | "timed_out" = "cancelled",
  ): Promise<void> {
    await this.options.run.terminate(reason);
  }

  wait(): Promise<ExecutionResult> {
    return this.#result as Promise<ExecutionResult>;
  }

  #release(): void {
    if (this.#timeout !== undefined) clearTimeout(this.#timeout);
    this.options.request.signal?.removeEventListener("abort", this.#abort);
  }
}

class SupervisedExecutionTerminalProcess implements ExecutionTerminalProcess {
  readonly events: AsyncIterable<ExecutionTerminalEvent>;
  #result: Promise<ExecutionTerminalResult>;
  #timeout: NodeJS.Timeout | undefined;
  #inputClosed = false;
  readonly #abort: () => void;

  constructor(
    private readonly options: {
      readonly request: ExecutionTerminalRequest;
      readonly run: ChildInteractiveTerminalProcess;
      readonly startedAt: number;
      readonly maxStdinBytes: number;
    },
  ) {
    this.events = mapTerminalEvents(
      options.run.events,
      options.request,
      options.startedAt,
    );
    this.#result = options.run
      .wait()
      .then((evidence) => terminalResult(options.request, evidence, options.startedAt))
      .finally(() => this.#release());
    this.#abort = () => {
      void this.terminate("cancelled");
    };
    options.request.signal?.addEventListener("abort", this.#abort, { once: true });
    if (options.request.timeoutMs !== undefined) {
      this.#timeout = setTimeout(() => {
        void this.terminate("timed_out");
      }, options.request.timeoutMs);
    }
    if (options.request.signal?.aborted === true) void this.terminate("cancelled");
  }

  async write(input: string | Uint8Array): Promise<void> {
    if (this.#inputClosed) throw new Error("terminal input is closed");
    const bytes = typeof input === "string" ? Buffer.from(input, "utf8") : Buffer.from(input);
    if (bytes.byteLength > this.options.maxStdinBytes) {
      throw new Error(
        `terminal input exceeds limit: ${bytes.byteLength} > ${this.options.maxStdinBytes}`,
      );
    }
    await this.options.run.write(bytes);
  }

  async resize(size: import("./types.js").ExecutionTerminalSize): Promise<void> {
    validateTerminalSize(size);
    await this.options.run.resize(size);
  }

  async terminate(reason: "cancelled" | "timed_out" = "cancelled"): Promise<void> {
    this.#inputClosed = true;
    await this.options.run.terminate(reason);
  }

  async wait(): Promise<ExecutionTerminalResult> {
    return await this.#result;
  }

  async close(): Promise<void> {
    await this.terminate("cancelled");
    await this.wait();
  }

  #release(): void {
    if (this.#timeout !== undefined) clearTimeout(this.#timeout);
    this.options.request.signal?.removeEventListener("abort", this.#abort);
  }
}

async function* mapTerminalEvents(
  events: AsyncIterable<ChildInteractiveTerminalEvent>,
  request: ExecutionTerminalRequest,
  startedAt: number,
): AsyncIterable<ExecutionTerminalEvent> {
  for await (const event of events) {
    if (event.type === "terminal") {
      yield {
        type: "terminal",
        result: terminalResult(request, event.evidence, startedAt),
      };
    } else {
      yield event;
    }
  }
}

function terminalResult(
  request: ExecutionTerminalRequest,
  evidence: ChildInteractiveTerminalEvidence,
  startedAt: number,
): ExecutionTerminalResult {
  return {
    program: request.program,
    args: [...(request.args ?? [])],
    cwd: request.cwd,
    exitCode: evidence.exitCode,
    signal: evidence.signal,
    termination: evidence.termination,
    cleanup: evidence.cleanup === "completed" ? "completed" : "failed",
    ...(evidence.cleanup === "ambiguous"
      ? { cleanupError: evidence.cleanupError ?? "process cleanup was ambiguous" }
      : {}),
    durationMs: Date.now() - startedAt,
        output: evidence.output,
  };
}

async function* mapChildEvents(
  events: AsyncIterable<ChildProcessEvent>,
  request: ManagedExecutionRequest,
  startedAt: number,
): AsyncIterable<import("./types.js").ManagedExecutionEvent> {
  for await (const event of events) {
    if (event.type === "terminal") {
      yield {
        type: "terminal",
        result: executionResult(request, event.evidence, startedAt),
      };
    } else {
      yield event;
    }
  }
}

function executionResult(
  request: ManagedExecutionRequest,
  evidence: ChildTerminalEvidence,
  startedAt: number,
): ExecutionResult {
  return {
    program: request.program,
    args: [...(request.args ?? [])],
    cwd: request.cwd,
    exitCode: evidence.exitCode,
    signal: evidence.signal,
    termination: evidence.termination,
    cleanup: evidence.cleanup === "completed" ? "completed" : "failed",
    ...(evidence.cleanup === "ambiguous"
      ? {
          cleanupError:
            evidence.cleanupError ?? "process cleanup was ambiguous",
        }
      : {}),
    durationMs: Date.now() - startedAt,
    stdout: evidence.stdout,
    stderr: evidence.stderr,
  };
}

function supportsNativeTerminal(platform: NodeJS.Platform): boolean {
  return platform !== "win32";
}

function validateTerminalRequest(request: ExecutionTerminalRequest): void {
  if (
    request.program.trim().length === 0 ||
    request.program.includes("\0") ||
    request.cwd.length === 0 ||
    request.cwd.includes("\0") ||
    (request.args ?? []).some((arg) => arg.includes("\0"))
  ) {
    throw new Error("execution terminal request contains invalid input");
  }
  validateTerminalSize(request.size);
  if (
    request.timeoutMs !== undefined &&
    (!Number.isSafeInteger(request.timeoutMs) || request.timeoutMs <= 0)
  ) {
    throw new Error("execution terminal timeout must be a positive integer");
  }
  if (
    request.outputBytes !== undefined &&
    (!Number.isSafeInteger(request.outputBytes) || request.outputBytes < 0)
  ) {
    throw new Error("execution terminal output limit must be a non-negative integer");
  }
}

function validateTerminalSize(size: {
  readonly columns: number;
  readonly rows: number;
}): void {
  if (
    !Number.isSafeInteger(size.columns) ||
    !Number.isSafeInteger(size.rows) ||
    size.columns < 1 ||
    size.columns > 1_000 ||
    size.rows < 1 ||
    size.rows > 1_000
  ) {
    throw new Error("execution terminal size must be between 1 and 1000");
  }
}
