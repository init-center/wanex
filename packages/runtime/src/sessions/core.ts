import {
  type AdmissionReceipt,
  type AdmitSessionInputRequest,
  type AppendSessionMessageRequest,
  type ApplySessionRunControlReceipt,
  type ApplySessionRunControlRequest,
  type BudgetGrantRecord,
  type BudgetScopeRecord,
  type BeginToolExecutionRequest,
  type BeginToolExecutionReceipt,
  type CancelJobRequest,
  type CancelRunRequest,
  type ClaimJobRequest,
  type CleanupExpiredResourceTicketsRequest,
  type CommitBudgetRequest,
  type CompleteJobRequest,
  type CompleteRunRequest,
  type CreateSessionRequest,
  type EnqueueJobRequest,
  type FailJobRequest,
  type FailRunRequest,
  type FinishToolExecutionRequest,
  type HeartbeatJobRequest,
  type InterruptSessionRunReceipt,
  type InterruptSessionRunRequest,
  type ListJobsRequest,
  type ListSessionsRequest,
  type ListSessionInputsRequest,
  type ListSessionMessagesRequest,
  type ListSessionRunControlsRequest,
  type ResourceTicketCleanupReceipt,
  type ReserveBudgetRequest,
    type RecoverToolExecutionRequest,
    type RecordBudgetUsageRequest,
    type RecordBudgetUsageReceipt,
  type RunnerClaim,
  type RunnerClaimRequest,
  type RunnerHeartbeatRequest,
  type SchedulerJobRecord,
  type SessionInputRecord,
  type SessionMessageRecord,
  type SessionRecord,
  type SessionRunControlRecord,
  type SteerSessionRunReceipt,
  type SteerSessionRunRequest,
  type SubmitSessionRunReceipt,
  type SubmitSessionRunRequest,
  type ToolExecutionRecord
} from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"
import { BudgetCommands } from "./budget-commands.js"
import { ResourceMaintenanceCommands } from "./resource-maintenance-commands.js"
import { RunControlCommands } from "./run-control-commands.js"
import { SchedulerCommands } from "./scheduler-commands.js"
import { SessionCommands } from "./session-commands.js"

export const WANEX_RUNTIME_SESSIONS = "wanex-runtime-sessions" as const

export interface WanexSessionCoreOptions {
  readonly storage: CoreStore
}

export class WanexSessionCore {
  private readonly storage: CoreStore
  private readonly session: SessionCommands
  private readonly runControl: RunControlCommands
  private readonly budget: BudgetCommands
  private readonly scheduler: SchedulerCommands
  private readonly resourceMaintenance: ResourceMaintenanceCommands

  constructor(options: WanexSessionCoreOptions) {
    this.storage = options.storage
    this.session = new SessionCommands(options.storage)
    this.runControl = new RunControlCommands(options.storage)
    this.budget = new BudgetCommands(options.storage)
    this.scheduler = new SchedulerCommands(options.storage)
    this.resourceMaintenance = new ResourceMaintenanceCommands(options.storage)
  }

  async create(request: CreateSessionRequest): Promise<SessionRecord> {
    return await this.session.create(request)
  }

  async get(id: string): Promise<SessionRecord | null> {
    return await this.session.get(id)
  }

  async list(request: ListSessionsRequest = {}): Promise<SessionRecord[]> {
    return await this.session.list(request)
  }

  async admit(request: AdmitSessionInputRequest): Promise<AdmissionReceipt> {
    return await this.session.admit(request)
  }

  async submitRun(
    request: SubmitSessionRunRequest
  ): Promise<SubmitSessionRunReceipt> {
    return await this.session.submitRun(request)
  }

  async listInputs(
    request: ListSessionInputsRequest
  ): Promise<SessionInputRecord[]> {
    return await this.session.listInputs(request)
  }

  async listMessages(
    request: ListSessionMessagesRequest
  ): Promise<SessionMessageRecord[]> {
    return await this.session.listMessages(request)
  }

  async appendMessage(
    request: AppendSessionMessageRequest
  ): Promise<SessionMessageRecord | null> {
    return await this.session.appendMessage(request)
  }

  async claimRunner(request: RunnerClaimRequest): Promise<RunnerClaim | null> {
    return await this.session.claimRunner(request)
  }

