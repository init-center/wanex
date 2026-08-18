import type {
  BeginToolExecutionRequest,
  BeginToolExecutionReceipt,
  DeferToolExecutionReceipt,
  DeferToolExecutionRequest,
  FinishToolExecutionRequest,
  GetToolExecutionByCallRequest,
  ListToolActivitiesRequest,
  ListToolExecutionAttemptsRequest,
  ListToolExecutionsRequest,
  RequireToolExecutionRecoveryReceipt,
  RequireToolExecutionRecoveryRequest,
  ResolveToolExecutionApprovalReceipt,
  ResolveToolExecutionApprovalRequest,
  ResolveToolExecutionRecoveryReceipt,
  ResolveToolExecutionRecoveryRequest,
  ToolExecutionAttemptRecord,
  ToolExecutionRecord,
  ToolActivityRecord
} from "@wanex/protocol"

export interface ToolExecutionStore {
  beginToolExecution(
    request: BeginToolExecutionRequest
  ): Promise<BeginToolExecutionReceipt>
  deferToolExecution(
    request: DeferToolExecutionRequest
  ): Promise<DeferToolExecutionReceipt>
  finishToolExecution(
    request: FinishToolExecutionRequest
  ): Promise<ToolExecutionRecord | null>
  requireToolExecutionRecovery(
    request: RequireToolExecutionRecoveryRequest
  ): Promise<RequireToolExecutionRecoveryReceipt | null>
  resolveToolExecutionRecovery(
    request: ResolveToolExecutionRecoveryRequest
  ): Promise<ResolveToolExecutionRecoveryReceipt>
  resolveToolExecutionApproval(
    request: ResolveToolExecutionApprovalRequest
  ): Promise<ResolveToolExecutionApprovalReceipt>
  getToolExecution(executionId: string): Promise<ToolExecutionRecord | null>
  getToolExecutionByCall(
    request: GetToolExecutionByCallRequest
  ): Promise<ToolExecutionRecord | null>
  listToolExecutions(
    request: ListToolExecutionsRequest
  ): Promise<ToolExecutionRecord[]>
  listToolActivities(
    request: ListToolActivitiesRequest
  ): Promise<ToolActivityRecord[]>
  listToolExecutionAttempts(
    request: ListToolExecutionAttemptsRequest
  ): Promise<ToolExecutionAttemptRecord[]>
}
