import type {
  DeferredToolOperationRequest,
  DeferToolExecutionReceipt,
  DeferToolExecutionRequest,
  JsonValue
} from "@wanex/protocol"
import type {
  DeferToolExecutionWire,
  DeferredToolOperationWire
} from "./generated/storage-rpc.js"
import { expectString, isRecord, toRpcJsonValue } from "./codec-helpers.js"
import { fromRpcMediaGenerationOperation } from "./codec-media-generation.js"
import {
  fromRpcDeferredTeamDelegationOperationReceipt,
  toRpcDeferredTeamDelegationOperation
} from "./codec-deferred-team.js"
import { fromRpcSchedulerJobRecord } from "./codec-scheduler.js"
import {
  fromRpcSessionAttemptRecord,
  fromRpcSessionTurnRecord
} from "./codec-session-turn-records.js"
import {
  fromRpcToolExecutionAttemptRecord,
  fromRpcToolExecutionRecord
} from "./codec-tools.js"

export function toRpcDeferToolExecutionRequest(
  request: DeferToolExecutionRequest
): DeferToolExecutionWire {
  return {
    session_id: request.sessionId,
    turn_id: request.turnId,
    session_attempt_id: request.sessionAttemptId,
    input_id: request.inputId,
    source_message_id: request.sourceMessageId,
    session_job_id: request.sessionJobId,
    worker_id: request.workerId,
    lease_token: request.leaseToken,
    tool_execution_id: request.toolExecutionId,
    tool_invocation_attempt_id: request.toolInvocationAttemptId,
    tool_call_id: request.toolCallId,
    operation: toRpcDeferredToolOperation(request.operation)
  }
}

function toRpcDeferredToolOperation(
  operation: DeferredToolOperationRequest
): DeferredToolOperationWire {
  switch (operation.kind) {
    case "media_generation":
      return {
        kind: operation.kind,
        binding: toRpcJsonValue(operation.binding as unknown as JsonValue),
        priority: operation.priority ?? null
      }
    case "team_delegation":
      return toRpcDeferredTeamDelegationOperation(operation)
  }
}

export function fromRpcDeferToolExecutionReceipt(
  value: JsonValue
): DeferToolExecutionReceipt {
  if (!isRecord(value)) {
    throw new Error("deferred Tool handoff receipt must be an object")
  }
  const receipt = value
  if (!isRecord(receipt.operation)) {
    throw new Error("deferred Tool operation receipt must be an object")
  }
  const operation = receipt.operation
  const kind = expectString(operation.kind, "deferred Tool operation kind")
  if (kind === "team_delegation") {
    return {
      turn: fromRpcSessionTurnRecord(receipt.turn ?? null),
      sessionAttempt: fromRpcSessionAttemptRecord(receipt.session_attempt ?? null),
      sessionJob: fromRpcSchedulerJobRecord(receipt.session_job ?? null),
      toolExecution: fromRpcToolExecutionRecord(receipt.tool_execution ?? null),
      toolInvocationAttempt: fromRpcToolExecutionAttemptRecord(
        receipt.tool_invocation_attempt ?? null
      ),
      operation: fromRpcDeferredTeamDelegationOperationReceipt(operation)
    }
  }
  if (kind !== "media_generation") {
    throw new Error(`unsupported deferred Tool operation kind: ${kind}`)
  }
  return {
    turn: fromRpcSessionTurnRecord(receipt.turn ?? null),
    sessionAttempt: fromRpcSessionAttemptRecord(receipt.session_attempt ?? null),
    sessionJob: fromRpcSchedulerJobRecord(receipt.session_job ?? null),
    toolExecution: fromRpcToolExecutionRecord(receipt.tool_execution ?? null),
    toolInvocationAttempt: fromRpcToolExecutionAttemptRecord(
      receipt.tool_invocation_attempt ?? null
    ),
    operation: {
      kind,
      record: fromRpcMediaGenerationOperation(operation.record ?? null),
      job: fromRpcSchedulerJobRecord(operation.job ?? null)
    }
  }
}
