import type {
  BudgetGrantRecord,
  BudgetScopeRecord,
  CancelJobRequest,
  CancelRunRequest,
  ClaimJobRequest,
  CommitBudgetRequest,
  CompleteJobRequest,
  CompleteRunRequest,
  EnqueueJobRequest,
  FailJobRequest,
  FailRunRequest,
  GetJobRequest,
  HeartbeatJobRequest,
  ListJobsRequest,
  RecordBudgetUsageRequest,
  RecordBudgetUsageReceipt,
  ReserveBudgetRequest,
  RunnerClaim,
  RunnerClaimRequest,
  RunnerHeartbeatRequest,
  SchedulerJobRecord
} from "@wanex/protocol"

export interface SchedulerStore {
  claimRunner(request: RunnerClaimRequest): Promise<RunnerClaim | null>
  heartbeatRunner(
    request: RunnerHeartbeatRequest
  ): Promise<RunnerClaim | null>
  completeRun(request: CompleteRunRequest): Promise<boolean>
  failRun(request: FailRunRequest): Promise<boolean>
  releaseRunner(request: {
    readonly sessionId: string
    readonly runnerId: string
    readonly leaseToken: string
  }): Promise<boolean>
  cancelRun(request: CancelRunRequest): Promise<boolean>
  reserveBudget(request: ReserveBudgetRequest): Promise<BudgetGrantRecord>
  recordBudgetUsage(
    request: RecordBudgetUsageRequest
  ): Promise<RecordBudgetUsageReceipt>
  commitBudget(
    request: CommitBudgetRequest
  ): Promise<BudgetGrantRecord | null>
  releaseBudget(request: {
    readonly grantId: string
  }): Promise<BudgetGrantRecord | null>
  getBudgetScope(scopeId: string): Promise<BudgetScopeRecord | null>
  listBudgetGrants(scopeId: string): Promise<BudgetGrantRecord[]>
  enqueueJob(request: EnqueueJobRequest): Promise<SchedulerJobRecord>
  claimJob(request: ClaimJobRequest): Promise<SchedulerJobRecord | null>
  heartbeatJob(
    request: HeartbeatJobRequest
  ): Promise<SchedulerJobRecord | null>
  completeJob(
    request: CompleteJobRequest
  ): Promise<SchedulerJobRecord | null>
  failJob(request: FailJobRequest): Promise<SchedulerJobRecord | null>
  cancelJob(request: CancelJobRequest): Promise<SchedulerJobRecord | null>
  getJob(request: GetJobRequest): Promise<SchedulerJobRecord | null>
  listJobs(request: ListJobsRequest): Promise<SchedulerJobRecord[]>
}
