import type {
  BeginToolExecutionRequest,
  BeginToolExecutionReceipt,
  FinishToolExecutionRequest,
  ListToolExecutionAttemptsRequest,
  ListToolExecutionsRequest,
  ToolExecutionAttemptRecord,
  ToolExecutionRecord
} from "@wanex/protocol"

export interface ToolExecutionStore {
  beginToolExecution(
    request: BeginToolExecutionRequest
  ): Promise<BeginToolExecutionReceipt>
  finishToolExecution(
    request: FinishToolExecutionRequest
  ): Promise<ToolExecutionRecord | null>
  getToolExecution(executionId: string): Promise<ToolExecutionRecord | null>
  listToolExecutions(
    request: ListToolExecutionsRequest
  ): Promise<ToolExecutionRecord[]>
  listToolExecutionAttempts(
    request: ListToolExecutionAttemptsRequest
  ): Promise<ToolExecutionAttemptRecord[]>
}
