import type {
  BeginProviderInvocationRequest,
  FinishProviderInvocationReceipt,
  FinishProviderInvocationRequest,
  JsonValue,
  ListProviderInvocationsRequest,
  MarkProviderInvocationOutputRequest,
  ProviderInvocationRecord,
  ProviderInvocationState
} from "@wanex/protocol"
import {
  expectBoolean,
  expectJsonField,
  expectNumber,
  expectString,
  isRecord,
  optionalNumber,
  optionalString,
  withOptionalFields
} from "./codec-helpers.js"
import { messagePartsToJson } from "./codec-helpers.js"
import { fromRpcSessionMessageRecord } from "./codec-session-message-records.js"
import { toRpcJsonValue, toRpcJsonValueFromUnknown } from "./codec-common.js"
import type {
  BeginProviderInvocationWire,
  FinishProviderInvocationWire,
  ListProviderInvocationsWire,
  MarkProviderInvocationOutputWire
} from "./generated/storage-rpc.js"

export function fromRpcProviderInvocationRecord(
  value: JsonValue
): ProviderInvocationRecord {
  if (!isRecord(value)) {
    throw new Error("provider invocation must be an object")
  }
  return withOptionalFields(
    {
      id: expectString(value.id, "provider_invocation.id"),
      sessionId: expectString(value.session_id, "provider_invocation.session_id"),
      turnId: expectString(value.turn_id, "provider_invocation.turn_id"),
      attemptId: expectString(value.attempt_id, "provider_invocation.attempt_id"),
      inputId: expectString(value.input_id, "provider_invocation.input_id"),
      jobId: expectString(value.job_id, "provider_invocation.job_id"),
      step: expectNumber(value.step, "provider_invocation.step"),
      invocationNumber: expectNumber(
        value.invocation_number,
        "provider_invocation.invocation_number"
      ),
      executionBindingDigest: expectString(
        value.execution_binding_digest,
        "provider_invocation.execution_binding_digest"
      ),
      requestDigest: expectString(
        value.request_digest,
        "provider_invocation.request_digest"
      ),
      state: expectProviderInvocationState(value.state),
      outputObserved: expectBoolean(
        value.output_observed,
        "provider_invocation.output_observed"
      ),
      startedAt: expectNumber(value.started_at, "provider_invocation.started_at"),
      updatedAt: expectNumber(value.updated_at, "provider_invocation.updated_at")
    },
    {
      providerRequestId: optionalString(
        value.provider_request_id,
        "provider_invocation.provider_request_id"
      ),
      assistantMessageId: optionalString(
        value.assistant_message_id,
        "provider_invocation.assistant_message_id"
      ),
      error: value.error === null || value.error === undefined ? undefined : value.error,
      finishedAt: optionalNumber(
        value.finished_at,
        "provider_invocation.finished_at"
      )
    }
  )
}

export function fromRpcFinishProviderInvocationReceipt(
  value: JsonValue
): FinishProviderInvocationReceipt {
  if (!isRecord(value)) {
    throw new Error("finish provider invocation receipt must be an object")
  }
  return withOptionalFields(
    {
      invocation: fromRpcProviderInvocationRecord(
        expectJsonField(value, "invocation", "provider invocation receipt")
      )
    },
    {
      assistantMessage:
        value.assistant_message === null || value.assistant_message === undefined
          ? undefined
          : fromRpcSessionMessageRecord(value.assistant_message)
    }
  )
}

export function toRpcBeginProviderInvocationRequest(
  request: BeginProviderInvocationRequest
): BeginProviderInvocationWire {
  return {
    id: request.id ?? null,
    session_id: request.sessionId,
    turn_id: request.turnId,
    attempt_id: request.attemptId,
    input_id: request.inputId,
    job_id: request.jobId,
    worker_id: request.workerId,
    lease_token: request.leaseToken,
    step: request.step,
    invocation_number: request.invocationNumber,
    request_digest: request.requestDigest
  }
}

export function toRpcMarkProviderInvocationOutputRequest(
  request: MarkProviderInvocationOutputRequest
): MarkProviderInvocationOutputWire {
  return {
    session_id: request.sessionId,
    turn_id: request.turnId,
    attempt_id: request.attemptId,
    input_id: request.inputId,
    job_id: request.jobId,
    worker_id: request.workerId,
    lease_token: request.leaseToken,
    invocation_id: request.invocationId,
    provider_request_id: request.providerRequestId ?? null
  }
}

export function toRpcFinishProviderInvocationRequest(
  request: FinishProviderInvocationRequest
): FinishProviderInvocationWire {
  return {
    session_id: request.sessionId,
    turn_id: request.turnId,
    attempt_id: request.attemptId,
    input_id: request.inputId,
    job_id: request.jobId,
    worker_id: request.workerId,
    lease_token: request.leaseToken,
    invocation_id: request.invocationId,
    outcome: request.outcome,
    assistant_message:
      request.assistantMessage === undefined
        ? null
        : messagePartsToJson(request.assistantMessage),
    provider_state:
      request.providerState === undefined
        ? null
        : toRpcJsonValueFromUnknown([...request.providerState]),
    provider_request_id: request.providerRequestId ?? null,
    error: request.error === undefined ? null : toRpcJsonValue(request.error)
  }
}

export function toRpcListProviderInvocationsRequest(
  request: ListProviderInvocationsRequest
): ListProviderInvocationsWire {
  return { turn_id: request.turnId }
}

function expectProviderInvocationState(
  value: JsonValue | undefined
): ProviderInvocationState {
  if (
    value !== "dispatched" &&
    value !== "output_observed" &&
    value !== "succeeded" &&
    value !== "failed_before_output" &&
    value !== "ambiguous"
  ) {
    throw new Error("provider_invocation.state is invalid")
  }
  return value
}
