import type {
  WorkspaceChangeTransactionFileObservation,
  WorkspaceChangeTransactionFilePlan
} from "@wanex/protocol"

export interface NativeWorkspaceTransactionOptions {
  readonly rootDir: string
  readonly serviceBin: string
  readonly transactionId: string
  readonly serviceArgsPrefix?: readonly string[]
  readonly startupTimeoutMs?: number
  readonly shutdownTimeoutMs?: number
}

export interface NativeWorkspaceTransactionProgress {
  readonly ordinal: number
  readonly state: "prepared" | "committed"
}

export interface NativeWorkspaceTransactionExecutor {
  prepare(
    files: readonly WorkspaceChangeTransactionFilePlan[],
    onProgress?: (progress: NativeWorkspaceTransactionProgress) => Promise<void>
  ): Promise<void>
  inspect(
    files: readonly WorkspaceChangeTransactionFilePlan[]
  ): Promise<readonly WorkspaceChangeTransactionFileObservation[]>
  commit(
    files: readonly WorkspaceChangeTransactionFilePlan[],
    ordinals: readonly number[],
    onProgress: (progress: NativeWorkspaceTransactionProgress) => Promise<void>
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
