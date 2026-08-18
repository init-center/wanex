import type {
  BeginToolExecutionRequest,
  BeginToolExecutionReceipt,
  DeferToolExecutionReceipt,
  DeferToolExecutionRequest,
  FinishToolExecutionRequest,
  GetToolExecutionByCallRequest,
  JsonValue,
  ListToolActivitiesRequest,
  ListToolExecutionAttemptsRequest,
  ListToolExecutionsRequest,
  ToolExecutionAttemptRecord,
  ToolExecutionRecord,
  ToolActivityRecord,
  RequireToolExecutionRecoveryRequest,
  RequireToolExecutionRecoveryReceipt,
  ResolveToolExecutionRecoveryRequest,
  ResolveToolExecutionRecoveryReceipt,
  ResolveToolExecutionApprovalRequest,
  ResolveToolExecutionApprovalReceipt
} from "@wanex/protocol"
import {
  fromRpcDeferToolExecutionReceipt,
  toRpcDeferToolExecutionRequest
} from "./codec-deferred-tool.js"
import {
  fromRpcToolExecutionRecord,
  fromRpcToolExecutionAttemptRecord,
  fromRpcToolExecutionRecoveryDecisionRecord,
  fromRpcToolExecutionApprovalDecisionRecord,
  fromRpcToolActivityRecord,
  toRpcBeginToolExecutionRequest,
  toRpcFinishToolExecutionRequest,
  toRpcListToolExecutionAttemptsRequest,
  toRpcListToolExecutionsRequest,
  toRpcListToolActivitiesRequest,
  toRpcRequireToolExecutionRecoveryRequest,
  toRpcResolveToolExecutionRecoveryRequest,
  toRpcResolveToolExecutionApprovalRequest,
} from "./codec-tools.js"
import { fromRpcSchedulerJobRecord } from "./codec-scheduler.js"
import {
  fromRpcSessionAttemptRecord,
  fromRpcSessionTurnRecord
} from "./codec-session-turn-records.js"
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
    const approvalSuspensionValue = value.approval_suspension
    const approvalSuspension =
      approvalSuspensionValue === null || approvalSuspensionValue === undefined
        ? undefined
        : {
            execution: fromRpcToolExecutionRecord(
              requiredField(approvalSuspensionValue, "execution")
            ),
            turn: fromRpcSessionTurnRecord(
              requiredField(approvalSuspensionValue, "turn")
            ),
            attempt: fromRpcSessionAttemptRecord(
              requiredField(approvalSuspensionValue, "attempt")
            ),
            job: fromRpcSchedulerJobRecord(
              requiredField(approvalSuspensionValue, "job")
            )
          }
    return {
      execution: fromRpcToolExecutionRecord(value.execution),
      ...(invocationAttempt === undefined ? {} : { invocationAttempt }),
      ...(approvalSuspension === undefined ? {} : { approvalSuspension }),
      created: value.created === true
    }
  }

  async deferToolExecution(
    request: DeferToolExecutionRequest
  ): Promise<DeferToolExecutionReceipt> {
    const value = await this.callTools({
      command: "defer-tool-execution",
      request: toRpcDeferToolExecutionRequest(request)
    })
    return fromRpcDeferToolExecutionReceipt(value)
  }

  async finishToolExecution(request: FinishToolExecutionRequest): Promise<ToolExecutionRecord | null> {
    const value = await this.callTools({
      command: "finish-tool-execution",
      request: toRpcFinishToolExecutionRequest(request)
    })
    return value === null ? null : fromRpcToolExecutionRecord(value)
  }

  async requireToolExecutionRecovery(
    request: RequireToolExecutionRecoveryRequest
  ): Promise<RequireToolExecutionRecoveryReceipt | null> {
    const value = await this.callTools({
      command: "require-tool-execution-recovery",
      request: toRpcRequireToolExecutionRecoveryRequest(request)
    })
    if (value === null) return null
    if (!isRecord(value)) {
      throw new Error("require tool recovery receipt must be an object")
    }
    return {
      execution: fromRpcToolExecutionRecord(requiredField(value, "execution")),
      turn: fromRpcSessionTurnRecord(requiredField(value, "turn")),
      attempt: fromRpcSessionAttemptRecord(requiredField(value, "attempt")),
      job: fromRpcSchedulerJobRecord(requiredField(value, "job"))
    }
  }

  async resolveToolExecutionRecovery(
    request: ResolveToolExecutionRecoveryRequest
  ): Promise<ResolveToolExecutionRecoveryReceipt> {
    const value = await this.callTools({
      command: "resolve-tool-execution-recovery",
      request: toRpcResolveToolExecutionRecoveryRequest(request)
    })
    if (!isRecord(value)) {
      throw new Error("resolve tool recovery receipt must be an object")
    }
    return {
      execution: fromRpcToolExecutionRecord(requiredField(value, "execution")),
      recoveryDecision: fromRpcToolExecutionRecoveryDecisionRecord(
        requiredField(value, "recovery_decision")
      )
    }
  }

  async resolveToolExecutionApproval(
    request: ResolveToolExecutionApprovalRequest
  ): Promise<ResolveToolExecutionApprovalReceipt> {
    const value = await this.callTools({
      command: "resolve-tool-execution-approval",
      request: toRpcResolveToolExecutionApprovalRequest(request)
    })
    if (!isRecord(value)) {
      throw new Error("resolve tool approval receipt must be an object")
    }
    return {
      execution: fromRpcToolExecutionRecord(requiredField(value, "execution")),
      approvalDecision: fromRpcToolExecutionApprovalDecisionRecord(
        requiredField(value, "approval_decision")
      ),
      turn: fromRpcSessionTurnRecord(requiredField(value, "turn")),
      job: fromRpcSchedulerJobRecord(requiredField(value, "job"))
    }
  }

  async getToolExecution(executionId: string): Promise<ToolExecutionRecord | null> {
    const value = await this.callTools({ command: "get-tool-execution", execution_id: executionId })
    return value === null ? null : fromRpcToolExecutionRecord(value)
  }

  async getToolExecutionByCall(
    request: GetToolExecutionByCallRequest
  ): Promise<ToolExecutionRecord | null> {
    const value = await this.callTools({
      command: "get-tool-execution-by-call",
      request: {
        turn_id: request.turnId,
        source_message_id: request.sourceMessageId,
        tool_call_id: request.toolCallId
      }
    })
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

  async listToolActivities(
    request: ListToolActivitiesRequest
  ): Promise<ToolActivityRecord[]> {
    const value = await this.callTools({
      command: "list-tool-activities",
      request: toRpcListToolActivitiesRequest(request)
    })
    assertArray(value, "tool activities")
    return value.map(fromRpcToolActivityRecord)
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

function requiredField(
  value: JsonValue,
  name: string
): JsonValue {
  if (!isRecord(value)) {
    throw new Error("tool receipt field container must be an object")
  }
  const field = value[name]
  if (field === undefined || field === null) {
    throw new Error(`tool recovery receipt requires ${name}`)
  }
  return field
}
