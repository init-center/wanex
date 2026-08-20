import type { PrincipalId } from "./ids.js";
import type { JsonValue } from "./json.js";

export type WorkspaceFileChangeKind = "create" | "update" | "delete";
export type WorkspaceChangeApplyStatus =
  | "applied"
  | "already_applied"
  | "conflicted";
export type WorkspaceChangeOperationKind = "apply" | "undo";
export type WorkspaceChangeProposalState =
  | "open"
  | "approved"
  | "rejected"
  | "withdrawn"
  | "apply_requested"
  | "applying"
  | "applied"
  | "apply_failed"
  | "recovery_required";
export type WorkspaceChangeProposalOperationKind =
  | "approve"
  | "reject"
  | "withdraw"
  | "request_apply";
export type WorkspaceChangeProposalApplyAttemptState =
  | "active"
  | "applied"
  | "failed"
  | "recovery_required";
export type WorkspaceChangeProposalApplyClaimStatus =
  | "claimed"
  | "busy"
  | "recovery_required"
  | "not_ready"
  | "already_terminal";
export type WorkspaceChangeProposalApplyOutcome =
  | "applied"
  | "apply_failed"
  | "recovery_required";
export type WorkspaceChangeProposalRecoveryStatus =
  | "marked"
  | "not_due"
  | "unchanged";
export type WorkspaceChangeSetState =
  | "submitted"
  | "applied"
  | "already_applied"
  | "conflicted"
  | "undone"
  | "undo_conflicted";
export type WorkspaceChangeTransactionOperation = "apply" | "undo";
export type WorkspaceChangeTransactionSourceKind = "proposal" | "tool" | "host";
export type WorkspaceChangeTransactionState =
  | "planning"
  | "prepared"
  | "committing"
  | "applied"
  | "rolled_back"
  | "recovery_required";
export type WorkspaceChangeTransactionFileState =
  | "pending"
  | "prepared"
  | "committed";
export type WorkspaceChangeTransactionAttemptKind = "execution" | "recovery";
export type WorkspaceChangeTransactionAttemptState =
  | "active"
  | "completed"
  | "failed";
export type WorkspaceChangeTransactionClaimStatus =
  | "claimed"
  | "busy"
  | "recovery_required"
  | "already_terminal";
export type WorkspaceChangeTransactionRecoveryDecision =
  | "rollback_noop"
  | "finish_forward"
  | "finalize"
  | "attention";

export interface WorkspaceFileChange {
  readonly path: string;
  readonly kind: WorkspaceFileChangeKind;
  readonly baseText?: string;
  readonly baseSha256?: string;
  readonly targetText?: string;
}

export interface WorkspaceChangeSet {
  readonly id: string;
  readonly title?: string;
  readonly baseRevision?: string;
  readonly changes: readonly WorkspaceFileChange[];
}

export interface WorkspaceFileConflict {
  readonly path: string;
  readonly reason:
    | "missing_base"
    | "base_hash_mismatch"
    | "already_exists"
    | "missing_file"
    | "merge_conflict"
    | "undo_target_changed";
  readonly currentSha256?: string;
  readonly expectedSha256?: string;
}

export interface WorkspaceAppliedFileChange {
  readonly path: string;
  readonly kind: WorkspaceFileChangeKind;
  readonly beforeText?: string;
  readonly afterText?: string;
  readonly beforeSha256?: string;
  readonly afterSha256?: string;
  readonly merged: boolean;
}

export interface WorkspaceChangeSetReceipt {
  readonly changeSetId: string;
  readonly status: WorkspaceChangeApplyStatus;
  readonly files: readonly WorkspaceAppliedFileChange[];
  readonly conflicts: readonly WorkspaceFileConflict[];
}

export interface WorkspaceChangeSetRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly principalId: PrincipalId;
  readonly title?: string;
  readonly baseRevision?: string;
  readonly changeSet: WorkspaceChangeSet;
  readonly currentState: WorkspaceChangeSetState;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface WorkspaceChangeOperationRecord {
  readonly id: string;
  readonly changeSetId: string;
  readonly operation: WorkspaceChangeOperationKind;
  readonly status: WorkspaceChangeApplyStatus;
  readonly receipt: WorkspaceChangeSetReceipt;
  readonly createdAt: number;
}

export interface WorkspaceChangeProposalRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly changeSetId: string;
  readonly principalId: PrincipalId;
  readonly title?: string;
  readonly summary?: string;
  readonly state: WorkspaceChangeProposalState;
  readonly metadata?: JsonValue;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly closedAt?: number;
}

export interface WorkspaceChangeProposalOperationRecord {
  readonly id: string;
  readonly proposalId: string;
  readonly operation: WorkspaceChangeProposalOperationKind;
  readonly actorId: PrincipalId;
  readonly fromState: WorkspaceChangeProposalState;
  readonly toState: WorkspaceChangeProposalState;
  readonly reason?: string;
  readonly metadata?: JsonValue;
  readonly createdAt: number;
}

export interface WorkspaceChangeProposalApplyAttemptRecord {
  readonly id: string;
  readonly proposalId: string;
  readonly ownerId: PrincipalId;
  readonly state: WorkspaceChangeProposalApplyAttemptState;
  readonly leaseExpiresAt: number;
  readonly workspaceOperationId?: string;
  readonly metadata?: JsonValue;
  readonly failure?: JsonValue;
  readonly claimedAt: number;
  readonly updatedAt: number;
  readonly finishedAt?: number;
}

export interface WorkspaceChangeProposalApplyClaimResult {
  readonly status: WorkspaceChangeProposalApplyClaimStatus;
  readonly proposal: WorkspaceChangeProposalRecord;
  readonly attempt?: WorkspaceChangeProposalApplyAttemptRecord;
}

export interface WorkspaceChangeProposalApplySettlement {
  readonly proposal: WorkspaceChangeProposalRecord;
  readonly attempt: WorkspaceChangeProposalApplyAttemptRecord;
}

export interface WorkspaceChangeProposalRecoveryResult {
  readonly status: WorkspaceChangeProposalRecoveryStatus;
  readonly proposal: WorkspaceChangeProposalRecord;
  readonly attempt?: WorkspaceChangeProposalApplyAttemptRecord;
}

export interface WorkspaceChangeTransactionRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly changeSetId: string;
  readonly operation: WorkspaceChangeTransactionOperation;
  readonly undoSourceOperationId?: string;
  readonly sourceKind: WorkspaceChangeTransactionSourceKind;
  readonly sourceId: string;
  readonly idempotencyKey: string;
  readonly rootIdentitySha256: string;
  readonly proposalApplyAttemptId?: string;
  readonly state: WorkspaceChangeTransactionState;
  readonly planDigest?: string;
  readonly recoveryDecision?: WorkspaceChangeTransactionRecoveryDecision;
  readonly workspaceOperationId?: string;
  readonly failure?: JsonValue;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly finishedAt?: number;
}

export interface WorkspaceChangeTransactionFileRecord {
  readonly transactionId: string;
  readonly ordinal: number;
  readonly path: string;
  readonly beforeText?: string;
  readonly beforeSha256?: string;
  readonly afterText?: string;
  readonly afterSha256?: string;
  readonly state: WorkspaceChangeTransactionFileState;
  readonly updatedAt: number;
}

export interface WorkspaceChangeTransactionAttemptRecord {
  readonly id: string;
  readonly transactionId: string;
  readonly ownerId: PrincipalId;
  readonly kind: WorkspaceChangeTransactionAttemptKind;
  readonly state: WorkspaceChangeTransactionAttemptState;
  readonly leaseExpiresAt: number;
  readonly failure?: JsonValue;
  readonly startedAt: number;
  readonly updatedAt: number;
  readonly finishedAt?: number;
}

export interface WorkspaceChangeTransactionSnapshot {
  readonly transaction: WorkspaceChangeTransactionRecord;
  readonly files: readonly WorkspaceChangeTransactionFileRecord[];
  readonly activeAttempt?: WorkspaceChangeTransactionAttemptRecord;
}

