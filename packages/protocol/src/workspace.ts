import type { PrincipalId } from "./ids.js"
import type { JsonValue } from "./json.js"

export type WorkspaceFileChangeKind = "create" | "update" | "delete"
export type WorkspaceChangeApplyStatus =
  | "applied"
  | "already_applied"
  | "conflicted"
export type WorkspaceChangeOperationKind = "apply" | "undo"
export type WorkspaceChangeProposalState =
  | "open"
  | "approved"
  | "rejected"
  | "withdrawn"
  | "apply_requested"
  | "applied"
  | "apply_failed"
export type WorkspaceChangeProposalOperationKind =
  | "approve"
  | "reject"
  | "withdraw"
  | "request_apply"
  | "mark_applied"
  | "mark_apply_failed"
export type WorkspaceChangeSetState =
  | "submitted"
  | "applied"
  | "already_applied"
  | "conflicted"
  | "undone"
  | "undo_conflicted"

export interface WorkspaceFileChange {
  readonly path: string
  readonly kind: WorkspaceFileChangeKind
  readonly baseText?: string
  readonly baseSha256?: string
  readonly targetText?: string
}

export interface WorkspaceChangeSet {
  readonly id: string
  readonly title?: string
  readonly baseRevision?: string
  readonly changes: readonly WorkspaceFileChange[]
}

export interface WorkspaceFileConflict {
  readonly path: string
  readonly reason:
    | "missing_base"
    | "base_hash_mismatch"
    | "already_exists"
    | "missing_file"
    | "merge_conflict"
    | "undo_target_changed"
  readonly currentSha256?: string
  readonly expectedSha256?: string
}

export interface WorkspaceAppliedFileChange {
  readonly path: string
  readonly kind: WorkspaceFileChangeKind
  readonly beforeText?: string
  readonly afterText?: string
  readonly beforeSha256?: string
  readonly afterSha256?: string
  readonly merged: boolean
}

export interface WorkspaceChangeSetReceipt {
  readonly changeSetId: string
  readonly status: WorkspaceChangeApplyStatus
  readonly files: readonly WorkspaceAppliedFileChange[]
  readonly conflicts: readonly WorkspaceFileConflict[]
}

export interface WorkspaceChangeSetRecord {
  readonly id: string
  readonly workspaceId: string
  readonly principalId: PrincipalId
  readonly title?: string
  readonly baseRevision?: string
  readonly changeSet: WorkspaceChangeSet
  readonly currentState: WorkspaceChangeSetState
  readonly createdAt: number
  readonly updatedAt: number
}

export interface WorkspaceChangeOperationRecord {
  readonly id: string
  readonly changeSetId: string
  readonly operation: WorkspaceChangeOperationKind
  readonly status: WorkspaceChangeApplyStatus
  readonly receipt: WorkspaceChangeSetReceipt
  readonly createdAt: number
}

export interface WorkspaceChangeProposalRecord {
  readonly id: string
  readonly workspaceId: string
  readonly changeSetId: string
  readonly principalId: PrincipalId
  readonly title?: string
  readonly summary?: string
  readonly state: WorkspaceChangeProposalState
  readonly metadata?: JsonValue
  readonly createdAt: number
  readonly updatedAt: number
  readonly closedAt?: number
}

export interface WorkspaceChangeProposalOperationRecord {
  readonly id: string
  readonly proposalId: string
  readonly operation: WorkspaceChangeProposalOperationKind
  readonly actorId: PrincipalId
  readonly fromState: WorkspaceChangeProposalState
  readonly toState: WorkspaceChangeProposalState
  readonly reason?: string
  readonly metadata?: JsonValue
  readonly createdAt: number
}

export interface PutWorkspaceChangeSetRequest {
  readonly workspaceId: string
  readonly principalId: PrincipalId
  readonly changeSet: WorkspaceChangeSet
}

export interface RecordWorkspaceChangeOperationRequest {
  readonly id?: string
  readonly changeSetId: string
  readonly operation: WorkspaceChangeOperationKind
  readonly receipt: WorkspaceChangeSetReceipt
}

export interface GetWorkspaceChangeSetRequest {
  readonly changeSetId: string
}

export interface ListWorkspaceChangeSetsRequest {
  readonly workspaceId?: string
  readonly state?: WorkspaceChangeSetState
  readonly limit?: number
}

export interface ListWorkspaceChangeOperationsRequest {
  readonly changeSetId: string
}

export interface PutWorkspaceChangeProposalRequest {
  readonly id?: string
  readonly workspaceId: string
  readonly changeSetId: string
  readonly principalId: PrincipalId
  readonly title?: string
  readonly summary?: string
  readonly metadata?: JsonValue
  readonly idempotencyKey?: string
}

export interface GetWorkspaceChangeProposalRequest {
  readonly proposalId: string
}

export interface ListWorkspaceChangeProposalsRequest {
  readonly workspaceId?: string
  readonly state?: WorkspaceChangeProposalState
  readonly changeSetId?: string
  readonly limit?: number
}

export interface RecordWorkspaceChangeProposalOperationRequest {
  readonly id?: string
  readonly proposalId: string
  readonly operation: WorkspaceChangeProposalOperationKind
  readonly actorId: PrincipalId
  readonly reason?: string
  readonly metadata?: JsonValue
}

export interface ListWorkspaceChangeProposalOperationsRequest {
  readonly proposalId: string
}
