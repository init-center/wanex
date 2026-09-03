import {
  type CancelJobRequest,
  type ClaimJobRequest,
  type CompleteJobRequest,
  type EnqueueJobRequest,
  type FailJobRequest,
  type GetJobRequest,
  type HeartbeatJobRequest,
  type JsonValue,
  type ListJobsRequest,
  type SchedulerJobRecord
} from "@wanex/protocol"

import {
  expectNumber,
  expectRetryPolicy,
  expectSchedulerJobKind,
  expectSchedulerJobState,
  expectString,
  isRecord,
  optionalNumber,
  optionalString,
  toRpcJsonValue,
  withOptionalFields
} from "./codec-helpers.js"
import type {
  CancelJobWire,
  ClaimJobWire,
  CompleteJobWire,
  EnqueueJobWire,
  FailJobWire,
  GetJobWire,
  HeartbeatJobWire,
  ListJobsWire
} from "./generated/storage-rpc.js"

export function toRpcEnqueueJobRequest(request: EnqueueJobRequest): EnqueueJobWire {
  return {
    id: request.id ?? null,
    kind: request.kind,
    queue: request.queue ?? null,
    principal_id: request.principalId,
    payload: toRpcJsonValue(request.payload),
    scheduled_at: request.scheduledAt ?? null,
    not_before: request.notBefore ?? null,
    priority: request.priority ?? null,
    concurrency_key: request.concurrencyKey ?? null,
    max_attempts: request.maxAttempts ?? null,
    retry_policy:
      request.retryPolicy === undefined
        ? null
        : {
            strategy: request.retryPolicy.strategy,
            initial_delay_ms: request.retryPolicy.initialDelayMs ?? null,
            max_delay_ms: request.retryPolicy.maxDelayMs ?? null
          },
    idempotency_key: request.idempotencyKey ?? null,
    budget_grant_id: request.budgetGrantId ?? null
  }
}

export function toRpcClaimJobRequest(request: ClaimJobRequest): ClaimJobWire {
  return {
    worker_id: request.workerId,
    lease_ms: request.leaseMs,
    kinds: request.kinds === undefined ? null : [...request.kinds],
    queues: request.queues === undefined ? null : [...request.queues]
  }
}

export function toRpcHeartbeatJobRequest(
  request: HeartbeatJobRequest
): HeartbeatJobWire {
  return {
    job_id: request.jobId,
    worker_id: request.workerId,
    lease_token: request.leaseToken,
    lease_ms: request.leaseMs
  }
}

export function toRpcCompleteJobRequest(
  request: CompleteJobRequest
): CompleteJobWire {
  return {
    job_id: request.jobId,
    worker_id: request.workerId,
    lease_token: request.leaseToken,
    result: toRpcJsonValue(request.result ?? null)
  }
}

export function toRpcFailJobRequest(request: FailJobRequest): FailJobWire {
  return {
    job_id: request.jobId,
    worker_id: request.workerId,
    lease_token: request.leaseToken,
    error: toRpcJsonValue(request.error)
  }
}

export function toRpcCancelJobRequest(request: CancelJobRequest): CancelJobWire {
  return {
    job_id: request.jobId,
    reason: request.reason
  }
}

export function toRpcGetJobRequest(request: GetJobRequest): GetJobWire {
  return {
    job_id: request.jobId
  }
}

export function toRpcListJobsRequest(request: ListJobsRequest): ListJobsWire {
  return {
    state: request.state ?? null,
    kind: request.kind ?? null,
    limit: request.limit ?? null
  }
}

export function fromRpcSchedulerJobRecord(
  value: JsonValue
): SchedulerJobRecord {
  if (!isRecord(value)) {
    throw new Error("scheduler job must be an object")
  }
  const record = {
    id: expectString(value.id, "job.id"),
    kind: expectSchedulerJobKind(value.kind),
    queue: expectString(value.queue, "job.queue"),
    state: expectSchedulerJobState(value.state),
    principalId: expectString(value.principal_id, "job.principal_id"),
    payload: (value.payload ?? null) as JsonValue,
    scheduledAt: expectNumber(value.scheduled_at, "job.scheduled_at"),
    priority: expectNumber(value.priority, "job.priority"),
    attempt: expectNumber(value.attempt, "job.attempt"),
    maxAttempts: expectNumber(value.max_attempts, "job.max_attempts"),
    retryPolicy: expectRetryPolicy(value.retry_policy, "job.retry_policy"),
    createdAt: expectNumber(value.created_at, "job.created_at"),
    updatedAt: expectNumber(value.updated_at, "job.updated_at")
  }
  return withOptionalFields(record, {
    notBefore: optionalNumber(value.not_before, "job.not_before"),
    concurrencyKey: optionalString(
      value.concurrency_key,
      "job.concurrency_key"
    ),
    idempotencyKey: optionalString(value.idempotency_key, "job.idempotency_key"),
    budgetGrantId: optionalString(value.budget_grant_id, "job.budget_grant_id"),
    leaseOwner: optionalString(value.lease_owner, "job.lease_owner"),
    leaseToken: optionalString(value.lease_token, "job.lease_token"),
    leaseExpiresAt: optionalNumber(
      value.lease_expires_at,
      "job.lease_expires_at"
    ),
    result: value.result ?? undefined,
    lastError: value.last_error ?? undefined,
    finishedAt: optionalNumber(value.finished_at, "job.finished_at")
  })
}