export interface WorkspaceChangeTransactionClaimResult {
  readonly status: WorkspaceChangeTransactionClaimStatus;
  readonly snapshot: WorkspaceChangeTransactionSnapshot;
}

export interface WorkspaceChangeTransactionReconciliation {
  readonly decision: WorkspaceChangeTransactionRecoveryDecision;
  readonly snapshot: WorkspaceChangeTransactionSnapshot;
}

export interface WorkspaceChangeTransactionFinalization {
  readonly snapshot: WorkspaceChangeTransactionSnapshot;
  readonly operation?: WorkspaceChangeOperationRecord;
  readonly proposal?: WorkspaceChangeProposalRecord;
  readonly proposalAttempt?: WorkspaceChangeProposalApplyAttemptRecord;
}

export interface PutWorkspaceChangeSetRequest {
  readonly workspaceId: string;
  readonly principalId: PrincipalId;
  readonly changeSet: WorkspaceChangeSet;
}

export interface RecordWorkspaceChangeOperationRequest {
  readonly id?: string;
  readonly changeSetId: string;
  readonly operation: WorkspaceChangeOperationKind;
  readonly receipt: WorkspaceChangeSetReceipt;
}

export interface GetWorkspaceChangeSetRequest {
  readonly changeSetId: string;
}

export interface ListWorkspaceChangeSetsRequest {
  readonly workspaceId?: string;
  readonly state?: WorkspaceChangeSetState;
  readonly limit?: number;
}

export interface ListWorkspaceChangeOperationsRequest {
  readonly changeSetId: string;
}

export interface PutWorkspaceChangeProposalRequest {
  readonly id?: string;
  readonly workspaceId: string;
  readonly changeSetId: string;
  readonly principalId: PrincipalId;
  readonly title?: string;
  readonly summary?: string;
  readonly metadata?: JsonValue;
  readonly idempotencyKey?: string;
}

export interface GetWorkspaceChangeProposalRequest {
  readonly proposalId: string;
}

export interface ListWorkspaceChangeProposalsRequest {
  readonly workspaceId?: string;
  readonly state?: WorkspaceChangeProposalState;
  readonly changeSetId?: string;
  readonly limit?: number;
}

export interface RecordWorkspaceChangeProposalOperationRequest {
  readonly id?: string;
  readonly proposalId: string;
  readonly operation: WorkspaceChangeProposalOperationKind;
  readonly actorId: PrincipalId;
  readonly reason?: string;
  readonly metadata?: JsonValue;
}

export interface ListWorkspaceChangeProposalOperationsRequest {
  readonly proposalId: string;
}

export interface ClaimWorkspaceChangeProposalApplyRequest {
  readonly proposalId: string;
  readonly attemptId: string;
  readonly ownerId: PrincipalId;
  readonly claimToken: string;
  readonly leaseMs: number;
  readonly metadata?: JsonValue;
}

export interface RenewWorkspaceChangeProposalApplyRequest {
  readonly proposalId: string;
  readonly attemptId: string;
  readonly claimToken: string;
  readonly leaseMs: number;
}

interface WorkspaceChangeProposalApplySettlementIdentity {
  readonly proposalId: string;
  readonly attemptId: string;
  readonly claimToken: string;
}

export type SettleWorkspaceChangeProposalApplyRequest =
  WorkspaceChangeProposalApplySettlementIdentity &
    (
      | {
          readonly outcome: "applied";
          readonly workspaceOperationId: string;
          readonly failure?: never;
        }
      | {
          readonly outcome: "apply_failed";
          readonly workspaceOperationId?: string;
          readonly failure: JsonValue;
        }
      | {
          readonly outcome: "recovery_required";
          readonly workspaceOperationId?: string;
          readonly failure: JsonValue;
        }
    );

export interface MarkWorkspaceChangeProposalRecoveryRequiredRequest {
  readonly proposalId: string;
}

