import type { ExecutionOutput, ExecutionRequest, ExecutionTerminationReason } from "./types.js"

export interface ChildSupervisorStartRequest {
  readonly claim: ChildSupervisorClaim
  readonly childId: string
  readonly program: string
  readonly args: readonly string[]
  readonly cwd: string
  readonly environment: Readonly<Record<string, string>>
  readonly stdin: Uint8Array
  readonly stdoutLimitBytes: number
  readonly stderrLimitBytes: number
  readonly terminationGraceMs: number
}

export interface ChildSupervisorClaim {
  readonly runId: string
  readonly attemptId: string
  readonly claimToken: string
}

export interface ChildTerminalEvidence {
  readonly exitCode: number | null
  readonly signal: string | null
  readonly termination: ExecutionTerminationReason | "pipe_eof"
  readonly cleanup: "completed" | "ambiguous"
  readonly cleanupError?: string
  readonly stdout: ExecutionOutput
  readonly stderr: ExecutionOutput
}

export interface ChildProcessRun {
  wait(): Promise<ChildTerminalEvidence>
  terminate(reason: "timed_out" | "cancelled"): Promise<void>
}

export interface ChildSupervisor {
  start(request: ChildSupervisorStartRequest): Promise<ChildProcessRun>
}

export function supervisorRequestFromExecution(
  request: ExecutionRequest,
  input: {
    readonly claim: ChildSupervisorClaim
    readonly childId: string
    readonly environment: Readonly<Record<string, string>>
    readonly stdin: Uint8Array
    readonly stdoutLimitBytes: number
    readonly stderrLimitBytes: number
    readonly terminationGraceMs: number
  }
): ChildSupervisorStartRequest {
  return {
    claim: input.claim,
    childId: input.childId,
    program: request.program,
    args: [...(request.args ?? [])],
    cwd: request.cwd,
    environment: input.environment,
    stdin: input.stdin,
    stdoutLimitBytes: input.stdoutLimitBytes,
    stderrLimitBytes: input.stderrLimitBytes,
    terminationGraceMs: input.terminationGraceMs
  }
}
