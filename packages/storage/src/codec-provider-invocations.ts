import type {
  BeginProviderInvocationRequest,
  CheckpointProviderInvocationRequest,
  FinishProviderInvocationReceipt,
  FinishProviderInvocationRequest,
  JsonValue,
  ListProviderInvocationsRequest,
  MarkProviderInvocationOutputRequest,
  ProviderInvocationRecord,
  ProviderInvocationState,
  ProviderResponseCheckpoint
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
import { messagePartsFromJson, expectProviderState, assertArray } from "./codec-helpers.js"
import { fromRpcResourceInputEvidence, toRpcResourceInputEvidence } from "./codec-resource.js"
import { digestCanonicalJson } from "./codec-canonical.js"
import { fromRpcSessionMessageRecord } from "./codec-session-message-records.js"
import { toRpcJsonValue, toRpcJsonValueFromUnknown } from "./codec-common.js"
import type {
  BeginProviderInvocationWire,
  CheckpointProviderInvocationWire,
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
  assertArray(value.input_resources, "provider invocation input resources")
  const responseCheckpoint = value.response_checkpoint == null ? undefined : readCheckpoint(value.response_checkpoint)
  const responseDigest = optionalString(value.response_digest, "provider invocation response digest")
  if ((responseCheckpoint === undefined) !== (responseDigest === undefined) ||
      (responseCheckpoint !== undefined && digestCanonicalJson(toRpcJsonValueFromUnknown(responseCheckpoint)) !== responseDigest)) {
    throw new Error("provider invocation checkpoint digest is invalid")
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
      inputResources: value.input_resources.map((value) => fromRpcResourceInputEvidence(value)),
      state: expectProviderInvocationState(value.state),
      outputObserved: expectBoolean(
        value.output_observed,
        "provider_invocation.output_observed"
      ),
      startedAt: expectNumber(value.started_at, "provider_invocation.started_at"),
      updatedAt: expectNumber(value.updated_at, "provider_invocation.updated_at")
    },
    {
      responseCheckpoint,
      responseDigest,
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
    request_digest: request.requestDigest,
    input_resources: request.inputResources.map(toRpcResourceInputEvidence)
  }
}

export function toRpcCheckpointProviderInvocationRequest(request: CheckpointProviderInvocationRequest): CheckpointProviderInvocationWire {
  const response = toRpcJsonValueFromUnknown(request.response)
  readCheckpoint(response)
  if (digestCanonicalJson(response) !== request.responseDigest) throw new Error("provider response digest does not match checkpoint")
  return {
    ...toRpcMarkProviderInvocationOutputRequest(request), response, response_digest: request.responseDigest
  }
}

function readCheckpoint(value: JsonValue): ProviderResponseCheckpoint {
  if (!isRecord(value) || !isRecord(value.finish) || value.finish.type !== "finish" ||
      (value.finish.reason !== "stop" && value.finish.reason !== "tool_calls")) {
    throw new Error("provider checkpoint requires a complete response")
  }
  assertArray(value.providerState, "provider checkpoint state")
  const usage = value.usage
  if (usage !== undefined) {
    if (!isRecord(usage)) throw new Error("provider checkpoint usage must be an object")
    for (const [key, count] of Object.entries(usage)) {
      if (key !== "metadata" && (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0)) {
        throw new Error("provider checkpoint usage must contain non-negative safe integers")
      }
    }
  }
  const parts = messagePartsFromJson(value.parts).map((part) => {
    if (part.type !== "text" && part.type !== "reasoning" && part.type !== "tool_call" && part.type !== "resource") {
      throw new Error("provider checkpoint contains a non-provider message part")
    }
    return part
  })
  return {
    parts, providerState: value.providerState.map(expectProviderState),
    finish: { type: "finish", reason: value.finish.reason,
      ...(value.finish.rawReason === undefined ? {} : { rawReason: expectString(value.finish.rawReason, "provider finish raw reason") }) },
    ...(usage === undefined ? {} : { usage: usage as NonNullable<ProviderResponseCheckpoint["usage"]> })
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
    value !== "output_ready" &&
    value !== "succeeded" &&
    value !== "failed_before_output" &&
    value !== "ambiguous"
  ) {
    throw new Error("provider_invocation.state is invalid")
  }
  return value
}
