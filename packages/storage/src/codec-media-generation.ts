import type {
  AcceptMediaGenerationOperationRequest,
  BeginMediaGenerationOperationRequest,
  CompleteMediaGenerationOperationRequest,
  GetMediaGenerationOperationRequest,
  JsonValue,
  ListMediaGenerationOperationsRequest,
  MediaGenerationOperation,
  MediaGenerationBeginReceipt,
  MediaGenerationOperationBinding,
  MediaGenerationOperationRecord,
  MediaGenerationOperationSubmission,
  MediaGenerationSuspendReceipt,
  MediaGenerationOperationState,
  MediaGenerationOutputReferenceRecord,
  MediaGenerationOutputModality,
  ModelInputModality,
  RecordMediaGenerationOutputsRequest,
  RequestMediaGenerationCancelRequest,
  SettleMediaGenerationOperationRequest,
  SuspendMediaGenerationOperationRequest,
  SubmitMediaGenerationOperationRequest
} from "@wanex/protocol"
import type {
  MediaGenerationAcceptWire,
  MediaGenerationCompleteWire,
  MediaGenerationLeaseWire,
  MediaGenerationListWire,
  MediaGenerationOutputsWire,
  MediaGenerationSettleWire,
  MediaGenerationSubmitWire,
  MediaGenerationSuspendWire
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
import {
  fromRpcSessionAttemptRecord,
  fromRpcSessionTurnRecord
} from "./codec-session-turn-records.js"
import {
  fromRpcToolExecutionAttemptRecord,
  fromRpcToolExecutionRecord
} from "./codec-tools.js"
import {
  assertModelSupportsRequirement,
  digestJson,
  expectSha256,
  readModelEndpointExecutionBinding,
  readResourceInputEvidenceList,
  requireExactKeys
} from "./codec-model-evidence.js"

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

export function toRpcSuspendMediaGenerationOperationRequest(
  request: SuspendMediaGenerationOperationRequest
): MediaGenerationSuspendWire {
  return {
    operation_id: request.operationId,
    worker_id: request.workerId,
    lease_token: request.leaseToken,
    delay_ms: request.delayMs,
    outcome: request.outcome,
    provider_checkpoint: toRpcJsonValue(request.providerCheckpoint ?? null),
    progress: toRpcJsonValue(request.progress ?? null),
    error: toRpcJsonValue(request.error ?? null)
  }
}

export function toRpcRecordMediaGenerationOutputsRequest(
  request: RecordMediaGenerationOutputsRequest
): MediaGenerationOutputsWire {
  return {
    operation_id: request.operationId,
    worker_id: request.workerId,
    lease_token: request.leaseToken,
    poll_outcome: request.pollOutcome,
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
    poll_outcome: request.pollOutcome,
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
    poll_outcome: request.pollOutcome,
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

export function fromRpcMediaGenerationSuspendReceipt(
  value: JsonValue
): MediaGenerationSuspendReceipt {
  const record = expectRecord(value, "media generation suspend receipt")
  const action = expectString(record.action, "media generation suspend action")
  if (action !== "suspended" && action !== "cancel") {
    throw new Error(`invalid media generation suspend action: ${action}`)
  }
  return {
    operation: fromRpcMediaGenerationOperation(record.operation ?? null),
    job: fromRpcSchedulerJobRecord(record.job ?? null),
    action
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
    pollCount: expectNumber(record.poll_count, "media generation.poll_count"),
    consecutivePollFailures: expectNumber(
      record.consecutive_poll_failures,
      "media generation.consecutive_poll_failures"
    ),
    outputReferences: record.output_references.map((item) => expectOutputReference(item)),
    outputResourceIds: record.output_resource_ids.map((item) => expectString(item, "media generation.output_resource_ids[]")),
    createdAt: expectNumber(record.created_at, "media generation.created_at"),
    updatedAt: expectNumber(record.updated_at, "media generation.updated_at")
  }
  return withOptionalFields(base, {
    conversation:
      record.conversation === null || record.conversation === undefined
        ? undefined
        : expectConversationRelation(record.conversation),
    externalOperationId: optionalString(record.external_operation_id, "media generation.external_operation_id"),
    providerCheckpoint: record.provider_checkpoint ?? undefined,
    nextPollAt: optionalNumber(record.next_poll_at, "media generation.next_poll_at"),
    lastPollError: record.last_poll_error ?? undefined,
    progress: record.progress ?? undefined,
    error: record.error ?? undefined,
    cancelRequestedAt: optionalNumber(record.cancel_requested_at, "media generation.cancel_requested_at"),
    cancelReason: optionalString(record.cancel_reason, "media generation.cancel_reason"),
    finishedAt: optionalNumber(record.finished_at, "media generation.finished_at")
  })
}

function expectConversationRelation(value: JsonValue) {
  const record = expectRecord(value, "media generation.conversation")
  requireExactKeys(
    record,
    [
      "session_id",
      "turn_id",
      "source_message_id",
      "tool_execution_id",
      "tool_call_id"
    ],
    "media generation.conversation"
  )
  return {
    sessionId: expectString(record.session_id, "media generation.conversation.session_id"),
    turnId: expectString(record.turn_id, "media generation.conversation.turn_id"),
    sourceMessageId: expectString(
      record.source_message_id,
      "media generation.conversation.source_message_id"
    ),
    toolExecutionId: expectString(
      record.tool_execution_id,
      "media generation.conversation.tool_execution_id"
    ),
    toolCallId: expectString(
      record.tool_call_id,
      "media generation.conversation.tool_call_id"
    )
  }
}

function expectRecord(value: JsonValue, label: string): Record<string, JsonValue> {
  if (!isRecord(value)) throw new Error(`${label} must be an object`)
  return value
}

function expectBinding(value: JsonValue): MediaGenerationOperationBinding {
  const record = expectRecord(value, "media generation.binding")
  requireExactKeys(
    record,
    [
      "endpointId",
      "endpointDigest",
      "connection",
      "protocol",
      "model",
      "request",
      "requestDigest"
    ],
    "media generation.binding"
  )
  const modelEndpoint = readModelEndpointExecutionBinding(
    {
      endpointId: record.endpointId!,
      endpointDigest: record.endpointDigest!,
      connection: record.connection!,
      protocol: record.protocol!,
      model: record.model!
    },
    "media generation.binding.modelEndpoint"
  )
  const requestRecord = expectRecord(
    record.request ?? null,
    "media generation.binding.request"
  )
  requireExactKeys(
    requestRecord,
    ["operation", "prompt", "outputModality", "inputResources", "options"],
    "media generation.binding.request"
  )
  const operation = expectMediaGenerationOperation(requestRecord.operation)
  const outputModality = expectMediaGenerationOutputModality(
    requestRecord.outputModality
  )
  const prompt = expectString(
    requestRecord.prompt,
    "media generation.binding.request.prompt"
  )
  if (prompt.trim().length === 0) {
    throw new Error("media generation.binding.request.prompt must not be empty")
  }
  assertOperationOutput(operation, outputModality)
  const inputResources = readResourceInputEvidenceList(
    requestRecord.inputResources,
    "media generation.binding.request.inputResources"
  )
  const inputModalities = [
    "text" as const,
    ...new Set(inputResources.map(resourceInputModality))
  ]
  assertModelSupportsRequirement(
    modelEndpoint.model,
    {
      operation,
      inputModalities,
      outputModalities: [outputModality],
      features: []
    },
    "media generation.binding.modelEndpoint"
  )
  if (
    operation === "image.edit" &&
    !inputModalities.includes("image")
  ) {
    throw new Error("image.edit requires an image input resource")
  }
  const maxInputResources = modelEndpoint.model.limits?.maxInputResources
  if (
    maxInputResources !== undefined &&
    inputResources.length > maxInputResources
  ) {
    throw new Error("media generation input resources exceed model limit")
  }
  const request = {
    operation,
    prompt,
    outputModality,
    inputResources,
    options: requestRecord.options!
  }
  const requestDigest = expectSha256(
    record.requestDigest,
    "media generation.binding.requestDigest"
  )
  if (digestJson(request) !== requestDigest) {
    throw new Error("media generation.binding.requestDigest does not match its content")
  }
  return {
    ...modelEndpoint,
    request,
    requestDigest
  }
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

function expectMediaGenerationOperation(
  value: JsonValue | undefined
): MediaGenerationOperation {
  const operation = expectString(
    value,
    "media generation.binding.request.operation"
  )
  if (
    operation !== "image.generate" &&
    operation !== "image.edit" &&
    operation !== "video.generate" &&
    operation !== "audio.synthesize"
  ) {
    throw new Error(`invalid media generation operation: ${operation}`)
  }
  return operation
}

function expectMediaGenerationOutputModality(
  value: JsonValue | undefined
): MediaGenerationOutputModality {
  const modality = expectString(
    value,
    "media generation.binding.request.outputModality"
  )
  if (modality !== "image" && modality !== "audio" && modality !== "video") {
    throw new Error(`invalid media generation output modality: ${modality}`)
  }
  return modality
}

function assertOperationOutput(
  operation: MediaGenerationOperation,
  outputModality: MediaGenerationOutputModality
): void {
  const expected =
    operation === "video.generate"
      ? "video"
      : operation === "audio.synthesize"
        ? "audio"
        : "image"
  if (outputModality !== expected) {
    throw new Error(`${operation} requires ${expected} output`)
  }
}

function resourceInputModality(resource: {
  readonly kind: string
  readonly mediaType?: string
}): ModelInputModality {
  if (resource.kind === "image") return "image"
  if (resource.kind === "audio") return "audio"
  if (resource.kind === "video") return "video"
  if (resource.kind === "document") return "document"
  if (resource.mediaType?.startsWith("image/")) return "image"
  if (resource.mediaType?.startsWith("audio/")) return "audio"
  if (resource.mediaType?.startsWith("video/")) return "video"
  if (
    resource.mediaType === "application/pdf" ||
    resource.mediaType?.startsWith("text/")
  ) {
    return "document"
  }
  throw new Error("media generation input resource has no supported modality")
}
