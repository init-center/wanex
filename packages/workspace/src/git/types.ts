import type { JsonValue, PrincipalId, WorkspaceChangeProposalRecord, WorkspaceChangeSetRecord } from "@wanex/protocol"
import type { WorkspaceStore } from "@wanex/storage/workspace"
import type { ExecutionHost } from "@wanex/runtime/execution"
import type { WorkspaceIsolationLease } from "../isolation/index.js"

export interface WorkspaceGitRuntimeOptions {
  readonly storage: WorkspaceStore
  readonly repoDir: string
  readonly gitBin?: string
  readonly executionHost?: ExecutionHost
  readonly workspaceId?: string
  readonly principalId?: PrincipalId
}

export interface CreateChangeSetFromWorktreeRequest {
  readonly lease: WorkspaceIsolationLease
  readonly id?: string
  readonly title?: string
  readonly workspaceId?: string
  readonly principalId?: PrincipalId
  readonly createProposal?: boolean | CreateProposalFromWorktreeOptions
}

export interface CreateProposalFromWorktreeOptions {
  readonly id?: string
  readonly title?: string
  readonly summary?: string
  readonly metadata?: JsonValue
  readonly idempotencyKey?: string
}

export interface CreateChangeSetFromWorktreeResult {
  readonly changeSet: WorkspaceChangeSetRecord
  readonly proposal?: WorkspaceChangeProposalRecord
  readonly diff: readonly GitWorktreeDiffEntry[]
}

export interface GitWorktreeDiffEntry {
  readonly status: GitWorktreeDiffStatus
  readonly path: string
}

export type GitWorktreeDiffStatus = "A" | "M" | "D"
