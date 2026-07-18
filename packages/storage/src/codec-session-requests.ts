import {
  type ApplySessionRunControlRequest,
  type InterruptSessionRunRequest,
  type ListSessionRunControlsRequest,
  type ListSessionsRequest,
  type SteerSessionRunRequest,
  type SubmitSessionRunRequest
} from "@wanex/protocol"

import { messagePartsToJson } from "./codec-helpers.js"
import {
  metadataToJson,
  sessionInputOriginToJson
} from "./codec-session-values.js"
import type {
  ApplySessionRunControlWire,
  InterruptSessionRunWire,
  ListSessionRunControlsWire,
  ListSessionsWire,
  SteerSessionRunWire,
  SubmitSessionRunWire
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

export function toRpcSubmitSessionRunRequest(
  request: SubmitSessionRunRequest
): SubmitSessionRunWire {
  return {
    id: request.id ?? null,
    session_id: request.sessionId,
    principal_id: request.principalId,
    idempotency_key: request.idempotencyKey,
    input_type: request.inputType ?? null,
    content: messagePartsToJson(request.content),
    origin: sessionInputOriginToJson(request.origin),
    intent: request.intent ?? null,
    run_control_policy: request.runControlPolicy ?? null,
    expected_run_id: request.expectedRunId ?? null,
    job_id: request.jobId ?? null,
    job_idempotency_key: request.jobIdempotencyKey ?? null,
    mode: request.mode ?? null,
    max_steps: request.maxSteps ?? null,
    provider_profile_id: request.providerProfileId ?? null,
    scheduled_at: request.scheduledAt ?? null,
    not_before: request.notBefore ?? null,
    priority: request.priority ?? null,
    max_attempts: request.maxAttempts ?? null,
    retry_policy:
      request.retryPolicy === undefined
        ? null
        : {
            strategy: request.retryPolicy.strategy,
            initial_delay_ms: request.retryPolicy.initialDelayMs ?? null,
            max_delay_ms: request.retryPolicy.maxDelayMs ?? null
          },
    budget_grant_id: request.budgetGrantId ?? null
  }
}

export function toRpcInterruptSessionRunRequest(
  request: InterruptSessionRunRequest
): InterruptSessionRunWire {
  return {
    session_id: request.sessionId,
    run_id: request.runId,
    reason: request.reason,
    principal_id: request.principalId ?? null,
    idempotency_key: request.idempotencyKey ?? null,
    origin: sessionInputOriginToJson(request.origin),
    metadata: metadataToJson(request.metadata)
  }
}

export function toRpcSteerSessionRunRequest(
  request: SteerSessionRunRequest
): SteerSessionRunWire {
  return {
    session_id: request.sessionId,
    principal_id: request.principalId,
    expected_run_id: request.expectedRunId,
    idempotency_key: request.idempotencyKey,
    content: messagePartsToJson(request.content),
    origin: sessionInputOriginToJson(request.origin),
    provider_profile_id: request.providerProfileId ?? null,
    metadata: metadataToJson(request.metadata)
  }
}

export function toRpcListSessionRunControlsRequest(
  request: ListSessionRunControlsRequest
): ListSessionRunControlsWire {
  return {
    session_id: request.sessionId,
    run_id: request.runId ?? null,
    kind: request.kind ?? null,
    status: request.status ?? null,
    limit: request.limit ?? null
  }
}

export function toRpcApplySessionRunControlRequest(
  request: ApplySessionRunControlRequest
): ApplySessionRunControlWire {
  return {
    session_id: request.sessionId,
    run_id: request.runId,
    control_id: request.controlId,
    runner_id: request.runnerId,
    lease_token: request.leaseToken
  }
}
