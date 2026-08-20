import type {
  BeginWorkspaceChangeTransactionCommitRequest,
  BeginWorkspaceChangeTransactionRequest,
  BeginWorkspaceTaskCollectionRequest,
  BeginWorkspaceTaskReleaseRequest,
  BeginWorkspaceTaskRunRequest,
  ClaimWorkspaceChangeProposalApplyRequest,
  ClaimWorkspaceChangeTransactionRecoveryRequest,
  ClaimWorkspaceTaskRecoveryRequest,
  FinalizeWorkspaceChangeTransactionRequest,
  FinalizeWorkspaceTaskCollectionRequest,
  FinalizeWorkspaceTaskReleaseRequest,
  GetWorkspaceChangeTransactionRequest,
  GetWorkspaceChangeProposalRequest,
  GetWorkspaceChangeSetRequest,
  ListWorkspaceChangeOperationsRequest,
  ListWorkspaceChangeProposalApplyAttemptsRequest,
  ListWorkspaceChangeProposalOperationsRequest,
  ListWorkspaceChangeProposalsRequest,
  ListWorkspaceChangeSetsRequest,
  ListWorkspaceChangeTransactionAttemptsRequest,
  ListWorkspaceChangeTransactionsRequest,
  ListWorkspaceTaskAttemptsRequest,
  ListWorkspaceTaskRunsRequest,
  MarkWorkspaceTaskActiveRequest,
  MarkWorkspaceTaskAttentionRequest,
  MarkWorkspaceChangeTransactionPreparedRequest,
  MarkWorkspaceChangeProposalRecoveryRequiredRequest,
  PutWorkspaceChangeProposalRequest,
  PutWorkspaceChangeSetRequest,
  RecordWorkspaceChangeOperationRequest,
  RecordWorkspaceChangeProposalOperationRequest,
  RecordWorkspaceChangeTransactionFileCommittedRequest,
  RecordWorkspaceChangeTransactionPlanRequest,
  ReconcileWorkspaceChangeTransactionFilesRequest,
  RenewWorkspaceChangeProposalApplyRequest,
  RenewWorkspaceChangeTransactionRequest,
  RenewWorkspaceTaskRunRequest,
  SettleWorkspaceChangeProposalApplyRequest,
  WorkspaceChangeOperationRecord,
  WorkspaceChangeProposalApplyAttemptRecord,
  WorkspaceChangeProposalApplyClaimResult,
  WorkspaceChangeProposalApplySettlement,
  WorkspaceChangeProposalOperationRecord,
  WorkspaceChangeProposalRecord,
  WorkspaceChangeProposalRecoveryResult,
  WorkspaceChangeSetRecord,
  WorkspaceChangeTransactionAttemptRecord,
  WorkspaceChangeTransactionClaimResult,
  WorkspaceChangeTransactionFinalization,
  WorkspaceChangeTransactionReconciliation,
  WorkspaceChangeTransactionSnapshot,
  WorkspaceTaskAttemptRecord,
  WorkspaceTaskClaimResult,
  WorkspaceTaskRunSnapshot,
} from "@wanex/protocol";

