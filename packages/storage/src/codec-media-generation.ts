import type {
  AcceptMediaGenerationOperationRequest,
  BeginMediaGenerationOperationRequest,
  CompleteMediaGenerationOperationRequest,
  CheckpointMediaGenerationOperationRequest,
  GetMediaGenerationOperationRequest,
  JsonValue,
  ListMediaGenerationOperationsRequest,
  MediaGenerationBeginReceipt,
  MediaGenerationOperationBinding,
  MediaGenerationOperationRecord,
  MediaGenerationOperationSubmission,
  MediaGenerationOperationState,
  MediaGenerationOutputReferenceRecord,
  RecordMediaGenerationOutputsRequest,
  RequestMediaGenerationCancelRequest,
  SettleMediaGenerationOperationRequest,
  SubmitMediaGenerationOperationRequest
} from "@wanex/protocol"
import type {
  MediaGenerationAcceptWire,
  MediaGenerationCheckpointWire,
  MediaGenerationCompleteWire,
  MediaGenerationLeaseWire,
  MediaGenerationListWire,
  MediaGenerationOutputsWire,
  MediaGenerationSettleWire,
  MediaGenerationSubmitWire
} from "./generated/storage-rpc.js"
import {
  assertArray,
  expectNumber,
  expectString,
  isRecord,
  optionalNumber,
  optionalString,
  toRpcJsonValue,
  withOptionalFields
} from "./codec-helpers.js"
import { fromRpcSchedulerJobRecord } from "./codec-scheduler.js"

export function toRpcSubmitMediaGenerationOperationRequest(
  request: SubmitMediaGenerationOperationRequest
): MediaGenerationSubmitWire {
  return {
    id: request.id ?? null,
    job_id: request.jobId ?? null,
    principal_id: request.principalId,
    idempotency_key: request.idempotencyKey,
    binding: toRpcJsonValue(request.binding as unknown as JsonValue),
    priority: request.priority ?? null
  }
}

export function toRpcBeginMediaGenerationOperationRequest(
  request: BeginMediaGenerationOperationRequest
): MediaGenerationLeaseWire {
  return {
    operation_id: request.operationId,
    worker_id: request.workerId,
    lease_token: request.leaseToken
  }
}

export function toRpcAcceptMediaGenerationOperationRequest(
  request: AcceptMediaGenerationOperationRequest
): MediaGenerationAcceptWire {
  return {
    operation_id: request.operationId,
    worker_id: request.workerId,
    lease_token: request.leaseToken,
    external_operation_id: request.externalOperationId,
    provider_checkpoint: toRpcJsonValue(request.providerCheckpoint ?? null)
  }
}

export function toRpcCheckpointMediaGenerationOperationRequest(
  request: CheckpointMediaGenerationOperationRequest
): MediaGenerationCheckpointWire {
  return {
    operation_id: request.operationId,
    worker_id: request.workerId,
    lease_token: request.leaseToken,
    provider_checkpoint: toRpcJsonValue(request.providerCheckpoint ?? null),
    progress: toRpcJsonValue(request.progress ?? null)
  }
}

export function toRpcRecordMediaGenerationOutputsRequest(
  request: RecordMediaGenerationOutputsRequest
): MediaGenerationOutputsWire {
  return {
    operation_id: request.operationId,
    worker_id: request.workerId,
    lease_token: request.leaseToken,
    output_references: request.outputReferences.map((value) =>
      toRpcJsonValue(value as unknown as JsonValue)
    ),
    progress: toRpcJsonValue(request.progress ?? null)
  }
}

export function toRpcCompleteMediaGenerationOperationRequest(
  request: CompleteMediaGenerationOperationRequest
): MediaGenerationCompleteWire {
  return {
    operation_id: request.operationId,
    worker_id: request.workerId,
    lease_token: request.leaseToken,
    output_resource_ids: [...request.outputResourceIds],
    result: toRpcJsonValue(request.result ?? null)
  }
}

export function toRpcSettleMediaGenerationOperationRequest(
  request: SettleMediaGenerationOperationRequest
): MediaGenerationSettleWire {
  return {
    operation_id: request.operationId,
    worker_id: request.workerId,
    lease_token: request.leaseToken,
    outcome: request.outcome,
    error: toRpcJsonValue(request.error ?? null),
    reason: request.reason ?? null
  }
}