  async heartbeatRunner(
    request: RunnerHeartbeatRequest
  ): Promise<RunnerClaim | null> {
    return await this.session.heartbeatRunner(request)
  }

  async completeRun(request: CompleteRunRequest): Promise<boolean> {
    return await this.session.completeRun(request)
  }

  async failRun(request: FailRunRequest): Promise<boolean> {
    return await this.session.failRun(request)
  }

  async cancelRun(request: CancelRunRequest): Promise<boolean> {
    return await this.session.cancelRun(request)
  }

  async beginToolExecution(
    request: BeginToolExecutionRequest
  ): Promise<BeginToolExecutionReceipt> {
    return await this.storage.beginToolExecution(request)
  }

  async finishToolExecution(
    request: FinishToolExecutionRequest
  ): Promise<ToolExecutionRecord | null> {
    return await this.storage.finishToolExecution(request)
  }

  async recoverToolExecution(
    request: RecoverToolExecutionRequest
  ): Promise<ToolExecutionRecord | null> {
    return await this.storage.recoverToolExecution(request)
  }

  async getToolExecution(executionId: string): Promise<ToolExecutionRecord | null> {
    return await this.storage.getToolExecution(executionId)
  }

  async listToolExecutions(): Promise<ToolExecutionRecord[]> {
    return await this.storage.listToolExecutions({})
  }

  async interruptRun(
    request: InterruptSessionRunRequest
  ): Promise<InterruptSessionRunReceipt> {
    return await this.runControl.interruptRun(request)
  }

  async steerRun(
    request: SteerSessionRunRequest
  ): Promise<SteerSessionRunReceipt> {
    return await this.runControl.steerRun(request)
  }

  async listRunControls(
    request: ListSessionRunControlsRequest
  ): Promise<SessionRunControlRecord[]> {
    return await this.runControl.listRunControls(request)
  }

  async applyRunControl(
    request: ApplySessionRunControlRequest
  ): Promise<ApplySessionRunControlReceipt | null> {
    return await this.runControl.applyRunControl(request)
  }

  async cleanupExpiredResourceTickets(
    request: CleanupExpiredResourceTicketsRequest
  ): Promise<ResourceTicketCleanupReceipt> {
    return await this.resourceMaintenance.cleanupExpiredResourceTickets(request)
  }

  async reserveBudget(
    request: ReserveBudgetRequest
  ): Promise<BudgetGrantRecord> {
    return await this.budget.reserveBudget(request)
  }

  async commitBudget(
    request: CommitBudgetRequest
  ): Promise<BudgetGrantRecord | null> {
    return await this.budget.commitBudget(request)
  }

  async recordBudgetUsage(
    request: RecordBudgetUsageRequest
  ): Promise<RecordBudgetUsageReceipt> {
    return await this.budget.recordBudgetUsage(request)
  }

  async releaseBudget(grantId: string): Promise<BudgetGrantRecord | null> {
    return await this.budget.releaseBudget(grantId)
  }

  async getBudgetScope(scopeId: string): Promise<BudgetScopeRecord | null> {
    return await this.budget.getBudgetScope(scopeId)
  }

  async listBudgetGrants(scopeId: string): Promise<BudgetGrantRecord[]> {
    return await this.budget.listBudgetGrants(scopeId)
  }

  async enqueueJob(request: EnqueueJobRequest): Promise<SchedulerJobRecord> {
    return await this.scheduler.enqueueJob(request)
  }

  async claimJob(request: ClaimJobRequest): Promise<SchedulerJobRecord | null> {
    return await this.scheduler.claimJob(request)
  }

  async heartbeatJob(
    request: HeartbeatJobRequest
  ): Promise<SchedulerJobRecord | null> {
    return await this.scheduler.heartbeatJob(request)
  }

  async completeJob(
    request: CompleteJobRequest
  ): Promise<SchedulerJobRecord | null> {
    return await this.scheduler.completeJob(request)
  }

  async failJob(request: FailJobRequest): Promise<SchedulerJobRecord | null> {
    return await this.scheduler.failJob(request)
  }

  async cancelJob(
    request: CancelJobRequest
  ): Promise<SchedulerJobRecord | null> {
    return await this.scheduler.cancelJob(request)
  }

  async listJobs(request: ListJobsRequest): Promise<SchedulerJobRecord[]> {
    return await this.scheduler.listJobs(request)
  }
}