import {
  fromRpcWorkspaceChangeProposalApplyAttemptRecord,
  fromRpcWorkspaceChangeProposalApplyClaimResult,
  fromRpcWorkspaceChangeProposalApplySettlement,
  fromRpcWorkspaceChangeProposalRecoveryResult,
  fromRpcWorkspaceChangeOperationRecord,
  fromRpcWorkspaceChangeProposalOperationRecord,
  fromRpcWorkspaceChangeProposalRecord,
  fromRpcWorkspaceChangeSetRecord,
  fromRpcWorkspaceChangeTransactionAttemptRecord,
  fromRpcWorkspaceChangeTransactionClaimResult,
  fromRpcWorkspaceChangeTransactionFinalization,
  fromRpcWorkspaceChangeTransactionReconciliation,
  fromRpcWorkspaceChangeTransactionSnapshot,
  fromRpcWorkspaceTaskAttemptRecord,
  fromRpcWorkspaceTaskClaimResult,
  fromRpcWorkspaceTaskRunSnapshot,
  toRpcBeginWorkspaceChangeTransactionCommitRequest,
  toRpcBeginWorkspaceChangeTransactionRequest,
  toRpcBeginWorkspaceTaskCollectionRequest,
  toRpcBeginWorkspaceTaskReleaseRequest,
  toRpcBeginWorkspaceTaskRunRequest,
  toRpcClaimWorkspaceChangeProposalApplyRequest,
  toRpcClaimWorkspaceChangeTransactionRecoveryRequest,
  toRpcClaimWorkspaceTaskRecoveryRequest,
  toRpcFinalizeWorkspaceChangeTransactionRequest,
  toRpcFinalizeWorkspaceTaskCollectionRequest,
  toRpcFinalizeWorkspaceTaskReleaseRequest,
  toRpcListWorkspaceTaskAttemptsRequest,
  toRpcListWorkspaceTaskRunsRequest,
  toRpcListWorkspaceChangeOperationsRequest,
  toRpcListWorkspaceChangeProposalApplyAttemptsRequest,
  toRpcListWorkspaceChangeProposalOperationsRequest,
  toRpcListWorkspaceChangeProposalsRequest,
  toRpcListWorkspaceChangeSetsRequest,
  toRpcMarkWorkspaceChangeProposalRecoveryRequiredRequest,
  toRpcMarkWorkspaceChangeTransactionPreparedRequest,
  toRpcMarkWorkspaceTaskActiveRequest,
  toRpcMarkWorkspaceTaskAttentionRequest,
  toRpcPutWorkspaceChangeProposalRequest,
  toRpcPutWorkspaceChangeSetRequest,
  toRpcRecordWorkspaceChangeOperationRequest,
  toRpcRecordWorkspaceChangeProposalOperationRequest,
  toRpcRecordWorkspaceChangeTransactionFileCommittedRequest,
  toRpcRecordWorkspaceChangeTransactionPlanRequest,
  toRpcReconcileWorkspaceChangeTransactionFilesRequest,
  toRpcRenewWorkspaceChangeProposalApplyRequest,
  toRpcRenewWorkspaceChangeTransactionRequest,
  toRpcRenewWorkspaceTaskRunRequest,
  toRpcSettleWorkspaceChangeProposalApplyRequest,
} from "./codec-workspace.js";
import { assertArray } from "./codec-helpers.js";
import { RpcStoreFacetBase } from "./rpc-store-base.js";
import type { WorkspaceStorageRpcCommand } from "./generated/storage-rpc.js";

export class WorkspaceStoreMethods extends RpcStoreFacetBase {
  async putWorkspaceChangeSet(
    request: PutWorkspaceChangeSetRequest,
  ): Promise<WorkspaceChangeSetRecord> {
    const value = await this.callWorkspace({
      command: "put-workspace-change-set",
      request: toRpcPutWorkspaceChangeSetRequest(request),
    });
    return fromRpcWorkspaceChangeSetRecord(value);
  }

  async getWorkspaceChangeSet(
    request: GetWorkspaceChangeSetRequest,
  ): Promise<WorkspaceChangeSetRecord | null> {
    const value = await this.callWorkspace({
      command: "get-workspace-change-set",
      change_set_id: request.changeSetId,
    });
    return value === null ? null : fromRpcWorkspaceChangeSetRecord(value);
  }

  async listWorkspaceChangeSets(
    request: ListWorkspaceChangeSetsRequest,
  ): Promise<WorkspaceChangeSetRecord[]> {
    const value = await this.callWorkspace({
      command: "list-workspace-change-sets",
      request: toRpcListWorkspaceChangeSetsRequest(request),
    });
    assertArray(value, "workspace changesets");
    return value.map(fromRpcWorkspaceChangeSetRecord);
  }

