import type {
  ActivateContextEpochRequest,
  BeginContextEpochRequest,
  ContextEpochPruneReceipt,
  ContextEpochRecord,
  ContextSummaryGenerationState,
  ContextSummaryUsage,
  FinishContextEpochGenerationRequest,
  GetActiveContextEpochRequest,
  JsonValue,
  ListContextEpochsRequest,
  MarkContextEpochDispatchedRequest,
  MarkContextEpochOutputObservedRequest,
  PruneContextEpochsRequest
} from "@wanex/protocol"
import {
  expectBoolean,
  expectNumber,
  expectString,
  isRecord,
  optionalString,
  toRpcJsonValue,
  toRpcJsonValueFromUnknown,
  withOptionalFields
} from "./codec-helpers.js"
import { expectContextEpochState } from "./codec-context-enums.js"
import { readModelEndpointExecutionBinding } from "./codec-model-evidence.js"
import type {
  ActivateContextEpochWire,
  BeginContextEpochWire,
  ContextEpochMutationIdentityWire,
  FinishContextEpochGenerationWire,
  GetActiveContextEpochWire,
  ListContextEpochsWire,
  MarkContextEpochOutputObservedWire,
  PruneContextEpochsWire
} from "./generated/storage-rpc.js"

export function toRpcBeginContextEpochRequest(
  request: BeginContextEpochRequest
): BeginContextEpochWire {
  return {
    id: request.id,
    session_id: request.sessionId,
    job_id: request.jobId,
    worker_id: request.workerId,
    lease_token: request.leaseToken,
    max_provider_attempts: request.maxProviderAttempts,
    previous_epoch_id: request.previousEpochId ?? null,
    previous_summary_digest: request.previousSummaryDigest ?? null,
    source_head_sequence: request.sourceHeadSequence,
    source_head_message_id: request.sourceHeadMessageId,
    cut_sequence: request.cutSequence,
    cut_message_id: request.cutMessageId,
    retained_from_sequence: request.retainedFromSequence,
    retained_from_message_id: request.retainedFromMessageId,
    source_digest: request.sourceDigest,
    policy: toRpcJsonValue(request.policy),
    policy_digest: request.policyDigest,
    model_endpoint: toRpcJsonValueFromUnknown(request.modelEndpoint),
    request_digest: request.requestDigest,
    token_estimate_before: request.tokenEstimateBefore
  }
}

export function toRpcMarkContextEpochDispatchedRequest(
  request: MarkContextEpochDispatchedRequest
): ContextEpochMutationIdentityWire {
  return mutationIdentity(request)
}

export function toRpcMarkContextEpochOutputObservedRequest(
  request: MarkContextEpochOutputObservedRequest
): MarkContextEpochOutputObservedWire {
  return {
    ...mutationIdentity(request),
    generation_attempt: request.generationAttempt
  }
}

export function toRpcFinishContextEpochGenerationRequest(
  request: FinishContextEpochGenerationRequest
): FinishContextEpochGenerationWire {
  return {
    ...mutationIdentity(request),
    generation_attempt: request.generationAttempt,
    outcome: request.outcome,
    retryable: request.outcome === "failed_before_output" ? request.retryable : null,
    summary: request.summary ?? null,
    summary_digest: request.summaryDigest ?? null,
    usage: toRpcJsonValueFromUnknown(request.usage ?? null),
    error: toRpcJsonValue(request.error ?? null),
    token_estimate_after: request.tokenEstimateAfter ?? null,
    token_savings: request.tokenSavings ?? null
  }
}

export function toRpcActivateContextEpochRequest(
  request: ActivateContextEpochRequest
): ActivateContextEpochWire {
  return {
    ...mutationIdentity(request),
    expected_previous_epoch_id: request.expectedPreviousEpochId ?? null
  }
}

export function toRpcPruneContextEpochsRequest(
  request: PruneContextEpochsRequest
): PruneContextEpochsWire {
  return {
    session_id: request.sessionId,
    keep_last_superseded: request.keepLastSuperseded ?? null,
    older_than_updated_at: request.olderThanUpdatedAt ?? null,
    dry_run: request.dryRun ?? null
  }
}

export function toRpcListContextEpochsRequest(
  request: ListContextEpochsRequest
): ListContextEpochsWire {
  return {
    session_id: request.sessionId,
    state: request.state ?? null
  }
}

export function toRpcGetActiveContextEpochRequest(
  request: GetActiveContextEpochRequest
): GetActiveContextEpochWire {
  return { session_id: request.sessionId }
}

