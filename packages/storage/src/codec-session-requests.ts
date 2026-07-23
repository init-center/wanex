import type {
  ApplySessionTurnControlRequest,
  InterruptSessionTurnRequest,
  ListSessionTurnControlsRequest,
  ListSessionsRequest,
  RequestSessionTurnCancelRequest,
  SettleSessionTurnRequest,
  StartSessionTurnAttemptRequest,
  SteerSessionTurnRequest,
  SubmitSessionTurnRequest
} from "@wanex/protocol"

import { toRpcJsonValue, toRpcJsonValueFromUnknown } from "./codec-common.js"
import { messagePartsToJson } from "./codec-helpers.js"
import {
  metadataToJson,
  sessionInputOriginToJson
} from "./codec-session-values.js"
import type {
  ApplySessionTurnControlWire,
  InterruptSessionTurnWire,
  ListSessionTurnControlsWire,
  ListSessionsWire,
  RequestSessionTurnCancelWire,
  SettleSessionTurnWire,
  StartSessionTurnAttemptWire,
  SteerSessionTurnWire,
  SubmitSessionTurnWire
} from "./generated/storage-rpc.js"

export function toRpcListSessionsRequest(
  request: ListSessionsRequest
): ListSessionsWire {
  return {
    kind: request.kind ?? null,
    status: request.status ?? null,
    updated_before: request.updatedBefore ?? null,
    updated_after: request.updatedAfter ?? null,
    limit: request.limit ?? null
  }
}

export function toRpcSubmitSessionTurnRequest(
  request: SubmitSessionTurnRequest
): SubmitSessionTurnWire {
  return {
    id: request.id ?? null,
    turn_id: request.turnId ?? null,
    session_id: request.sessionId,
    principal_id: request.principalId,
    idempotency_key: request.idempotencyKey,
    input_type: request.inputType ?? null,
    content: messagePartsToJson(request.content),
    origin: sessionInputOriginToJson(request.origin),
    intent: request.intent ?? null,
    run_control_policy: request.runControlPolicy ?? null,
    expected_turn_id: request.expectedTurnId ?? null,
    job_id: request.jobId ?? null,
    job_idempotency_key: request.jobIdempotencyKey ?? null,
    execution_binding: toRpcJsonValueFromUnknown(request.executionBinding),
    max_steps: request.maxSteps ?? null,
    parent_turn_id: request.parentTurnId ?? null,
    regenerates_turn_id: request.regeneratesTurnId ?? null,
    scheduled_at: request.scheduledAt ?? null,
    not_before: request.notBefore ?? null,
    priority: request.priority ?? null,
    budget_grant_id: request.budgetGrantId ?? null
  }
}

export function toRpcStartSessionTurnAttemptRequest(
  request: StartSessionTurnAttemptRequest
): StartSessionTurnAttemptWire {
  return {
    session_id: request.sessionId,
    turn_id: request.turnId,
    input_id: request.inputId,
    job_id: request.jobId,
    worker_id: request.workerId,
    lease_token: request.leaseToken
  }
}

export function toRpcSettleSessionTurnRequest(
  request: SettleSessionTurnRequest
): SettleSessionTurnWire {
  return {
    session_id: request.sessionId,
    turn_id: request.turnId,
    attempt_id: request.attemptId,
    input_id: request.inputId,
    job_id: request.jobId,
    worker_id: request.workerId,
    lease_token: request.leaseToken,
    outcome: request.outcome,
    provider_invocation_id: request.providerInvocationId ?? null,
    assistant_message:
      request.assistantMessage === undefined
        ? null
        : messagePartsToJson(request.assistantMessage),
    provider_state:
      request.providerState === undefined
        ? null
        : toRpcJsonValueFromUnknown([...request.providerState]),
    result: request.result === undefined ? null : toRpcJsonValue(request.result),
    error: request.error === undefined ? null : toRpcJsonValue(request.error),
    reason: request.reason ?? null
  }
}

export function toRpcRequestSessionTurnCancelRequest(
  request: RequestSessionTurnCancelRequest
): RequestSessionTurnCancelWire {
  return {
    session_id: request.sessionId,
    turn_id: request.turnId,
    input_id: request.inputId,
    job_id: request.jobId,
    reason: request.reason
  }
}

export function toRpcInterruptSessionTurnRequest(
  request: InterruptSessionTurnRequest
): InterruptSessionTurnWire {
  return {
    session_id: request.sessionId,
    turn_id: request.turnId,
    attempt_id: request.attemptId,
    reason: request.reason,
    principal_id: request.principalId ?? null,
    idempotency_key: request.idempotencyKey ?? null,
    origin: sessionInputOriginToJson(request.origin),
    metadata: metadataToJson(request.metadata)
  }
}

export function toRpcSteerSessionTurnRequest(
  request: SteerSessionTurnRequest
): SteerSessionTurnWire {
  return {
    session_id: request.sessionId,
    principal_id: request.principalId,
    expected_turn_id: request.expectedTurnId,
    expected_attempt_id: request.expectedAttemptId,
    idempotency_key: request.idempotencyKey,
    content: messagePartsToJson(request.content),
    origin: sessionInputOriginToJson(request.origin),
    metadata: metadataToJson(request.metadata)
  }
}

export function toRpcListSessionTurnControlsRequest(
  request: ListSessionTurnControlsRequest
): ListSessionTurnControlsWire {
  return {
    session_id: request.sessionId,
    turn_id: request.turnId ?? null,
    attempt_id: request.attemptId ?? null,
    kind: request.kind ?? null,
    status: request.status ?? null,
    limit: request.limit ?? null
  }
}

export function toRpcApplySessionTurnControlRequest(
  request: ApplySessionTurnControlRequest
): ApplySessionTurnControlWire {
  return {
    session_id: request.sessionId,
    turn_id: request.turnId,
    attempt_id: request.attemptId,
    control_id: request.controlId,
    job_id: request.jobId,
    worker_id: request.workerId,
    lease_token: request.leaseToken
  }
}
