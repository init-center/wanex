export interface WorkspaceSnapshotRequest {
  readonly repositoryRoot: string
  readonly worktreeParent: string
  readonly isolationId: string
  readonly serviceBin: string
  readonly gitBin?: string
  readonly timeoutMs?: number
}

export interface WorkspaceSnapshotResult {
  readonly isolationId: string
  readonly baseRevision: string
  readonly runtimeRef: string
  readonly rootDir: string
}

export interface WorkspaceSnapshotClient {
  create(request: WorkspaceSnapshotRequest): Promise<WorkspaceSnapshotResult>
  release(
    result: Pick<WorkspaceSnapshotResult, "isolationId" | "baseRevision">,
    request: WorkspaceSnapshotRequest
  ): Promise<void>
}
