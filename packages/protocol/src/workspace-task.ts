import type { PrincipalId } from "./ids.js";
import type { JsonValue } from "./json.js";
import type { WorkspaceChangeSet } from "./workspace.js";
import type { ExecutionEnvironmentBinding } from "./execution-environment.js";

export type WorkspaceTaskAccess = "read_only" | "writable";
export type WorkspaceTaskStrategy = "direct" | "git_worktree";
export type WorkspaceTaskIsolationKind = "fixed" | "git_worktree";
export type WorkspaceTaskRunState =
  | "preparing"
  | "active"
  | "collecting"
  | "proposed"
  | "releasing"
  | "released"
  | "attention";
export type WorkspaceTaskRunOutcome =
  | "read_only_completed"
  | "no_changes"
  | "proposed"
  | "execution_failed"
  | "cancelled";
export type WorkspaceTaskExecutionOutcome = "completed" | "failed" | "cancelled";
export type WorkspaceTaskAttemptKind =
  | "execution"
  | "recovery"
  | "continuation";
export type WorkspaceTaskAttemptState =
  | "active"
  | "completed"
  | "failed"
  | "expired";
export type WorkspaceTaskClaimStatus = "claimed" | "busy" | "already_terminal";

export interface WorkspaceTaskRootIdentity {
  readonly hostId: string;
  readonly generationKey: string;
  readonly rootId: string;
  readonly device: string;
  readonly inode: string;
}

export interface WorkspaceTaskPreparedIsolationIdentity {
  readonly baseRevision: string;
  readonly runtimeRef: string;
}

export interface WorkspaceTaskIsolationIdentity {
  readonly id: string;
  readonly kind: WorkspaceTaskIsolationKind;
  readonly repositoryId?: string;
  readonly baseRevision?: string;
  readonly runtimeRef?: string;
}

export interface WorkspaceTaskRunRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly principalId: PrincipalId;
  readonly access: WorkspaceTaskAccess;
  readonly strategy: WorkspaceTaskStrategy;
  readonly rootIdentity: WorkspaceTaskRootIdentity;
  readonly isolationIdentity: WorkspaceTaskIsolationIdentity;
  readonly executionEnvironment: ExecutionEnvironmentBinding;
  readonly jobId?: string;
  readonly agentId?: string;
  readonly state: WorkspaceTaskRunState;
  readonly executionOutcome?: WorkspaceTaskExecutionOutcome;
  readonly outcome?: WorkspaceTaskRunOutcome;
  readonly summary?: string;
  readonly resourceIds: readonly string[];
  readonly changeSetId?: string;
  readonly proposalId?: string;
  readonly failure?: JsonValue;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly finishedAt?: number;
}

export interface WorkspaceTaskAttemptRecord {
  readonly id: string;
  readonly runId: string;
  readonly ownerId: PrincipalId;
  readonly kind: WorkspaceTaskAttemptKind;
  readonly state: WorkspaceTaskAttemptState;
  readonly leaseExpiresAt: number;
  readonly failure?: JsonValue;
  readonly startedAt: number;
  readonly updatedAt: number;
  readonly finishedAt?: number;
}

export interface WorkspaceTaskRunSnapshot {
  readonly run: WorkspaceTaskRunRecord;
  readonly activeAttempt?: WorkspaceTaskAttemptRecord;
}

export interface WorkspaceTaskClaimResult {
  readonly status: WorkspaceTaskClaimStatus;
  readonly snapshot: WorkspaceTaskRunSnapshot;
}

export interface BeginWorkspaceTaskRunRequest {
  readonly id: string;
  readonly workspaceId: string;
  readonly principalId: PrincipalId;
  readonly access: WorkspaceTaskAccess;
  readonly strategy: WorkspaceTaskStrategy;
  readonly rootIdentity: WorkspaceTaskRootIdentity;
  readonly isolationIdentity: WorkspaceTaskIsolationIdentity;
  readonly executionEnvironment: ExecutionEnvironmentBinding;
  readonly jobId?: string;
  readonly agentId?: string;
  readonly attemptId: string;
  readonly ownerId: PrincipalId;
  readonly claimToken: string;
  readonly leaseMs: number;
}

export interface ClaimWorkspaceTaskRecoveryRequest {
  readonly runId: string;
  readonly attemptId: string;
  readonly ownerId: PrincipalId;
  readonly claimToken: string;
  readonly leaseMs: number;
}

export interface ClaimWorkspaceTaskContinuationRequest {
  readonly runId: string;
  readonly attemptId: string;
  readonly ownerId: PrincipalId;
  readonly claimToken: string;
  readonly leaseMs: number;
  readonly executionEnvironment: ExecutionEnvironmentBinding;
}

export interface RenewWorkspaceTaskRunRequest {
  readonly runId: string;
  readonly attemptId: string;
  readonly claimToken: string;
  readonly leaseMs: number;
}

export interface WorkspaceTaskRunIdentityRequest {
  readonly runId: string;
  readonly attemptId: string;
  readonly claimToken: string;
}

export interface MarkWorkspaceTaskActiveRequest extends WorkspaceTaskRunIdentityRequest {
  readonly preparedIsolation?: WorkspaceTaskPreparedIsolationIdentity;
}

export interface BeginWorkspaceTaskCollectionRequest extends WorkspaceTaskRunIdentityRequest {
  readonly executionOutcome: WorkspaceTaskExecutionOutcome;
  readonly summary?: string;
  readonly resourceIds: readonly string[];
  readonly failure?: JsonValue;
}

interface FinalizeWorkspaceTaskCollectionIdentity extends WorkspaceTaskRunIdentityRequest {
  readonly outcome: WorkspaceTaskRunOutcome;
}

export type FinalizeWorkspaceTaskCollectionRequest =
  | (FinalizeWorkspaceTaskCollectionIdentity & {
      readonly outcome: "proposed";
      readonly changeSet: WorkspaceChangeSet;
      readonly proposalId: string;
      readonly title?: string;
      readonly proposalMetadata?: JsonValue;
    })
  | (FinalizeWorkspaceTaskCollectionIdentity & {
      readonly outcome:
        | "read_only_completed"
        | "no_changes"
        | "execution_failed"
        | "cancelled";
      readonly changeSet?: never;
      readonly proposalId?: never;
      readonly title?: never;
      readonly proposalMetadata?: never;
    });

export type BeginWorkspaceTaskReleaseRequest = WorkspaceTaskRunIdentityRequest;
export type FinalizeWorkspaceTaskReleaseRequest = WorkspaceTaskRunIdentityRequest;

export interface MarkWorkspaceTaskAttentionRequest extends WorkspaceTaskRunIdentityRequest {
  readonly failure: JsonValue;
}

export interface GetWorkspaceTaskRunRequest {
  readonly runId: string;
}

export interface ListWorkspaceTaskRunsRequest {
  readonly rootIdentity?: WorkspaceTaskRootIdentity;
  readonly runIds?: readonly string[];
  readonly workspaceId?: string;
  readonly rootId?: string;
  readonly strategy?: WorkspaceTaskStrategy;
  readonly state?: WorkspaceTaskRunState;
  readonly leaseExpiresBefore?: number;
  readonly limit?: number;
}

export interface ListWorkspaceTaskAttemptsRequest {
  readonly runId: string;
  readonly limit?: number;
}