export interface ListWorkspaceChangeProposalApplyAttemptsRequest {
  readonly proposalId: string;
  readonly limit?: number;
}

export interface WorkspaceChangeTransactionProposalBinding {
  readonly proposalId: string;
  readonly proposalAttemptId: string;
  readonly proposalClaimToken: string;
}

export interface BeginWorkspaceChangeTransactionRequest {
  readonly id: string;
  readonly workspaceId: string;
  readonly changeSetId: string;
  readonly operation: WorkspaceChangeTransactionOperation;
  readonly undoSourceOperationId?: string;
  readonly sourceKind: WorkspaceChangeTransactionSourceKind;
  readonly sourceId: string;
  readonly idempotencyKey: string;
  readonly rootIdentitySha256: string;
  readonly proposal?: WorkspaceChangeTransactionProposalBinding;
  readonly attemptId: string;
  readonly ownerId: PrincipalId;
  readonly claimToken: string;
  readonly leaseMs: number;
}

export interface ClaimWorkspaceChangeTransactionRecoveryRequest {
  readonly transactionId: string;
  readonly attemptId: string;
  readonly ownerId: PrincipalId;
  readonly claimToken: string;
  readonly leaseMs: number;
}

export interface RenewWorkspaceChangeTransactionRequest {
  readonly transactionId: string;
  readonly attemptId: string;
  readonly claimToken: string;
  readonly leaseMs: number;
}

export interface WorkspaceChangeTransactionIdentityRequest {
  readonly transactionId: string;
  readonly attemptId: string;
  readonly claimToken: string;
}

export interface WorkspaceChangeTransactionFilePlan {
  readonly ordinal: number;
  readonly path: string;
  readonly beforeText?: string;
  readonly beforeSha256?: string;
  readonly afterText?: string;
  readonly afterSha256?: string;
}

export interface RecordWorkspaceChangeTransactionPlanRequest extends WorkspaceChangeTransactionIdentityRequest {
  readonly files: readonly WorkspaceChangeTransactionFilePlan[];
}

export type MarkWorkspaceChangeTransactionPreparedRequest =
  WorkspaceChangeTransactionIdentityRequest;

export type BeginWorkspaceChangeTransactionCommitRequest =
  WorkspaceChangeTransactionIdentityRequest;

export interface RecordWorkspaceChangeTransactionFileCommittedRequest extends WorkspaceChangeTransactionIdentityRequest {
  readonly ordinal: number;
}

export interface WorkspaceChangeTransactionFileObservation {
  readonly ordinal: number;
  readonly current: "before" | "after" | "other";
}

export interface ReconcileWorkspaceChangeTransactionFilesRequest extends WorkspaceChangeTransactionIdentityRequest {
  readonly observations: readonly WorkspaceChangeTransactionFileObservation[];
}

interface FinalizeWorkspaceChangeTransactionIdentity extends WorkspaceChangeTransactionIdentityRequest {
  readonly failure?: JsonValue;
}

export type FinalizeWorkspaceChangeTransactionRequest =
  FinalizeWorkspaceChangeTransactionIdentity &
    (
      | {
          readonly outcome: "applied" | "conflicted";
          readonly operationId: string;
          readonly receipt: WorkspaceChangeSetReceipt;
          readonly failure?: never;
        }
      | {
          readonly outcome: "rolled_back";
          readonly operationId?: never;
          readonly receipt?: never;
          readonly failure?: never;
        }
      | {
          readonly outcome: "recovery_required";
          readonly operationId?: never;
          readonly receipt?: never;
          readonly failure: JsonValue;
        }
    );

export interface GetWorkspaceChangeTransactionRequest {
  readonly transactionId: string;
}

export interface ListWorkspaceChangeTransactionsRequest {
  readonly workspaceId?: string;
  readonly state?: WorkspaceChangeTransactionState;
  readonly limit?: number;
}

export interface ListWorkspaceChangeTransactionAttemptsRequest {
  readonly transactionId: string;
  readonly limit?: number;
}
