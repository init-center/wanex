import type {
  ExecutionOutput,
  ExecutionRequest,
  ExecutionTerminationReason,
} from "./types.js";

export interface ChildSupervisorStartRequest {
  readonly claim: ChildSupervisorClaim;
  readonly childId: string;
  readonly program: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly environment: Readonly<Record<string, string>>;
  readonly stdin: Uint8Array;
  readonly inputMode: "closed" | "open";
  readonly stdoutLimitBytes: number;
  readonly stderrLimitBytes: number;
  readonly terminationGraceMs: number;
  readonly terminal?: {
    readonly columns: number;
    readonly rows: number;
  };
}

export interface ChildSupervisorClaim {
  readonly runId: string;
  readonly attemptId: string;
  readonly claimToken: string;
}

export interface ChildInteractiveTerminalEvidence {
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly termination: ExecutionTerminationReason | "pipe_eof";
  readonly cleanup: "completed" | "ambiguous";
  readonly cleanupError?: string;
  readonly output: ExecutionOutput;
}

export interface ChildProcessRun {
  wait(): Promise<ChildTerminalEvidence>;
  terminate(reason: "timed_out" | "cancelled"): Promise<void>;
}

export type ChildProcessEvent =
  | { readonly type: "stdout"; readonly bytes: Uint8Array }
  | { readonly type: "stderr"; readonly bytes: Uint8Array }
  | { readonly type: "terminal"; readonly evidence: ChildTerminalEvidence };

export interface ChildManagedProcess extends ChildProcessRun {
  readonly events: AsyncIterable<ChildProcessEvent>;
  write(input: Uint8Array): Promise<void>;
  closeInput(): Promise<void>;
}

export interface ChildTerminalEvidence {
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly termination: ExecutionTerminationReason | "pipe_eof";
  readonly cleanup: "completed" | "ambiguous";
  readonly cleanupError?: string;
  readonly stdout: ExecutionOutput;
  readonly stderr: ExecutionOutput;
}

export type ChildInteractiveTerminalEvent =
  | { readonly type: "data"; readonly bytes: Uint8Array }
  | {
      readonly type: "terminal";
      readonly evidence: ChildInteractiveTerminalEvidence;
    };

export interface ChildInteractiveTerminalProcess {
  readonly events: AsyncIterable<ChildInteractiveTerminalEvent>;
  write(input: Uint8Array): Promise<void>;
  resize(size: { readonly columns: number; readonly rows: number }): Promise<void>;
  terminate(reason: "timed_out" | "cancelled"): Promise<void>;
  wait(): Promise<ChildInteractiveTerminalEvidence>;
  close(): Promise<void>;
}

export interface ChildSupervisor {
  start(request: ChildSupervisorStartRequest): Promise<ChildProcessRun>;
  readonly startManaged?: (
    request: ChildSupervisorStartRequest,
  ) => Promise<ChildManagedProcess>;
  readonly startTerminal?: (
    request: ChildSupervisorStartRequest,
  ) => Promise<ChildInteractiveTerminalProcess>;
}

export function supervisorRequestFromExecution(
  request: ExecutionRequest,
  input: {
    readonly claim: ChildSupervisorClaim;
    readonly childId: string;
    readonly environment: Readonly<Record<string, string>>;
    readonly stdin: Uint8Array;
    readonly inputMode: "closed" | "open";
    readonly stdoutLimitBytes: number;
    readonly stderrLimitBytes: number;
    readonly terminationGraceMs: number;
  },
): ChildSupervisorStartRequest {
  return {
    claim: input.claim,
    childId: input.childId,
    program: request.program,
    args: [...(request.args ?? [])],
    cwd: request.cwd,
    environment: input.environment,
    stdin: input.stdin,
    inputMode: input.inputMode,
    stdoutLimitBytes: input.stdoutLimitBytes,
    stderrLimitBytes: input.stderrLimitBytes,
    terminationGraceMs: input.terminationGraceMs,
  };
}
