import type {
  BudgetGrantRecord,
  BudgetScopeRecord,
  CancelJobRequest,
  ClaimJobRequest,
  CommitBudgetRequest,
  CompleteJobRequest,
  EnqueueJobRequest,
  FailJobRequest,
  GetJobRequest,
  HeartbeatJobRequest,
  ListJobsRequest,
  RecordBudgetUsageRequest,
  RecordBudgetUsageReceipt,
  ReserveBudgetRequest,
  SchedulerJobRecord
} from "@wanex/protocol"

export interface SchedulerStore {
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
