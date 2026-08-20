import type { RuntimeAbortSignal } from "@wanex/protocol"
import type {
  ChildSupervisor,
  ChildSupervisorClaim
} from "./supervisor-types.js"

export type ExecutionTerminationReason =
  | "exited"
  | "signaled"
  | "timed_out"
  | "cancelled"
  | "pipe_eof"

export type ExecutionCleanupStatus =
  | "not_required"
  | "completed"
  | "failed"

export interface ExecutionOutputLimit {
  readonly stdoutBytes?: number
  readonly stderrBytes?: number
}

export interface ExecutionRequest {
  readonly program: string
  readonly args?: readonly string[]
  readonly cwd: string
  readonly environment?: Readonly<Record<string, string>>
  readonly stdin?: string | Uint8Array
  readonly signal?: RuntimeAbortSignal
  readonly timeoutMs?: number
  readonly output?: ExecutionOutputLimit
}

export interface ExecutionOutput {
  readonly bytes: Uint8Array
  readonly text: string
  readonly observedBytes: number
  readonly retainedBytes: number
  readonly truncated: boolean
}

export interface ExecutionResult {
  readonly program: string
  readonly args: readonly string[]
  readonly cwd: string
  readonly exitCode: number | null
  readonly signal: string | null
  readonly termination: ExecutionTerminationReason
  readonly cleanup: ExecutionCleanupStatus
  readonly cleanupError?: string
  readonly durationMs: number
  readonly stdout: ExecutionOutput
  readonly stderr: ExecutionOutput
}

export interface ExecutionHost {
  execute(request: ExecutionRequest): Promise<ExecutionResult>
}

export interface NodeExecutionHostOptions {
  readonly baseEnvironment?: NodeJS.ProcessEnv
  readonly defaultOutputLimitBytes?: number
  readonly maxOutputLimitBytes?: number
  readonly maxStdinBytes?: number
  readonly terminationGraceMs?: number
  readonly cleanupTimeoutMs?: number
  readonly platform?: NodeJS.Platform
  readonly windowsTreeTerminator?: WindowsTreeTerminator
  readonly childSupervisor?: ChildSupervisor
  readonly supervisorClaim?: ChildSupervisorClaim
}

export interface WindowsTreeTerminator {
  terminate(pid: number): Promise<void>
}
