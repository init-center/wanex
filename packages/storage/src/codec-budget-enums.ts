import type {
  BudgetGrantRecord,
  BudgetLimit,
  BudgetScopeRecord,
  BudgetUsage,
  JsonValue
} from "@wanex/protocol"
import {
  expectString,
  isRecord,
  optionalNumber,
  withOptionalFields
} from "./codec-common.js"
import type { BudgetAmountWire } from "./generated/storage-rpc.js"

type BudgetAmount = BudgetLimit & BudgetUsage

export function budgetAmountToJson(amount: BudgetAmount): BudgetAmountWire {
  return {
    tokens: amount.tokens ?? null,
    cost_micros: amount.costMicros ?? null,
    wall_time_ms: amount.wallTimeMs ?? null,
    tool_calls: amount.toolCalls ?? null
  }
}

export function expectBudgetAmount(value: unknown, name: string): BudgetAmount {
  if (!isRecord(value)) {
    throw new Error(`${name} must be an object`)
  }
  return withOptionalFields(
    {},
    {
      tokens: optionalNumber(value.tokens, `${name}.tokens`),
      costMicros: optionalNumber(value.cost_micros, `${name}.cost_micros`),
      wallTimeMs: optionalNumber(value.wall_time_ms, `${name}.wall_time_ms`),
      toolCalls: optionalNumber(value.tool_calls, `${name}.tool_calls`)
    }
  )
}

export function expectBudgetScopeKind(value: unknown): BudgetScopeRecord["kind"] {
  const kind = expectString(value, "budget_scope.kind")
  if (
    kind !== "session" &&
    kind !== "turn" &&
    kind !== "team_round" &&
    kind !== "plugin" &&
    kind !== "principal" &&
    kind !== "provider_model"
  ) {
    throw new Error(`invalid budget scope kind: ${kind}`)
  }
  return kind
}

export function expectBudgetWindowKind(
  value: unknown
): BudgetScopeRecord["windowKind"] {
  const kind = expectString(value, "budget_scope.window_kind")
  if (
    kind !== "run" &&
    kind !== "session" &&
    kind !== "day" &&
    kind !== "month"
  ) {
    throw new Error(`invalid budget window kind: ${kind}`)
  }
  return kind
}

export function expectBudgetScopeState(value: unknown): BudgetScopeRecord["state"] {
  const state = expectString(value, "budget_scope.state")
  if (state !== "active" && state !== "closed") {
    throw new Error(`invalid budget scope state: ${state}`)
  }
  return state
}

export function expectBudgetGrantState(value: unknown): BudgetGrantRecord["state"] {
  const state = expectString(value, "budget_grant.state")
  if (
    state !== "reserved" &&
    state !== "committed" &&
    state !== "released" &&
    state !== "denied"
  ) {
    throw new Error(`invalid budget grant state: ${state}`)
  }
  return state
}
