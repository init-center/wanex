import type { RuntimeAbortSignal } from "@wanex/protocol"

export type ExecutionTerminationReason =
  | "exited"
  | "signaled"
  | "timed_out"
  | "cancelled"

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
  readonly pid: number
  readonly exitCode: number | null
  readonly signal: NodeJS.Signals | null
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
}

export interface WindowsTreeTerminator {
  terminate(pid: number): Promise<void>
}