  async recordWorkspaceChangeOperation(
    request: RecordWorkspaceChangeOperationRequest,
  ): Promise<WorkspaceChangeOperationRecord> {
    const value = await this.callWorkspace({
      command: "record-workspace-change-operation",
      request: toRpcRecordWorkspaceChangeOperationRequest(request),
    });
    return fromRpcWorkspaceChangeOperationRecord(value);
  }

  async listWorkspaceChangeOperations(
    request: ListWorkspaceChangeOperationsRequest,
  ): Promise<WorkspaceChangeOperationRecord[]> {
    const value = await this.callWorkspace({
      command: "list-workspace-change-operations",
      request: toRpcListWorkspaceChangeOperationsRequest(request),
    });
    assertArray(value, "workspace change operations");
    return value.map(fromRpcWorkspaceChangeOperationRecord);
  }

  async putWorkspaceChangeProposal(
    request: PutWorkspaceChangeProposalRequest,
  ): Promise<WorkspaceChangeProposalRecord> {
    const value = await this.callWorkspace({
      command: "put-workspace-change-proposal",
      request: toRpcPutWorkspaceChangeProposalRequest(request),
    });
    return fromRpcWorkspaceChangeProposalRecord(value);
  }

  async getWorkspaceChangeProposal(
    request: GetWorkspaceChangeProposalRequest,
  ): Promise<WorkspaceChangeProposalRecord | null> {
    const value = await this.callWorkspace({
      command: "get-workspace-change-proposal",
      proposal_id: request.proposalId,
    });
    return value === null ? null : fromRpcWorkspaceChangeProposalRecord(value);
  }

  async listWorkspaceChangeProposals(
    request: ListWorkspaceChangeProposalsRequest,
  ): Promise<WorkspaceChangeProposalRecord[]> {
    const value = await this.callWorkspace({
      command: "list-workspace-change-proposals",
      request: toRpcListWorkspaceChangeProposalsRequest(request),
    });
    assertArray(value, "workspace change proposals");
    return value.map(fromRpcWorkspaceChangeProposalRecord);
  }

  async recordWorkspaceChangeProposalOperation(
    request: RecordWorkspaceChangeProposalOperationRequest,
  ): Promise<WorkspaceChangeProposalOperationRecord> {
    const value = await this.callWorkspace({
      command: "record-workspace-change-proposal-operation",
      request: toRpcRecordWorkspaceChangeProposalOperationRequest(request),
    });
    return fromRpcWorkspaceChangeProposalOperationRecord(value);
  }

  async listWorkspaceChangeProposalOperations(
    request: ListWorkspaceChangeProposalOperationsRequest,
  ): Promise<WorkspaceChangeProposalOperationRecord[]> {
    const value = await this.callWorkspace({
      command: "list-workspace-change-proposal-operations",
      request: toRpcListWorkspaceChangeProposalOperationsRequest(request),
    });
    assertArray(value, "workspace change proposal operations");
    return value.map(fromRpcWorkspaceChangeProposalOperationRecord);
  }

  async claimWorkspaceChangeProposalApply(
    request: ClaimWorkspaceChangeProposalApplyRequest,
  ): Promise<WorkspaceChangeProposalApplyClaimResult> {
    const value = await this.callWorkspace({
      command: "claim-workspace-change-proposal-apply",
      request: toRpcClaimWorkspaceChangeProposalApplyRequest(request),
    });
    return fromRpcWorkspaceChangeProposalApplyClaimResult(value);
  }

  async renewWorkspaceChangeProposalApply(
    request: RenewWorkspaceChangeProposalApplyRequest,
  ): Promise<WorkspaceChangeProposalApplyAttemptRecord> {
    const value = await this.callWorkspace({
      command: "renew-workspace-change-proposal-apply",
      request: toRpcRenewWorkspaceChangeProposalApplyRequest(request),
    });
    return fromRpcWorkspaceChangeProposalApplyAttemptRecord(value);
  }

