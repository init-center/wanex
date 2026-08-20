import type { RepositoryLocator } from "../locator/index.js"
import type { WorkspaceSnapshotClient } from "../snapshot/index.js"

export type WorkspaceIsolationKind = "fixed" | "git_worktree"

export interface WorkspaceIsolationRequest {
  readonly isolationId?: string
  readonly workspaceId?: string
  readonly jobId?: string
  readonly agentId?: string
}

export interface WorkspaceIsolationLease {
  readonly id: string
  readonly kind: WorkspaceIsolationKind
  readonly repositoryId?: string
  readonly rootDir: string
  readonly workspaceId?: string
  readonly jobId?: string
  readonly agentId?: string
  readonly baseRevision?: string
  readonly branchName?: string
  readonly createdAt: number
}

export interface WorkspaceIsolationDurableIdentity {
  readonly id: string
  readonly kind: WorkspaceIsolationKind
  readonly repositoryId?: string
  readonly baseRevision?: string
  readonly branchName?: string
}

export interface WorkspaceIsolationAdapter {
  prepare(request?: WorkspaceIsolationRequest): Promise<WorkspaceIsolationLease>
  release(lease: WorkspaceIsolationLease): Promise<void>
  releaseDurable(identity: WorkspaceIsolationDurableIdentity): Promise<void>
}

export interface FixedWorkspaceIsolationAdapterOptions {
  readonly rootDir: string
  readonly workspaceId?: string
}

export interface GitWorktreeIsolationAdapterOptions {
  readonly repositoryId: string
  readonly locator: RepositoryLocator
  readonly snapshot?: WorkspaceSnapshotClient
}
