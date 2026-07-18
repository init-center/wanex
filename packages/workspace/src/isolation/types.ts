import type { ExecutionHost } from "@wanex/runtime/execution"

export type WorkspaceIsolationKind = "fixed" | "git_worktree"
export type WorkspaceIsolationReleasePolicy = "remove" | "keep"

export interface WorkspaceIsolationRequest {
  readonly workspaceId?: string
  readonly jobId?: string
  readonly agentId?: string
  readonly rootDir?: string
  readonly baseRef?: string
  readonly branchName?: string
  readonly releasePolicy?: WorkspaceIsolationReleasePolicy
  readonly metadata?: Record<string, unknown>
}

export interface WorkspaceIsolationLease {
  readonly id: string
  readonly kind: WorkspaceIsolationKind
  readonly rootDir: string
  readonly workspaceId?: string
  readonly jobId?: string
  readonly agentId?: string
  readonly baseRef?: string
  readonly baseRevision?: string
  readonly branchName?: string
  readonly createdAt: number
  readonly releasePolicy: WorkspaceIsolationReleasePolicy
  readonly metadata?: Record<string, unknown>
}

export interface WorkspaceIsolationAdapter {
  prepare(request?: WorkspaceIsolationRequest): Promise<WorkspaceIsolationLease>
  release(lease: WorkspaceIsolationLease): Promise<void>
}

export interface FixedWorkspaceIsolationAdapterOptions {
  readonly rootDir: string
  readonly workspaceId?: string
  readonly releasePolicy?: WorkspaceIsolationReleasePolicy
}

export interface GitWorktreeIsolationAdapterOptions {
  readonly repoDir: string
  readonly worktreeParentDir: string
  readonly gitBin?: string
  readonly executionHost?: ExecutionHost
  readonly gitTimeoutMs?: number
  readonly branchPrefix?: string
  readonly releasePolicy?: WorkspaceIsolationReleasePolicy
}
