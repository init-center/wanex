import {
  type BudgetGrantRecord,
  type BudgetScopeRecord,
  type CommitBudgetRequest,
  type JsonValue,
  type RecordBudgetUsageRequest,
  type RecordBudgetUsageReceipt,
  type ReserveBudgetRequest
} from "@wanex/protocol"

import {
  budgetAmountToJson,
  expectBudgetAmount,
  expectBudgetGrantState,
  expectBudgetScopeKind,
  expectBudgetScopeState,
  expectBudgetWindowKind,
  expectNumber,
  expectString,
  isRecord,
  withOptionalFields
} from "./codec-helpers.js"
import type {
  CommitBudgetWire,
  RecordBudgetUsageWire,
  ReserveBudgetWire
} from "./generated/storage-rpc.js"

export function toRpcReserveBudgetRequest(
  request: ReserveBudgetRequest
): ReserveBudgetWire {
  return {
    scope: {
      kind: request.scope.kind,
      owner_id: request.scope.ownerId,
      window_kind: request.scope.windowKind ?? null
    },
    limit: budgetAmountToJson(request.limit),
    requested: budgetAmountToJson(request.requested),
    principal_id: request.principalId,
    reason: request.reason,
    idempotency_key: request.idempotencyKey,
    expires_at: request.expiresAt ?? null
  }
}

export function toRpcCommitBudgetRequest(
  request: CommitBudgetRequest
): CommitBudgetWire {
  return {
    grant_id: request.grantId
  }
}

export function toRpcRecordBudgetUsageRequest(
  request: RecordBudgetUsageRequest
): RecordBudgetUsageWire {
  return {
    grant_id: request.grantId,
    usage: budgetAmountToJson(request.usage),
    source: request.source,
    source_id: request.sourceId,
    idempotency_key: request.idempotencyKey
  }
}

export function fromRpcRecordBudgetUsageReceipt(
  value: JsonValue
): RecordBudgetUsageReceipt {
  if (!isRecord(value) || !isRecord(value.entry)) {
    throw new Error("budget usage receipt must contain an entry")
  }
  return {
    entry: {
      id: expectString(value.entry.id, "budget_usage_entry.id"),
      grantId: expectString(value.entry.grant_id, "budget_usage_entry.grant_id"),
      usage: expectBudgetAmount(value.entry.usage, "budget_usage_entry.usage"),
      source: expectString(value.entry.source, "budget_usage_entry.source"),
      sourceId: expectString(value.entry.source_id, "budget_usage_entry.source_id"),
      idempotencyKey: expectString(
        value.entry.idempotency_key,
        "budget_usage_entry.idempotency_key"
      ),
      createdAt: expectNumber(value.entry.created_at, "budget_usage_entry.created_at")
    },
    created: value.created === true
  }
}

export function fromRpcBudgetScopeRecord(value: JsonValue): BudgetScopeRecord {
  if (!isRecord(value)) {
    throw new Error("budget scope must be an object")
  }
  return {
    id: expectString(value.id, "budget_scope.id"),
    kind: expectBudgetScopeKind(value.kind),
    ownerId: expectString(value.owner_id, "budget_scope.owner_id"),
    limit: expectBudgetAmount(value.limit, "budget_scope.limit"),
    usage: expectBudgetAmount(value.usage, "budget_scope.usage"),
    windowKind: expectBudgetWindowKind(value.window_kind),
    state: expectBudgetScopeState(value.state),
    createdAt: expectNumber(value.created_at, "budget_scope.created_at"),
    updatedAt: expectNumber(value.updated_at, "budget_scope.updated_at")
  }
}

export function fromRpcBudgetGrantRecord(value: JsonValue): BudgetGrantRecord {
  if (!isRecord(value)) {
    throw new Error("budget grant must be an object")
  }
  const record = {
    id: expectString(value.id, "budget_grant.id"),
    scopeId: expectString(value.scope_id, "budget_grant.scope_id"),
    principalId: expectString(value.principal_id, "budget_grant.principal_id"),
    reason: expectString(value.reason, "budget_grant.reason"),
    requested: expectBudgetAmount(value.requested, "budget_grant.requested"),
    state: expectBudgetGrantState(value.state),
    idempotencyKey: expectString(
      value.idempotency_key,
      "budget_grant.idempotency_key"
    ),
    createdAt: expectNumber(value.created_at, "budget_grant.created_at"),
    updatedAt: expectNumber(value.updated_at, "budget_grant.updated_at")
  }
  return withOptionalFields(record, {
    committed:
      value.committed === null || value.committed === undefined
        ? undefined
        : expectBudgetAmount(value.committed, "budget_grant.committed"),
    expiresAt:
      value.expires_at === null || value.expires_at === undefined
        ? undefined
        : expectNumber(value.expires_at, "budget_grant.expires_at")
  })
}