export function toRpcRequestMediaGenerationCancelRequest(
  request: RequestMediaGenerationCancelRequest
): { operation_id: string; reason: string } {
  return { operation_id: request.operationId, reason: request.reason }
}

export function toRpcGetMediaGenerationOperationRequest(
  request: GetMediaGenerationOperationRequest
): { operation_id: string } {
  return { operation_id: request.operationId }
}

export function toRpcListMediaGenerationOperationsRequest(
  request: ListMediaGenerationOperationsRequest
): MediaGenerationListWire {
  return {
    principal_id: request.principalId ?? null,
    state: request.state ?? null,
    limit: request.limit ?? null
  }
}

export function fromRpcMediaGenerationOperationSubmission(
  value: JsonValue
): MediaGenerationOperationSubmission {
  const record = expectRecord(value, "media generation submission")
  return {
    operation: fromRpcMediaGenerationOperation(record.operation ?? null),
    job: fromRpcSchedulerJobRecord(record.job ?? null)
  }
}

export function fromRpcMediaGenerationBeginReceipt(
  value: JsonValue
): MediaGenerationBeginReceipt {
  const record = expectRecord(value, "media generation begin receipt")
  return {
    operation: fromRpcMediaGenerationOperation(record.operation ?? null),
    job: fromRpcSchedulerJobRecord(record.job ?? null),
    action: expectString(record.action, "media generation action") as MediaGenerationBeginReceipt["action"]
  }
}

export function fromRpcMediaGenerationOperation(
  value: JsonValue
): MediaGenerationOperationRecord {
  const record = expectRecord(value, "media generation operation")
  assertArray(record.output_references, "media generation output_references")
  assertArray(record.output_resource_ids, "media generation output_resource_ids")
  const base = {
    id: expectString(record.id, "media generation.id"),
    jobId: expectString(record.job_id, "media generation.job_id"),
    principalId: expectString(record.principal_id, "media generation.principal_id"),
    idempotencyKey: expectString(record.idempotency_key, "media generation.idempotency_key"),
    state: expectMediaGenerationState(record.state ?? null),
    binding: expectBinding(record.binding ?? null),
    dispatchAttempt: expectNumber(record.dispatch_attempt, "media generation.dispatch_attempt"),
    outputReferences: record.output_references.map((item) => expectOutputReference(item)),
    outputResourceIds: record.output_resource_ids.map((item) => expectString(item, "media generation.output_resource_ids[]")),
    createdAt: expectNumber(record.created_at, "media generation.created_at"),
    updatedAt: expectNumber(record.updated_at, "media generation.updated_at")
  }
  return withOptionalFields(base, {
    externalOperationId: optionalString(record.external_operation_id, "media generation.external_operation_id"),
    providerCheckpoint: record.provider_checkpoint ?? undefined,
    progress: record.progress ?? undefined,
    error: record.error ?? undefined,
    cancelRequestedAt: optionalNumber(record.cancel_requested_at, "media generation.cancel_requested_at"),
    cancelReason: optionalString(record.cancel_reason, "media generation.cancel_reason"),
    finishedAt: optionalNumber(record.finished_at, "media generation.finished_at")
  })
}

function expectRecord(value: JsonValue, label: string): Record<string, JsonValue> {
  if (!isRecord(value)) throw new Error(`${label} must be an object`)
  return value
}

function expectBinding(value: JsonValue): MediaGenerationOperationBinding {
  return expectRecord(value, "media generation.binding") as unknown as MediaGenerationOperationBinding
}

function expectOutputReference(value: JsonValue): MediaGenerationOutputReferenceRecord {
  return expectRecord(value, "media generation.output_reference") as unknown as MediaGenerationOutputReferenceRecord
}

function expectMediaGenerationState(value: JsonValue): MediaGenerationOperationState {
  const state = expectString(value, "media generation.state") as MediaGenerationOperationState
  if (!["queued", "submitting", "polling", "materializing", "cancel_requested", "succeeded", "failed", "cancelled", "recovery_required"].includes(state)) {
    throw new Error(`invalid media generation state: ${state}`)
  }
  return state
}
