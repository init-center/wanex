export type WorkspaceSnapshotHelperErrorCode = "spawn_failed" | "timeout" | "invalid_protocol" | "helper_failed"

export class WorkspaceSnapshotHelperError extends Error {
  constructor(readonly code: WorkspaceSnapshotHelperErrorCode, message: string, options?: unknown) {
    super(message, options === undefined ? undefined : { cause: options })
    this.name = "WorkspaceSnapshotHelperError"
  }
}
