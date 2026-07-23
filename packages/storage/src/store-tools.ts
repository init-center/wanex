import type {
  BeginToolExecutionRequest,
  BeginToolExecutionReceipt,
  FinishToolExecutionRequest,
  ListToolExecutionAttemptsRequest,
  ListToolExecutionsRequest,
  ToolExecutionAttemptRecord,
  ToolExecutionRecord
} from "@wanex/protocol"
import {
  fromRpcToolExecutionRecord,
  fromRpcToolExecutionAttemptRecord,
  toRpcBeginToolExecutionRequest,
  toRpcFinishToolExecutionRequest,
  toRpcListToolExecutionAttemptsRequest,
  toRpcListToolExecutionsRequest,
} from "./codec-tools.js"
import { assertArray, isRecord } from "./codec-helpers.js"
import type { ToolsStorageRpcCommand } from "./generated/storage-rpc.js"
import { RpcStoreFacetBase } from "./rpc-store-base.js"

export class ToolExecutionStoreMethods extends RpcStoreFacetBase {
  async beginToolExecution(request: BeginToolExecutionRequest): Promise<BeginToolExecutionReceipt> {
    const value = await this.callTools({
      command: "begin-tool-execution",
      request: toRpcBeginToolExecutionRequest(request)
    })
    if (!isRecord(value)) {
      throw new Error("begin tool execution receipt must be an object")
    }
    if (value.execution === undefined) {
      throw new Error("begin tool execution receipt requires execution")
    }
    const invocationAttempt =
      value.invocation_attempt === null || value.invocation_attempt === undefined
        ? undefined
        : fromRpcToolExecutionAttemptRecord(value.invocation_attempt)
    return {
      execution: fromRpcToolExecutionRecord(value.execution),
      ...(invocationAttempt === undefined ? {} : { invocationAttempt }),
      created: value.created === true
    }
  }

  async finishToolExecution(request: FinishToolExecutionRequest): Promise<ToolExecutionRecord | null> {
    const value = await this.callTools({
      command: "finish-tool-execution",
      request: toRpcFinishToolExecutionRequest(request)
    })
    return value === null ? null : fromRpcToolExecutionRecord(value)
  }

  async getToolExecution(executionId: string): Promise<ToolExecutionRecord | null> {
    const value = await this.callTools({ command: "get-tool-execution", execution_id: executionId })
    return value === null ? null : fromRpcToolExecutionRecord(value)
  }

  async listToolExecutions(request: ListToolExecutionsRequest): Promise<ToolExecutionRecord[]> {
    const value = await this.callTools({
      command: "list-tool-executions",
      request: toRpcListToolExecutionsRequest(request)
    })
    assertArray(value, "tool executions")
    return value.map(fromRpcToolExecutionRecord)
  }

  async listToolExecutionAttempts(
    request: ListToolExecutionAttemptsRequest
  ): Promise<ToolExecutionAttemptRecord[]> {
    const value = await this.callTools({
      command: "list-tool-execution-attempts",
      request: toRpcListToolExecutionAttemptsRequest(request)
    })
    assertArray(value, "tool execution attempts")
    return value.map(fromRpcToolExecutionAttemptRecord)
  }

  private callTools(request: ToolsStorageRpcCommand) {
    return this.call(request)
  }
}
