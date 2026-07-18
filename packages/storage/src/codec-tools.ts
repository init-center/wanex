import type {
  BeginToolExecutionRequest,
  FinishToolExecutionRequest,
  JsonValue,
  ListToolExecutionsRequest,
  RecoverToolExecutionRequest,
  ToolExecutionRecord,
  ToolExecutionState
} from "@wanex/protocol"
import {
  expectBoolean,
  expectNumber,
  expectString,
  isRecord,
  optionalNumber,
  withOptionalFields
} from "./codec-helpers.js"
import type {
  BeginToolExecutionWire,
  FinishToolExecutionWire,
  ListToolExecutionsWire,
  RecoverToolExecutionWire
} from "./generated/storage-rpc.js"
import { toRpcJsonValue } from "./codec-common.js"

export function fromRpcToolExecutionRecord(value: JsonValue): ToolExecutionRecord {
  if (!isRecord(value)) throw new Error("tool execution must be an object")
  return withOptionalFields(
    {
      id: expectString(value.id, "tool_execution.id"),
      sessionId: expectString(value.session_id, "tool_execution.session_id"),
      runId: expectString(value.run_id, "tool_execution.run_id"),
      inputId: expectString(value.input_id, "tool_execution.input_id"),
      principalId: expectString(value.principal_id, "tool_execution.principal_id"),
      toolCallId: expectString(value.tool_call_id, "tool_execution.tool_call_id"),
      toolName: expectString(value.tool_name, "tool_execution.tool_name"),
      input: value.input ?? null,
      descriptor: value.descriptor ?? null,
      permission: value.permission ?? null,
      state: expectToolExecutionState(value.state),
      attempt: expectNumber(value.attempt, "tool_execution.attempt"),
      idempotencyKey: expectString(value.idempotency_key, "tool_execution.idempotency_key"),
      createdAt: expectNumber(value.created_at, "tool_execution.created_at"),
      updatedAt: expectNumber(value.updated_at, "tool_execution.updated_at")
    },
    {
      result: value.result === null || value.result === undefined ? undefined : value.result,
      isError:
        value.is_error === null || value.is_error === undefined
          ? undefined
          : expectBoolean(value.is_error, "tool_execution.is_error"),
      error: value.error === null || value.error === undefined ? undefined : value.error,
      startedAt: optionalNumber(value.started_at, "tool_execution.started_at"),
      finishedAt: optionalNumber(value.finished_at, "tool_execution.finished_at")
    }
  )
}

export function toRpcBeginToolExecutionRequest(
  request: BeginToolExecutionRequest
): BeginToolExecutionWire {
  return {
    session_id: request.sessionId,
    run_id: request.runId,
    input_id: request.inputId,
    principal_id: request.principalId,
    tool_call_id: request.toolCallId,
    tool_name: request.toolName,
    input: toRpcJsonValue(request.input),
    descriptor: toRpcJsonValue(request.descriptor),
    permission: toRpcJsonValue(request.permission),
    idempotency_key: request.idempotencyKey
  }
}

export function toRpcFinishToolExecutionRequest(
  request: FinishToolExecutionRequest
): FinishToolExecutionWire {
  return {
    execution_id: request.executionId,
    state: request.state,
    result: request.result === undefined ? null : toRpcJsonValue(request.result),
    is_error: request.isError ?? null,
    error: request.error === undefined ? null : toRpcJsonValue(request.error)
  }
}

export function toRpcRecoverToolExecutionRequest(
  request: RecoverToolExecutionRequest
): RecoverToolExecutionWire {
  return { execution_id: request.executionId, action: request.action }
}

export function toRpcListToolExecutionsRequest(
  request: ListToolExecutionsRequest
): ListToolExecutionsWire {
  return {
    session_id: request.sessionId ?? null,
    run_id: request.runId ?? null,
    state: request.state ?? null,
    limit: request.limit ?? null
  }
}

function expectToolExecutionState(value: JsonValue | undefined): ToolExecutionState {
  if (
    value !== "running" && value !== "denied" &&
    value !== "approval_required" && value !== "succeeded" &&
    value !== "failed" && value !== "cancelled" &&
    value !== "recovery_required"
  ) {
    throw new Error("tool_execution.state is invalid")
  }
  return value
}
