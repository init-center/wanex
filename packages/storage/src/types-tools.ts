import type {
  BeginToolExecutionRequest,
  BeginToolExecutionReceipt,
  FinishToolExecutionRequest,
  ListToolExecutionsRequest,
  RecoverToolExecutionRequest,
  ToolExecutionRecord
} from "@wanex/protocol"

export interface ToolExecutionStore {
  beginToolExecution(
    request: BeginToolExecutionRequest
  ): Promise<BeginToolExecutionReceipt>
  finishToolExecution(
    request: FinishToolExecutionRequest
  ): Promise<ToolExecutionRecord | null>
  recoverToolExecution(
    request: RecoverToolExecutionRequest
  ): Promise<ToolExecutionRecord | null>
  getToolExecution(executionId: string): Promise<ToolExecutionRecord | null>
  listToolExecutions(
    request: ListToolExecutionsRequest
  ): Promise<ToolExecutionRecord[]>
}
