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

export interface WorkspaceStore {
  putWorkspaceChangeSet(
    request: PutWorkspaceChangeSetRequest,
  ): Promise<WorkspaceChangeSetRecord>;
  getWorkspaceChangeSet(
    request: GetWorkspaceChangeSetRequest,
  ): Promise<WorkspaceChangeSetRecord | null>;
  listWorkspaceChangeSets(
    request: ListWorkspaceChangeSetsRequest,
  ): Promise<WorkspaceChangeSetRecord[]>;
  recordWorkspaceChangeOperation(
    request: RecordWorkspaceChangeOperationRequest,
  ): Promise<WorkspaceChangeOperationRecord>;
  listWorkspaceChangeOperations(
    request: ListWorkspaceChangeOperationsRequest,
  ): Promise<WorkspaceChangeOperationRecord[]>;
  putWorkspaceChangeProposal(
    request: PutWorkspaceChangeProposalRequest,
  ): Promise<WorkspaceChangeProposalRecord>;
  getWorkspaceChangeProposal(
    request: GetWorkspaceChangeProposalRequest,
  ): Promise<WorkspaceChangeProposalRecord | null>;
  listWorkspaceChangeProposals(
    request: ListWorkspaceChangeProposalsRequest,
  ): Promise<WorkspaceChangeProposalRecord[]>;
  recordWorkspaceChangeProposalOperation(
    request: RecordWorkspaceChangeProposalOperationRequest,
  ): Promise<WorkspaceChangeProposalOperationRecord>;
  listWorkspaceChangeProposalOperations(
    request: ListWorkspaceChangeProposalOperationsRequest,
  ): Promise<WorkspaceChangeProposalOperationRecord[]>;
  claimWorkspaceChangeProposalApply(
    request: ClaimWorkspaceChangeProposalApplyRequest,
  ): Promise<WorkspaceChangeProposalApplyClaimResult>;
  renewWorkspaceChangeProposalApply(
    request: RenewWorkspaceChangeProposalApplyRequest,
  ): Promise<WorkspaceChangeProposalApplyAttemptRecord>;
  settleWorkspaceChangeProposalApply(
    request: SettleWorkspaceChangeProposalApplyRequest,
  ): Promise<WorkspaceChangeProposalApplySettlement>;
  markWorkspaceChangeProposalRecoveryRequired(
    request: MarkWorkspaceChangeProposalRecoveryRequiredRequest,
  ): Promise<WorkspaceChangeProposalRecoveryResult>;
  listWorkspaceChangeProposalApplyAttempts(
    request: ListWorkspaceChangeProposalApplyAttemptsRequest,
  ): Promise<WorkspaceChangeProposalApplyAttemptRecord[]>;
  beginWorkspaceChangeTransaction(
    request: BeginWorkspaceChangeTransactionRequest,
  ): Promise<WorkspaceChangeTransactionClaimResult>;
  claimWorkspaceChangeTransactionRecovery(
    request: ClaimWorkspaceChangeTransactionRecoveryRequest,
  ): Promise<WorkspaceChangeTransactionClaimResult>;
  renewWorkspaceChangeTransaction(
    request: RenewWorkspaceChangeTransactionRequest,
  ): Promise<WorkspaceChangeTransactionAttemptRecord>;
  recordWorkspaceChangeTransactionPlan(
    request: RecordWorkspaceChangeTransactionPlanRequest,
  ): Promise<WorkspaceChangeTransactionSnapshot>;
  markWorkspaceChangeTransactionPrepared(
    request: MarkWorkspaceChangeTransactionPreparedRequest,
  ): Promise<WorkspaceChangeTransactionSnapshot>;
  beginWorkspaceChangeTransactionCommit(
    request: BeginWorkspaceChangeTransactionCommitRequest,
  ): Promise<WorkspaceChangeTransactionSnapshot>;
  recordWorkspaceChangeTransactionFileCommitted(
    request: RecordWorkspaceChangeTransactionFileCommittedRequest,
  ): Promise<WorkspaceChangeTransactionSnapshot>;
  reconcileWorkspaceChangeTransactionFiles(
    request: ReconcileWorkspaceChangeTransactionFilesRequest,
  ): Promise<WorkspaceChangeTransactionReconciliation>;
  finalizeWorkspaceChangeTransaction(
    request: FinalizeWorkspaceChangeTransactionRequest,
  ): Promise<WorkspaceChangeTransactionFinalization>;
  getWorkspaceChangeTransaction(
    request: GetWorkspaceChangeTransactionRequest,
  ): Promise<WorkspaceChangeTransactionSnapshot | null>;
  listWorkspaceChangeTransactions(
    request: ListWorkspaceChangeTransactionsRequest,
  ): Promise<WorkspaceChangeTransactionSnapshot[]>;
  listWorkspaceChangeTransactionAttempts(
    request: ListWorkspaceChangeTransactionAttemptsRequest,
  ): Promise<WorkspaceChangeTransactionAttemptRecord[]>;
  beginWorkspaceTaskRun(
    request: BeginWorkspaceTaskRunRequest,
  ): Promise<WorkspaceTaskClaimResult>;
  claimWorkspaceTaskRecovery(
    request: ClaimWorkspaceTaskRecoveryRequest,
  ): Promise<WorkspaceTaskClaimResult>;
  renewWorkspaceTaskRun(
    request: RenewWorkspaceTaskRunRequest,
  ): Promise<WorkspaceTaskAttemptRecord>;
  markWorkspaceTaskActive(
    request: MarkWorkspaceTaskActiveRequest,
  ): Promise<WorkspaceTaskRunSnapshot>;
  beginWorkspaceTaskCollection(
    request: BeginWorkspaceTaskCollectionRequest,
  ): Promise<WorkspaceTaskRunSnapshot>;
  finalizeWorkspaceTaskCollection(
    request: FinalizeWorkspaceTaskCollectionRequest,
  ): Promise<WorkspaceTaskRunSnapshot>;
  beginWorkspaceTaskRelease(
    request: BeginWorkspaceTaskReleaseRequest,
  ): Promise<WorkspaceTaskRunSnapshot>;
  finalizeWorkspaceTaskRelease(
    request: FinalizeWorkspaceTaskReleaseRequest,
  ): Promise<WorkspaceTaskRunSnapshot>;
  markWorkspaceTaskAttention(
    request: MarkWorkspaceTaskAttentionRequest,
  ): Promise<WorkspaceTaskRunSnapshot>;
  getWorkspaceTaskRun(request: {
    readonly runId: string;
  }): Promise<WorkspaceTaskRunSnapshot | null>;
  listWorkspaceTaskRuns(
    request: ListWorkspaceTaskRunsRequest,
  ): Promise<WorkspaceTaskRunSnapshot[]>;
  listWorkspaceTaskAttempts(
    request: ListWorkspaceTaskAttemptsRequest,
  ): Promise<WorkspaceTaskAttemptRecord[]>;
}
