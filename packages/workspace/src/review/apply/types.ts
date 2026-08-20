import type {
  JsonValue,
  PrincipalId,
  WorkspaceChangeOperationRecord,
  WorkspaceChangeProposalApplyAttemptRecord,
  WorkspaceChangeProposalRecord,
  WorkspaceChangeSetRecord
} from "@wanex/protocol"
import type { WorkspaceStore } from "@wanex/storage/workspace"
import type {
  ApplyWorkspaceChangeSetResult,
  WorkspaceRuntime
} from "../../index.js"

export interface WorkspaceProposalApplyRuntimeOptions {
  readonly storage: WorkspaceStore
  readonly workspace: WorkspaceRuntime
  readonly actorId?: PrincipalId
  readonly createAttemptId?: () => string
  readonly createClaimToken?: () => string
}

export interface ApplyProposalRequest {
  readonly proposalId: string
  readonly actorId?: PrincipalId
  readonly metadata?: JsonValue
}

export type ApplyProposalStatus =
  | "applied"
  | "apply_failed"
  | "busy"
  | "recovery_required"
  | "not_ready"
  | "already_terminal"

export interface ApplyProposalResult {
  readonly status: ApplyProposalStatus
  readonly proposal: WorkspaceChangeProposalRecord
  readonly changeSet: WorkspaceChangeSetRecord
  readonly workspaceOperation?: WorkspaceChangeOperationRecord
  readonly applyAttempt?: WorkspaceChangeProposalApplyAttemptRecord
  readonly applyResult?: ApplyWorkspaceChangeSetResult
  readonly error?: JsonValue
}

export interface ApplyProposalBatchItem {
  readonly proposalId: string
  readonly dependsOn?: readonly string[]
  readonly actorId?: PrincipalId
  readonly metadata?: JsonValue
}

export interface ApplyProposalBatchRequest {
  readonly items: readonly ApplyProposalBatchItem[]
  readonly actorId?: PrincipalId
  readonly stopOnFailure?: boolean
  readonly metadata?: JsonValue
}

export type ApplyProposalBatchStatus = "applied" | "partial" | "failed"
export type ApplyProposalBatchItemStatus =
  | "applied"
  | "apply_failed"
  | "busy"
  | "recovery_required"
  | "not_ready"
  | "already_terminal"
  | "blocked"
  | "needs_review"
  | "skipped"

export interface ApplyProposalBatchItemResult {
  readonly proposalId: string
  readonly status: ApplyProposalBatchItemStatus
  readonly dependsOn: readonly string[]
  readonly result?: ApplyProposalResult
  readonly error?: JsonValue
}

export interface ApplyProposalBatchResult {
  readonly status: ApplyProposalBatchStatus
  readonly orderedProposalIds: readonly string[]
  readonly results: readonly ApplyProposalBatchItemResult[]
}

export type ApplyProposalPlanItemStatus = "ready" | "queued" | "needs_review"
export type ApplyProposalPlanConflictReason =
  | "same_path_without_dependency"
  | "create_create_same_path"
  | "delete_update_same_path"

export interface ApplyProposalPlanConflict {
  readonly path: string
  readonly reason: ApplyProposalPlanConflictReason
  readonly conflictingProposalId: string
  readonly conflictingChangeSetId: string
}

export interface ApplyProposalPlanItem {
  readonly proposalId: string
  readonly changeSetId: string
  readonly status: ApplyProposalPlanItemStatus
  readonly dependsOn: readonly string[]
  readonly paths: readonly string[]
  readonly conflicts: readonly ApplyProposalPlanConflict[]
  readonly actorId?: PrincipalId
  readonly metadata?: JsonValue
}

export interface ApplyProposalBatchPlanResult {
  readonly status: "executable" | "needs_review"
  readonly orderedProposalIds: readonly string[]
  readonly items: readonly ApplyProposalPlanItem[]
}
