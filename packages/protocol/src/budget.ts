import type { PrincipalId } from "./ids.js"

export type BudgetScopeKind =
  | "session"
  | "turn"
  | "objective"
  | "team_round"
  | "plugin"
  | "principal"
  | "provider_model"

export type BudgetGrantState =
  | "reserved"
  | "committed"
  | "released"
  | "denied"

export interface BudgetLimit {
  readonly tokens?: number
  readonly costMicros?: number
  readonly wallTimeMs?: number
  readonly toolCalls?: number
}

export interface BudgetUsage {
  readonly tokens?: number
  readonly costMicros?: number
  readonly wallTimeMs?: number
  readonly toolCalls?: number
}

export interface BudgetScopeRef {
  readonly kind: BudgetScopeKind
  readonly ownerId: string
  readonly windowKind?: "run" | "session" | "day" | "month"
}

export interface BudgetScopeRecord {
  readonly id: string
  readonly kind: BudgetScopeKind
  readonly ownerId: string
  readonly limit: BudgetLimit
  readonly usage: BudgetUsage
  readonly windowKind: "run" | "session" | "day" | "month"
  readonly state: "active" | "closed"
  readonly createdAt: number
  readonly updatedAt: number
}

export interface ReserveBudgetRequest {
  readonly scope: BudgetScopeRef
  readonly limit: BudgetLimit
  readonly requested: BudgetUsage
  readonly principalId: PrincipalId
  readonly reason: string
  readonly idempotencyKey: string
  readonly expiresAt?: number
}

export interface BudgetGrantRecord {
  readonly id: string
  readonly scopeId: string
  readonly principalId: PrincipalId
  readonly reason: string
  readonly requested: BudgetUsage
  readonly committed?: BudgetUsage
  readonly state: BudgetGrantState
  readonly idempotencyKey: string
  readonly expiresAt?: number
  readonly createdAt: number
  readonly updatedAt: number
}

export interface CommitBudgetRequest {
  readonly grantId: string
}

export interface RecordBudgetUsageRequest {
  readonly grantId: string
  readonly usage: BudgetUsage
  readonly source: string
  readonly sourceId: string
  readonly idempotencyKey: string
}

export interface BudgetUsageEntryRecord extends RecordBudgetUsageRequest {
  readonly id: string
  readonly createdAt: number
}

export interface RecordBudgetUsageReceipt {
  readonly entry: BudgetUsageEntryRecord
  readonly created: boolean
}

export interface ReleaseBudgetRequest {
  readonly grantId: string
}
