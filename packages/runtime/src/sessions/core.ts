import type {
  AdmissionReceipt,
  AdmitSessionInputRequest,
  ArchiveSessionRequest,
  AppendSessionMessageRequest,
  ApplySessionTurnControlReceipt,
  ApplySessionTurnControlRequest,
  BeginProviderInvocationRequest,
  BeginToolExecutionReceipt,
  BeginToolExecutionRequest,
  BudgetGrantRecord,
  BudgetScopeRecord,
  CancelJobRequest,
  ClaimJobRequest,
  CleanupExpiredResourceTicketsRequest,
  CommitBudgetRequest,
  CompleteJobRequest,
  DeferToolExecutionReceipt,
  DeferToolExecutionRequest,
  CreateSessionRequest,
  EnqueueJobRequest,
  FailJobRequest,
    FinishToolExecutionRequest,
    GetResourceRequest,
    IngestResourceRequest,
  FinishProviderInvocationReceipt,
  FinishProviderInvocationRequest,
  HeartbeatJobRequest,
  GetToolExecutionByCallRequest,
  InterruptSessionTurnReceipt,
  InterruptSessionTurnRequest,
  ListProviderInvocationsRequest,
  ListJobsRequest,
  ListSessionAttemptsRequest,
  ListSessionInputsRequest,
  ListSessionMessagesRequest,
  ListSessionTurnControlsRequest,
  ListSessionTurnsRequest,
  ListSessionsRequest,
  ListToolActivitiesRequest,
  ListToolExecutionAttemptsRequest,
  ListToolExecutionsRequest,
  MarkProviderInvocationOutputRequest,
  ProviderInvocationRecord,
  ReadResourceContentRequest,
  RecordBudgetUsageReceipt,
  RecordBudgetUsageRequest,
  RequestSessionTurnCancelReceipt,
  RequestSessionTurnCancelRequest,
  RenameSessionRequest,
  RequireToolExecutionRecoveryReceipt,
  RequireToolExecutionRecoveryRequest,
  ResolveToolExecutionApprovalReceipt,
  ResolveToolExecutionApprovalRequest,
  ResolveToolExecutionRecoveryReceipt,
  ResolveToolExecutionRecoveryRequest,
  RestoreSessionRequest,
  ReserveBudgetRequest,
  ResourceTicketCleanupReceipt,
    ResourceContentChunk,
    ResourceProvenanceRecord,
    ResourceRecord,
    RecordResourceProvenanceRequest,
  SchedulerJobRecord,
  SessionAttemptRecord,
  SessionInputRecord,
  SessionMessageRecord,
  SessionRecord,
  SessionTurnControlRecord,
  SessionTurnRecord,
  SettleSessionTurnReceipt,
  SettleSessionTurnRequest,
  StartSessionTurnAttemptReceipt,
  StartSessionTurnAttemptRequest,
  SteerSessionTurnReceipt,
  SteerSessionTurnRequest,
  SubmitSessionTurnReceipt,
  SubmitSessionTurnRequest,
  ToolExecutionAttemptRecord,
  ToolActivityRecord,
  ToolExecutionRecord
} from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"
import { BudgetCommands } from "./budget-commands.js"
import { ResourceMaintenanceCommands } from "./resource-maintenance-commands.js"
import { SchedulerCommands } from "./scheduler-commands.js"
import { SessionCommands } from "./session-commands.js"
import { TurnControlCommands } from "./turn-control-commands.js"

export const WANEX_RUNTIME_SESSIONS = "wanex-runtime-sessions" as const

export interface WanexSessionCoreOptions {
  readonly storage: CoreStore
}

export class WanexSessionCore {
  private readonly storage: CoreStore
  private readonly session: SessionCommands
  private readonly turnControl: TurnControlCommands
  private readonly budget: BudgetCommands
  private readonly scheduler: SchedulerCommands
  private readonly resourceMaintenance: ResourceMaintenanceCommands