  async settleWorkspaceChangeProposalApply(
    request: SettleWorkspaceChangeProposalApplyRequest,
  ): Promise<WorkspaceChangeProposalApplySettlement> {
    const value = await this.callWorkspace({
      command: "settle-workspace-change-proposal-apply",
      request: toRpcSettleWorkspaceChangeProposalApplyRequest(request),
    });
    return fromRpcWorkspaceChangeProposalApplySettlement(value);
  }

  async markWorkspaceChangeProposalRecoveryRequired(
    request: MarkWorkspaceChangeProposalRecoveryRequiredRequest,
  ): Promise<WorkspaceChangeProposalRecoveryResult> {
    const value = await this.callWorkspace({
      command: "mark-workspace-change-proposal-recovery-required",
      request: toRpcMarkWorkspaceChangeProposalRecoveryRequiredRequest(request),
    });
    return fromRpcWorkspaceChangeProposalRecoveryResult(value);
  }

  async listWorkspaceChangeProposalApplyAttempts(
    request: ListWorkspaceChangeProposalApplyAttemptsRequest,
  ): Promise<WorkspaceChangeProposalApplyAttemptRecord[]> {
    const value = await this.callWorkspace({
      command: "list-workspace-change-proposal-apply-attempts",
      request: toRpcListWorkspaceChangeProposalApplyAttemptsRequest(request),
    });
    assertArray(value, "workspace change proposal apply attempts");
    return value.map(fromRpcWorkspaceChangeProposalApplyAttemptRecord);
  }

  async beginWorkspaceChangeTransaction(
    request: BeginWorkspaceChangeTransactionRequest,
  ): Promise<WorkspaceChangeTransactionClaimResult> {
    const value = await this.callWorkspace({
      command: "begin-workspace-change-transaction",
      request: toRpcBeginWorkspaceChangeTransactionRequest(request),
    });
    return fromRpcWorkspaceChangeTransactionClaimResult(value);
  }

  async claimWorkspaceChangeTransactionRecovery(
    request: ClaimWorkspaceChangeTransactionRecoveryRequest,
  ): Promise<WorkspaceChangeTransactionClaimResult> {
    const value = await this.callWorkspace({
      command: "claim-workspace-change-transaction-recovery",
      request: toRpcClaimWorkspaceChangeTransactionRecoveryRequest(request),
    });
    return fromRpcWorkspaceChangeTransactionClaimResult(value);
  }

  async renewWorkspaceChangeTransaction(
    request: RenewWorkspaceChangeTransactionRequest,
  ): Promise<WorkspaceChangeTransactionAttemptRecord> {
    const value = await this.callWorkspace({
      command: "renew-workspace-change-transaction",
      request: toRpcRenewWorkspaceChangeTransactionRequest(request),
    });
    return fromRpcWorkspaceChangeTransactionAttemptRecord(value);
  }

  async recordWorkspaceChangeTransactionPlan(
    request: RecordWorkspaceChangeTransactionPlanRequest,
  ): Promise<WorkspaceChangeTransactionSnapshot> {
    const value = await this.callWorkspace({
      command: "record-workspace-change-transaction-plan",
      request: toRpcRecordWorkspaceChangeTransactionPlanRequest(request),
    });
    return fromRpcWorkspaceChangeTransactionSnapshot(value);
  }

  async markWorkspaceChangeTransactionPrepared(
    request: MarkWorkspaceChangeTransactionPreparedRequest,
  ): Promise<WorkspaceChangeTransactionSnapshot> {
    const value = await this.callWorkspace({
      command: "mark-workspace-change-transaction-prepared",
      request: toRpcMarkWorkspaceChangeTransactionPreparedRequest(request),
    });
    return fromRpcWorkspaceChangeTransactionSnapshot(value);
  }

  async beginWorkspaceChangeTransactionCommit(
    request: BeginWorkspaceChangeTransactionCommitRequest,
  ): Promise<WorkspaceChangeTransactionSnapshot> {
    const value = await this.callWorkspace({
      command: "begin-workspace-change-transaction-commit",
      request: toRpcBeginWorkspaceChangeTransactionCommitRequest(request),
    });
    return fromRpcWorkspaceChangeTransactionSnapshot(value);
  }

