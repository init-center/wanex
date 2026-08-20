import type { RepositoryLocator } from "../locator/index.js"
import type { WorkspaceIsolationLease } from "../isolation/index.js"
import type { ChangeSet } from "../changesets/index.js"

export interface WorkspaceGitRuntimeOptions {
  readonly repositoryId: string
  readonly locator: RepositoryLocator
}

export interface CollectWorktreeRequest {
  readonly lease: WorkspaceIsolationLease
  readonly changeSetId: string
  readonly title?: string
}

export interface WorktreeChangeCollection {
  readonly status: "changes"
  readonly changeSet: ChangeSet
  readonly diff: readonly GitWorktreeDiffEntry[]
}

export interface EmptyWorktreeProjection {
  readonly status: "no_changes"
  readonly diff: readonly []
}

export type WorktreeCollection =
  | WorktreeChangeCollection
  | EmptyWorktreeProjection

export interface GitWorktreeDiffEntry {
  readonly status: GitWorktreeDiffStatus
  readonly path: string
}

export type GitWorktreeDiffStatus = "A" | "M" | "D"