  constructor(options: WanexSessionCoreOptions) {
    this.storage = options.storage
    this.session = new SessionCommands(options.storage)
    this.turnControl = new TurnControlCommands(options.storage)
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

  async rename(request: RenameSessionRequest): Promise<SessionRecord> {
    return await this.session.rename(request)
  }

  async archive(request: ArchiveSessionRequest): Promise<SessionRecord> {
    return await this.session.archive(request)
  }

  async restore(request: RestoreSessionRequest): Promise<SessionRecord> {
    return await this.session.restore(request)
  }

  async admit(request: AdmitSessionInputRequest): Promise<AdmissionReceipt> {
    return await this.session.admit(request)
  }

  async submitTurn(
    request: SubmitSessionTurnRequest
  ): Promise<SubmitSessionTurnReceipt> {
    return await this.session.submitTurn(request)
  }

  async startTurnAttempt(
    request: StartSessionTurnAttemptRequest
  ): Promise<StartSessionTurnAttemptReceipt> {
    return await this.session.startTurnAttempt(request)
  }

  async settleTurn(
    request: SettleSessionTurnRequest
  ): Promise<SettleSessionTurnReceipt> {
    return await this.session.settleTurn(request)
  }

  async beginProviderInvocation(
    request: BeginProviderInvocationRequest
  ): Promise<ProviderInvocationRecord> {
    return await this.session.beginProviderInvocation(request)
  }

  async markProviderInvocationOutput(
    request: MarkProviderInvocationOutputRequest
  ): Promise<ProviderInvocationRecord | null> {
    return await this.session.markProviderInvocationOutput(request)
  }

  async finishProviderInvocation(
    request: FinishProviderInvocationRequest
  ): Promise<FinishProviderInvocationReceipt | null> {
    return await this.session.finishProviderInvocation(request)
  }

  async listProviderInvocations(
    request: ListProviderInvocationsRequest
  ): Promise<ProviderInvocationRecord[]> {
    return await this.session.listProviderInvocations(request)
  }

  async requestTurnCancel(
    request: RequestSessionTurnCancelRequest
  ): Promise<RequestSessionTurnCancelReceipt> {
    return await this.session.requestTurnCancel(request)
  }

  async listInputs(request: ListSessionInputsRequest): Promise<SessionInputRecord[]> {
    return await this.session.listInputs(request)
  }

  async listMessages(
    request: ListSessionMessagesRequest
  ): Promise<SessionMessageRecord[]> {
    return await this.session.listMessages(request)
  }

  async listTurns(request: ListSessionTurnsRequest): Promise<SessionTurnRecord[]> {
    return await this.session.listTurns(request)
  }

  async listAttempts(
    request: ListSessionAttemptsRequest
  ): Promise<SessionAttemptRecord[]> {
    return await this.session.listAttempts(request)
  }

  async appendMessage(
    request: AppendSessionMessageRequest
  ): Promise<SessionMessageRecord | null> {
    return await this.session.appendMessage(request)
  }

  async interruptTurn(
    request: InterruptSessionTurnRequest
  ): Promise<InterruptSessionTurnReceipt> {
    return await this.turnControl.interruptTurn(request)
  }

  async steerTurn(
    request: SteerSessionTurnRequest
  ): Promise<SteerSessionTurnReceipt> {
    return await this.turnControl.steerTurn(request)
  }

  async listTurnControls(
    request: ListSessionTurnControlsRequest
  ): Promise<SessionTurnControlRecord[]> {
    return await this.turnControl.listTurnControls(request)
  }

  async applyTurnControl(
    request: ApplySessionTurnControlRequest
  ): Promise<ApplySessionTurnControlReceipt | null> {
    return await this.turnControl.applyTurnControl(request)
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

  async requireToolExecutionRecovery(
    request: RequireToolExecutionRecoveryRequest
  ): Promise<RequireToolExecutionRecoveryReceipt | null> {
    return await this.storage.requireToolExecutionRecovery(request)
  }

  async resolveToolExecutionRecovery(
    request: ResolveToolExecutionRecoveryRequest
  ): Promise<ResolveToolExecutionRecoveryReceipt> {
    return await this.storage.resolveToolExecutionRecovery(request)
  }

  async resolveToolExecutionApproval(
    request: ResolveToolExecutionApprovalRequest
  ): Promise<ResolveToolExecutionApprovalReceipt> {
    return await this.storage.resolveToolExecutionApproval(request)
  }

  async getToolExecution(executionId: string): Promise<ToolExecutionRecord | null> {
    return await this.storage.getToolExecution(executionId)
  }

  async getToolExecutionByCall(
    request: GetToolExecutionByCallRequest
  ): Promise<ToolExecutionRecord | null> {
    return await this.storage.getToolExecutionByCall(request)
  }

  async listToolExecutions(
    request: ListToolExecutionsRequest = {}
  ): Promise<ToolExecutionRecord[]> {
    return await this.storage.listToolExecutions(request)
  }

  async listToolActivities(
    request: ListToolActivitiesRequest
  ): Promise<ToolActivityRecord[]> {
    return await this.storage.listToolActivities(request)
  }

  async deferToolExecution(
    request: DeferToolExecutionRequest
  ): Promise<DeferToolExecutionReceipt> {
    return await this.storage.deferToolExecution(request)
  }

  async listToolExecutionAttempts(
    request: ListToolExecutionAttemptsRequest
  ): Promise<ToolExecutionAttemptRecord[]> {
    return await this.storage.listToolExecutionAttempts(request)
  }

  async cleanupExpiredResourceTickets(
    request: CleanupExpiredResourceTicketsRequest
  ): Promise<ResourceTicketCleanupReceipt> {
    return await this.resourceMaintenance.cleanupExpiredResourceTickets(request)
  }

  async getResource(request: GetResourceRequest): Promise<ResourceRecord | null> {
    return await this.storage.getResource(request)
  }

  async ingestResource(request: IngestResourceRequest): Promise<ResourceRecord> {
    return await this.storage.ingestResource(request)
  }

  async recordResourceProvenance(
    request: RecordResourceProvenanceRequest
  ): Promise<ResourceProvenanceRecord> {
    return await this.storage.recordResourceProvenance(request)
  }

  async readResourceContent(
    request: ReadResourceContentRequest
  ): Promise<ResourceContentChunk | null> {
    return await this.storage.readResourceContent(request)
  }

  async reserveBudget(request: ReserveBudgetRequest): Promise<BudgetGrantRecord> {
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