  async recordWorkspaceChangeTransactionFileCommitted(
    request: RecordWorkspaceChangeTransactionFileCommittedRequest,
  ): Promise<WorkspaceChangeTransactionSnapshot> {
    const value = await this.callWorkspace({
      command: "record-workspace-change-transaction-file-committed",
      request:
        toRpcRecordWorkspaceChangeTransactionFileCommittedRequest(request),
    });
    return fromRpcWorkspaceChangeTransactionSnapshot(value);
  }

  async reconcileWorkspaceChangeTransactionFiles(
    request: ReconcileWorkspaceChangeTransactionFilesRequest,
  ): Promise<WorkspaceChangeTransactionReconciliation> {
    const value = await this.callWorkspace({
      command: "reconcile-workspace-change-transaction-files",
      request: toRpcReconcileWorkspaceChangeTransactionFilesRequest(request),
    });
    return fromRpcWorkspaceChangeTransactionReconciliation(value);
  }

  async finalizeWorkspaceChangeTransaction(
    request: FinalizeWorkspaceChangeTransactionRequest,
  ): Promise<WorkspaceChangeTransactionFinalization> {
    const value = await this.callWorkspace({
      command: "finalize-workspace-change-transaction",
      request: toRpcFinalizeWorkspaceChangeTransactionRequest(request),
    });
    return fromRpcWorkspaceChangeTransactionFinalization(value);
  }

  async getWorkspaceChangeTransaction(
    request: GetWorkspaceChangeTransactionRequest,
  ): Promise<WorkspaceChangeTransactionSnapshot | null> {
    const value = await this.callWorkspace({
      command: "get-workspace-change-transaction",
      transaction_id: request.transactionId,
    });
    return value === null
      ? null
      : fromRpcWorkspaceChangeTransactionSnapshot(value);
  }

  async listWorkspaceChangeTransactions(
    request: ListWorkspaceChangeTransactionsRequest,
  ): Promise<WorkspaceChangeTransactionSnapshot[]> {
    const value = await this.callWorkspace({
      command: "list-workspace-change-transactions",
      request: {
        workspace_id: request.workspaceId ?? null,
        state: request.state ?? null,
        limit: request.limit ?? null,
      },
    });
    assertArray(value, "workspace change transactions");
    return value.map(fromRpcWorkspaceChangeTransactionSnapshot);
  }

  async listWorkspaceChangeTransactionAttempts(
    request: ListWorkspaceChangeTransactionAttemptsRequest,
  ): Promise<WorkspaceChangeTransactionAttemptRecord[]> {
    const value = await this.callWorkspace({
      command: "list-workspace-change-transaction-attempts",
      request: {
        transaction_id: request.transactionId,
        limit: request.limit ?? null,
      },
    });
    assertArray(value, "workspace change transaction attempts");
    return value.map(fromRpcWorkspaceChangeTransactionAttemptRecord);
  }

  async beginWorkspaceTaskRun(
    request: BeginWorkspaceTaskRunRequest,
  ): Promise<WorkspaceTaskClaimResult> {
    const value = await this.callWorkspace({
      command: "begin-workspace-task-run",
      request: toRpcBeginWorkspaceTaskRunRequest(request),
    });
    return fromRpcWorkspaceTaskClaimResult(value);
  }

  async claimWorkspaceTaskRecovery(
    request: ClaimWorkspaceTaskRecoveryRequest,
  ): Promise<WorkspaceTaskClaimResult> {
    const value = await this.callWorkspace({
      command: "claim-workspace-task-recovery",
      request: toRpcClaimWorkspaceTaskRecoveryRequest(request),
    });
    return fromRpcWorkspaceTaskClaimResult(value);
  }

  async renewWorkspaceTaskRun(
    request: RenewWorkspaceTaskRunRequest,
  ): Promise<WorkspaceTaskAttemptRecord> {
    const value = await this.callWorkspace({
      command: "renew-workspace-task-run",
      request: toRpcRenewWorkspaceTaskRunRequest(request),
    });
    return fromRpcWorkspaceTaskAttemptRecord(value);
  }

