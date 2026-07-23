import type {
  BeginToolExecutionRequest,
  FinishToolExecutionRequest,
  JsonValue,
  ListToolExecutionAttemptsRequest,
  ListToolExecutionsRequest,
  ToolExecutionAttemptRecord,
  ToolExecutionAttemptState,
  ToolExecutionRecord,
  ToolExecutionState
} from "@wanex/protocol"
import {
  expectBoolean,
  expectNumber,
  expectString,
  isRecord,
  optionalNumber,
  optionalString,
  withOptionalFields
} from "./codec-helpers.js"
import type {
  BeginToolExecutionWire,
  FinishToolExecutionWire,
  ListToolExecutionAttemptsWire,
  ListToolExecutionsWire,
} from "./generated/storage-rpc.js"
import { toRpcJsonValue } from "./codec-common.js"

export function fromRpcToolExecutionRecord(value: JsonValue): ToolExecutionRecord {
  if (!isRecord(value)) throw new Error("tool execution must be an object")
  return withOptionalFields(
    {
      id: expectString(value.id, "tool_execution.id"),
      sessionId: expectString(value.session_id, "tool_execution.session_id"),
      turnId: expectString(value.turn_id, "tool_execution.turn_id"),
      inputId: expectString(value.input_id, "tool_execution.input_id"),
      sourceMessageId: expectString(
        value.source_message_id,
        "tool_execution.source_message_id"
      ),
      principalId: expectString(value.principal_id, "tool_execution.principal_id"),
      toolCallId: expectString(value.tool_call_id, "tool_execution.tool_call_id"),
      toolName: expectString(value.tool_name, "tool_execution.tool_name"),
      input: value.input ?? null,
      descriptor: value.descriptor ?? null,
      permission: value.permission ?? null,
      state: expectToolExecutionState(value.state),
      attemptCount: expectNumber(value.attempt_count, "tool_execution.attempt_count"),
      idempotencyKey: expectString(value.idempotency_key, "tool_execution.idempotency_key"),
      createdAt: expectNumber(value.created_at, "tool_execution.created_at"),
      updatedAt: expectNumber(value.updated_at, "tool_execution.updated_at")
    },
    {
      currentInvocationAttemptId: optionalString(
        value.current_invocation_attempt_id,
        "tool_execution.current_invocation_attempt_id"
      ),
      result: value.result === null || value.result === undefined ? undefined : value.result,
      isError:
        value.is_error === null || value.is_error === undefined
          ? undefined
          : expectBoolean(value.is_error, "tool_execution.is_error"),
      error: value.error === null || value.error === undefined ? undefined : value.error,
      finishedAt: optionalNumber(value.finished_at, "tool_execution.finished_at")
    }
  )
}

export function fromRpcToolExecutionAttemptRecord(
  value: JsonValue
): ToolExecutionAttemptRecord {
  if (!isRecord(value)) throw new Error("tool execution attempt must be an object")
  return withOptionalFields(
    {
      id: expectString(value.id, "tool_attempt.id"),
      executionId: expectString(value.execution_id, "tool_attempt.execution_id"),
      sessionAttemptId: expectString(
        value.session_attempt_id,
        "tool_attempt.session_attempt_id"
      ),
      jobId: expectString(value.job_id, "tool_attempt.job_id"),
      workerId: expectString(value.worker_id, "tool_attempt.worker_id"),
      attemptNumber: expectNumber(
        value.attempt_number,
        "tool_attempt.attempt_number"
      ),
      state: expectToolExecutionAttemptState(value.state),
      startedAt: expectNumber(value.started_at, "tool_attempt.started_at"),
      updatedAt: expectNumber(value.updated_at, "tool_attempt.updated_at")
    },
    {
      error: value.error === null || value.error === undefined ? undefined : value.error,
      finishedAt: optionalNumber(value.finished_at, "tool_attempt.finished_at")
    }
  )
}

export function toRpcBeginToolExecutionRequest(
  request: BeginToolExecutionRequest
): BeginToolExecutionWire {
  return {
    session_id: request.sessionId,
    turn_id: request.turnId,
    attempt_id: request.attemptId,
    input_id: request.inputId,
    source_message_id: request.sourceMessageId,
    job_id: request.jobId,
    worker_id: request.workerId,
    lease_token: request.leaseToken,
    principal_id: request.principalId,
    tool_call_id: request.toolCallId,
    tool_name: request.toolName,
    input: toRpcJsonValue(request.input),
    descriptor: toRpcJsonValue(request.descriptor),
    permission: toRpcJsonValue(request.permission),
    state: request.state,
    idempotency_key: request.idempotencyKey
  }
}

export function toRpcFinishToolExecutionRequest(
  request: FinishToolExecutionRequest
): FinishToolExecutionWire {
  return {
    session_id: request.sessionId,
    turn_id: request.turnId,
    session_attempt_id: request.sessionAttemptId,
    input_id: request.inputId,
    job_id: request.jobId,
    worker_id: request.workerId,
    lease_token: request.leaseToken,
    execution_id: request.executionId,
    invocation_attempt_id: request.invocationAttemptId,
    state: request.state,
    result: request.result === undefined ? null : toRpcJsonValue(request.result),
    is_error: request.isError ?? null,
    error: request.error === undefined ? null : toRpcJsonValue(request.error)
  }
}

export function toRpcListToolExecutionsRequest(
  request: ListToolExecutionsRequest
): ListToolExecutionsWire {
  return {
    session_id: request.sessionId ?? null,
    turn_id: request.turnId ?? null,
    state: request.state ?? null,
    limit: request.limit ?? null
  }
}

export function toRpcListToolExecutionAttemptsRequest(
  request: ListToolExecutionAttemptsRequest
): ListToolExecutionAttemptsWire {
  return { execution_id: request.executionId }
}

function expectToolExecutionState(value: JsonValue | undefined): ToolExecutionState {
  if (
    value !== "running" && value !== "retry_ready" && value !== "denied" &&
    value !== "approval_required" && value !== "succeeded" &&
    value !== "failed" && value !== "cancelled" &&
    value !== "recovery_required"
  ) {
    throw new Error("tool_execution.state is invalid")
  }
  return value
}

function expectToolExecutionAttemptState(
  value: JsonValue | undefined
): ToolExecutionAttemptState {
  if (
    value !== "running" && value !== "succeeded" && value !== "failed" &&
    value !== "cancelled" && value !== "interrupted" &&
    value !== "recovery_required"
  ) {
    throw new Error("tool_execution_attempt.state is invalid")
  }
  return value
}
