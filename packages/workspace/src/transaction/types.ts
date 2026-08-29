import type {
  WorkspaceChangeTransactionFileObservation,
  WorkspaceChangeTransactionFilePlan
} from "@wanex/protocol"
import type { BorrowedExecutionScope } from "@wanex/runtime/execution"

export interface WorkspaceTransactionOptions {
  readonly rootDir: string
  readonly serviceBin: string
  readonly transactionId: string
  readonly executionScope: BorrowedExecutionScope
  readonly serviceArgsPrefix?: readonly string[]
  readonly startupTimeoutMs?: number
  readonly shutdownTimeoutMs?: number
}

export interface WorkspaceTransactionProgress {
  readonly ordinal: number
  readonly state: "prepared" | "committed"
}

export interface WorkspaceTransactionExecutor {
  prepare(
    files: readonly WorkspaceChangeTransactionFilePlan[],
    onProgress?: (progress: WorkspaceTransactionProgress) => Promise<void>
  ): Promise<void>
  inspect(
    files: readonly WorkspaceChangeTransactionFilePlan[]
  ): Promise<readonly WorkspaceChangeTransactionFileObservation[]>
  commit(
    files: readonly WorkspaceChangeTransactionFilePlan[],
    ordinals: readonly number[],
    onProgress: (progress: WorkspaceTransactionProgress) => Promise<void>
  ): Promise<void>
  cleanup(files: readonly WorkspaceChangeTransactionFilePlan[]): Promise<void>
  terminate(): Promise<void>
}

export type WorkspaceTransactionHelperErrorCode =
  | "spawn_failed"
  | "startup_timeout"
  | "invalid_protocol"
  | "helper_exited"
  | "write_failed"
  | "shutdown_failed"

export class WorkspaceTransactionHelperError extends Error {
  readonly code: WorkspaceTransactionHelperErrorCode

  constructor(
    code: WorkspaceTransactionHelperErrorCode,
    message: string,
    cause?: unknown
  ) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = "WorkspaceTransactionHelperError"
    this.code = code
  }
}
