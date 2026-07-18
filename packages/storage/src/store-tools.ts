import type {
  BeginToolExecutionRequest,
  BeginToolExecutionReceipt,
  FinishToolExecutionRequest,
  ListToolExecutionsRequest,
  RecoverToolExecutionRequest,
  ToolExecutionRecord
} from "@wanex/protocol"
import {
  fromRpcToolExecutionRecord,
  toRpcBeginToolExecutionRequest,
  toRpcFinishToolExecutionRequest,
  toRpcListToolExecutionsRequest,
  toRpcRecoverToolExecutionRequest
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
    return {
      execution: fromRpcToolExecutionRecord(value.execution),
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

  async recoverToolExecution(request: RecoverToolExecutionRequest): Promise<ToolExecutionRecord | null> {
    const value = await this.callTools({
      command: "recover-tool-execution",
      request: toRpcRecoverToolExecutionRequest(request)
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

  private callTools(request: ToolsStorageRpcCommand) {
    return this.call(request)
  }
}
