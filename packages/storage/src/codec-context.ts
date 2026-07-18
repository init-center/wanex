import {
  type ActivateContextEpochRequest,
  type CloneContextEpochRequest,
  type ContextEpochPruneReceipt,
  type ContextEpochRecord,
  type GetActiveContextEpochRequest,
  type ListContextEpochsRequest,
  type ContextReplacementRecord,
  type JsonValue,
  type ListContextReplacementsRequest,
  type PruneContextEpochsRequest,
  type PutContextEpochRequest,
  type PutContextReplacementRequest
} from "@wanex/protocol"

import {
  expectNumber,
  expectBoolean,
  expectString,
  isRecord,
  messagePartFromJson,
  optionalString,
  toRpcJsonValue,
  toRpcJsonValueFromUnknown,
  withOptionalFields
} from "./codec-helpers.js"
import {
  expectContextEpochState,
  expectContextReplacementTier
} from "./codec-context-enums.js"
import type {
  ActivateContextEpochWire,
  CloneContextEpochWire,
  GetActiveContextEpochWire,
  ListContextEpochsWire,
  ListContextReplacementsWire,
  PruneContextEpochsWire,
  PutContextEpochWire,
  PutContextReplacementWire
} from "./generated/storage-rpc.js"

export function toRpcPutContextEpochRequest(
  request: PutContextEpochRequest
): PutContextEpochWire {
  return {
    id: request.id ?? null,
    session_id: request.sessionId,
    policy_version: request.policyVersion,
    state: request.state ?? null,
    token_estimate_before: request.tokenEstimateBefore ?? null,
    token_estimate_after: request.tokenEstimateAfter ?? null,
    token_savings: request.tokenSavings ?? null,
    replacement_count: request.replacementCount ?? null,
    metadata: toRpcJsonValue(request.metadata ?? null)
  }
}

export function toRpcActivateContextEpochRequest(
  request: ActivateContextEpochRequest
): ActivateContextEpochWire {
  return {
    epoch_id: request.epochId
  }
}

export function toRpcCloneContextEpochRequest(
  request: CloneContextEpochRequest
): CloneContextEpochWire {
  return {
    source_epoch_id: request.sourceEpochId,
    id: request.id ?? null,
    metadata: toRpcJsonValue(request.metadata ?? null)
  }
}

export function toRpcPruneContextEpochsRequest(
  request: PruneContextEpochsRequest
): PruneContextEpochsWire {
  return {
    session_id: request.sessionId,
    policy_version: request.policyVersion,
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
    policy_version: request.policyVersion ?? null,
    state: request.state ?? null
  }
}

export function toRpcGetActiveContextEpochRequest(
  request: GetActiveContextEpochRequest
): GetActiveContextEpochWire {
  return {
    session_id: request.sessionId,
    policy_version: request.policyVersion
  }
}

export function toRpcPutContextReplacementRequest(
  request: PutContextReplacementRequest
): PutContextReplacementWire {
  return {
    id: request.id ?? null,
    epoch_id: request.epochId,
    session_id: request.sessionId,
    policy_version: request.policyVersion,
    message_id: request.messageId ?? null,
    part_id: request.partId,
    tier: request.tier,
    original_token_estimate: request.originalTokenEstimate,
    replacement_token_estimate: request.replacementTokenEstimate,
    replacement: toRpcJsonValueFromUnknown(request.replacement),
    metadata: toRpcJsonValue(request.metadata ?? null)
  }
}

export function toRpcListContextReplacementsRequest(
  request: ListContextReplacementsRequest
): ListContextReplacementsWire {
  return {
    session_id: request.sessionId,
    policy_version: request.policyVersion ?? null,
    epoch_id: request.epochId ?? null
  }
}

export function fromRpcContextEpochRecord(value: JsonValue): ContextEpochRecord {
  if (!isRecord(value)) {
    throw new Error("context epoch must be an object")
  }
  const record = {
    id: expectString(value.id, "context_epoch.id"),
    sessionId: expectString(value.session_id, "context_epoch.session_id"),
    policyVersion: expectString(
      value.policy_version,
      "context_epoch.policy_version"
    ),
    state: expectContextEpochState(value.state),
    tokenEstimateBefore: expectNumber(
      value.token_estimate_before,
      "context_epoch.token_estimate_before"
    ),
    tokenEstimateAfter: expectNumber(
      value.token_estimate_after,
      "context_epoch.token_estimate_after"
    ),
    tokenSavings: expectNumber(
      value.token_savings,
      "context_epoch.token_savings"
    ),
    replacementCount: expectNumber(
      value.replacement_count,
      "context_epoch.replacement_count"
    ),
    createdAt: expectNumber(value.created_at, "context_epoch.created_at"),
    updatedAt: expectNumber(value.updated_at, "context_epoch.updated_at")
  }
  return withOptionalFields(record, {
    metadata: value.metadata ?? undefined,
    activatedAt:
      value.activated_at === null || value.activated_at === undefined
        ? undefined
        : expectNumber(value.activated_at, "context_epoch.activated_at")
  })
}

export function fromRpcContextEpochPruneReceipt(
  value: JsonValue
): ContextEpochPruneReceipt {
  if (!isRecord(value)) {
    throw new Error("context epoch prune receipt must be an object")
  }
  const deletedEpochIds = value.deleted_epoch_ids
  if (!Array.isArray(deletedEpochIds)) {
    throw new Error("context_epoch_prune.deleted_epoch_ids must be an array")
  }
  return {
    sessionId: expectString(value.session_id, "context_epoch_prune.session_id"),
    policyVersion: expectString(
      value.policy_version,
      "context_epoch_prune.policy_version"
    ),
    scannedCount: expectNumber(
      value.scanned_count,
      "context_epoch_prune.scanned_count"
    ),
    deletedEpochIds: deletedEpochIds.map((item) =>
      expectString(item, "context_epoch_prune.deleted_epoch_ids[]")
    ),
    deletedReplacementCount: expectNumber(
      value.deleted_replacement_count,
      "context_epoch_prune.deleted_replacement_count"
    ),
    dryRun: expectBoolean(value.dry_run, "context_epoch_prune.dry_run")
  }
}

export function fromRpcContextReplacementRecord(
  value: JsonValue
): ContextReplacementRecord {
  if (!isRecord(value)) {
    throw new Error("context replacement must be an object")
  }
  const record = {
    id: expectString(value.id, "context_replacement.id"),
    epochId: expectString(value.epoch_id, "context_replacement.epoch_id"),
    sessionId: expectString(value.session_id, "context_replacement.session_id"),
    policyVersion: expectString(
      value.policy_version,
      "context_replacement.policy_version"
    ),
    partId: expectString(value.part_id, "context_replacement.part_id"),
    tier: expectContextReplacementTier(value.tier),
    originalTokenEstimate: expectNumber(
      value.original_token_estimate,
      "context_replacement.original_token_estimate"
    ),
    replacementTokenEstimate: expectNumber(
      value.replacement_token_estimate,
      "context_replacement.replacement_token_estimate"
    ),
    replacement: messagePartFromJson(value.replacement),
    createdAt: expectNumber(value.created_at, "context_replacement.created_at"),
    updatedAt: expectNumber(value.updated_at, "context_replacement.updated_at")
  }
  return withOptionalFields(record, {
    messageId: optionalString(
      value.message_id,
      "context_replacement.message_id"
    ),
    metadata: value.metadata ?? undefined
  })
}