  async markWorkspaceTaskActive(
    request: MarkWorkspaceTaskActiveRequest,
  ): Promise<WorkspaceTaskRunSnapshot> {
    const value = await this.callWorkspace({
      command: "mark-workspace-task-active",
      request: toRpcMarkWorkspaceTaskActiveRequest(request),
    });
    return fromRpcWorkspaceTaskRunSnapshot(value);
  }

  async beginWorkspaceTaskCollection(
    request: BeginWorkspaceTaskCollectionRequest,
  ): Promise<WorkspaceTaskRunSnapshot> {
    const value = await this.callWorkspace({
      command: "begin-workspace-task-collection",
      request: toRpcBeginWorkspaceTaskCollectionRequest(request),
    });
    return fromRpcWorkspaceTaskRunSnapshot(value);
  }

  async finalizeWorkspaceTaskCollection(
    request: FinalizeWorkspaceTaskCollectionRequest,
  ): Promise<WorkspaceTaskRunSnapshot> {
    const value = await this.callWorkspace({
      command: "finalize-workspace-task-collection",
      request: toRpcFinalizeWorkspaceTaskCollectionRequest(request),
    });
    return fromRpcWorkspaceTaskRunSnapshot(value);
  }

  async beginWorkspaceTaskRelease(
    request: BeginWorkspaceTaskReleaseRequest,
  ): Promise<WorkspaceTaskRunSnapshot> {
    const value = await this.callWorkspace({
      command: "begin-workspace-task-release",
      request: toRpcBeginWorkspaceTaskReleaseRequest(request),
    });
    return fromRpcWorkspaceTaskRunSnapshot(value);
  }

  async finalizeWorkspaceTaskRelease(
    request: FinalizeWorkspaceTaskReleaseRequest,
  ): Promise<WorkspaceTaskRunSnapshot> {
    const value = await this.callWorkspace({
      command: "finalize-workspace-task-release",
      request: toRpcFinalizeWorkspaceTaskReleaseRequest(request),
    });
    return fromRpcWorkspaceTaskRunSnapshot(value);
  }

  async markWorkspaceTaskAttention(
    request: MarkWorkspaceTaskAttentionRequest,
  ): Promise<WorkspaceTaskRunSnapshot> {
    const value = await this.callWorkspace({
      command: "mark-workspace-task-attention",
      request: toRpcMarkWorkspaceTaskAttentionRequest(request),
    });
    return fromRpcWorkspaceTaskRunSnapshot(value);
  }

  async getWorkspaceTaskRun(request: {
    readonly runId: string;
  }): Promise<WorkspaceTaskRunSnapshot | null> {
    const value = await this.callWorkspace({
      command: "get-workspace-task-run",
      run_id: request.runId,
    });
    return value === null ? null : fromRpcWorkspaceTaskRunSnapshot(value);
  }

  async listWorkspaceTaskRuns(
    request: ListWorkspaceTaskRunsRequest,
  ): Promise<WorkspaceTaskRunSnapshot[]> {
    const value = await this.callWorkspace({
      command: "list-workspace-task-runs",
      request: toRpcListWorkspaceTaskRunsRequest(request),
    });
    assertArray(value, "workspace task runs");
    return value.map(fromRpcWorkspaceTaskRunSnapshot);
  }

  async listWorkspaceTaskAttempts(
    request: ListWorkspaceTaskAttemptsRequest,
  ): Promise<WorkspaceTaskAttemptRecord[]> {
    const value = await this.callWorkspace({
      command: "list-workspace-task-attempts",
      request: toRpcListWorkspaceTaskAttemptsRequest(request),
    });
    assertArray(value, "workspace task attempts");
    return value.map(fromRpcWorkspaceTaskAttemptRecord);
  }

  private callWorkspace(request: WorkspaceStorageRpcCommand) {
    return this.call(request);
  }
}