export function fromRpcContextEpochRecord(value: JsonValue): ContextEpochRecord {
  if (!isRecord(value)) {
    throw new Error("context epoch must be an object")
  }
  const record = {
    id: expectString(value.id, "context_epoch.id"),
    sessionId: expectString(value.session_id, "context_epoch.session_id"),
    jobId: expectString(value.job_id, "context_epoch.job_id"),
    state: expectContextEpochState(value.state),
    generationState: expectGenerationState(value.generation_state),
    generationAttempt: expectNumber(
      value.generation_attempt,
      "context_epoch.generation_attempt"
    ),
    maxProviderAttempts: expectNumber(
      value.max_provider_attempts,
      "context_epoch.max_provider_attempts"
    ),
    sourceHeadSequence: expectNumber(
      value.source_head_sequence,
      "context_epoch.source_head_sequence"
    ),
    sourceHeadMessageId: expectString(
      value.source_head_message_id,
      "context_epoch.source_head_message_id"
    ),
    cutSequence: expectNumber(value.cut_sequence, "context_epoch.cut_sequence"),
    cutMessageId: expectString(
      value.cut_message_id,
      "context_epoch.cut_message_id"
    ),
    retainedFromSequence: expectNumber(
      value.retained_from_sequence,
      "context_epoch.retained_from_sequence"
    ),
    retainedFromMessageId: expectString(
      value.retained_from_message_id,
      "context_epoch.retained_from_message_id"
    ),
    sourceDigest: expectString(value.source_digest, "context_epoch.source_digest"),
    policy: value.policy ?? null,
    policyDigest: expectString(value.policy_digest, "context_epoch.policy_digest"),
    modelEndpoint: readModelEndpointExecutionBinding(
      value.model_endpoint,
      "context_epoch.model_endpoint"
    ),
    requestDigest: expectString(
      value.request_digest,
      "context_epoch.request_digest"
    ),
    tokenEstimateBefore: expectNumber(
      value.token_estimate_before,
      "context_epoch.token_estimate_before"
    ),
    tokenEstimateAfter: expectNumber(
      value.token_estimate_after,
      "context_epoch.token_estimate_after"
    ),
    tokenSavings: expectNumber(value.token_savings, "context_epoch.token_savings"),
    createdAt: expectNumber(value.created_at, "context_epoch.created_at"),
    updatedAt: expectNumber(value.updated_at, "context_epoch.updated_at")
  }
  return withOptionalFields(record, {
    previousEpochId: optionalString(
      value.previous_epoch_id,
      "context_epoch.previous_epoch_id"
    ),
    previousSummaryDigest: optionalString(
      value.previous_summary_digest,
      "context_epoch.previous_summary_digest"
    ),
    summary: optionalString(value.summary, "context_epoch.summary"),
    summaryDigest: optionalString(
      value.summary_digest,
      "context_epoch.summary_digest"
    ),
    usage: contextSummaryUsage(value.usage),
    error: value.error ?? undefined,
    activatedAt: optionalNumber(value.activated_at, "context_epoch.activated_at"),
    finishedAt: optionalNumber(value.finished_at, "context_epoch.finished_at")
  })
}

export function fromRpcContextEpochPruneReceipt(
  value: JsonValue
): ContextEpochPruneReceipt {
  if (!isRecord(value)) {
    throw new Error("context epoch prune receipt must be an object")
  }
  if (!Array.isArray(value.deleted_epoch_ids)) {
    throw new Error("context_epoch_prune.deleted_epoch_ids must be an array")
  }
  return {
    sessionId: expectString(value.session_id, "context_epoch_prune.session_id"),
    scannedCount: expectNumber(
      value.scanned_count,
      "context_epoch_prune.scanned_count"
    ),
    deletedEpochIds: value.deleted_epoch_ids.map((item) =>
      expectString(item, "context_epoch_prune.deleted_epoch_ids[]")
    ),
    dryRun: expectBoolean(value.dry_run, "context_epoch_prune.dry_run")
  }
}

function mutationIdentity(request: {
  readonly epochId: string
  readonly jobId: string
  readonly workerId: string
  readonly leaseToken: string
}): ContextEpochMutationIdentityWire {
  return {
    epoch_id: request.epochId,
    job_id: request.jobId,
    worker_id: request.workerId,
    lease_token: request.leaseToken
  }
}

function expectGenerationState(value: JsonValue | undefined): ContextSummaryGenerationState {
  if (
    value !== "prepared" &&
    value !== "dispatched" &&
    value !== "output_observed" &&
    value !== "succeeded" &&
    value !== "failed_before_output" &&
    value !== "ambiguous"
  ) {
    throw new Error(`invalid context summary generation state: ${String(value)}`)
  }
  return value
}

function contextSummaryUsage(value: JsonValue | undefined): ContextSummaryUsage | undefined {
  if (value === undefined || value === null) return undefined
  if (!isRecord(value)) throw new Error("context_epoch.usage must be an object")
  return {
    ...optionalUsageNumber(value, "inputTokens"),
    ...optionalUsageNumber(value, "outputTokens"),
    ...optionalUsageNumber(value, "reasoningTokens"),
    ...optionalUsageNumber(value, "cacheReadTokens"),
    ...optionalUsageNumber(value, "cacheWriteTokens"),
    ...(value.metadata === undefined
      ? {}
      : {
          metadata: isRecord(value.metadata)
            ? value.metadata
            : invalidUsageMetadata()
        })
  }
}

function optionalUsageNumber(
  value: Readonly<Record<string, JsonValue>>,
  key: keyof Omit<ContextSummaryUsage, "metadata">
): Partial<ContextSummaryUsage> {
  if (value[key] === undefined) return {}
  const parsed = expectNumber(value[key], `context_epoch.usage.${key}`)
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`context_epoch.usage.${key} must be a non-negative integer`)
  }
  return { [key]: parsed }
}

function invalidUsageMetadata(): never {
  throw new Error("context_epoch.usage.metadata must be an object")
}

function optionalNumber(value: JsonValue | undefined, label: string): number | undefined {
  return value === null || value === undefined ? undefined : expectNumber(value, label)
}
