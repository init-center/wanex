import type {
  ContextMemoryPolicy,
  ContextTokenEstimator
} from "../context/memory/index.js"
import type {
  ContextEpochPruneReceipt,
  EnqueueJobRequest,
  JsonValue,
  ListSessionsRequest,
  SchedulerJobRecord,
  SessionId
} from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"
import type { WanexWorkerOptions } from "../jobs/index.js"

export interface MemoryCompactionJobPayload {
  readonly sessionId: SessionId
  readonly policy?: Partial<ContextMemoryPolicy>
  readonly metadata?: JsonValue
}

export interface SubmitMemoryCompactionJobRequest {
  readonly id?: string
  readonly principalId: string
  readonly sessionId: SessionId
  readonly policy?: Partial<ContextMemoryPolicy>
  readonly metadata?: JsonValue
  readonly scheduledAt?: number
  readonly notBefore?: number
  readonly priority?: number
  readonly maxAttempts?: number
  readonly retryPolicy?: EnqueueJobRequest["retryPolicy"]
  readonly idempotencyKey?: string
  readonly budgetGrantId?: string
}

export interface MemoryCompactionJobResult {
  readonly sessionId: SessionId
  readonly epochId: string
  readonly policyVersion: string
  readonly tokenEstimateBefore: number
  readonly tokenEstimateAfter: number
  readonly replacementCount: number
  readonly replacementIds: readonly string[]
  readonly metadata?: JsonValue
  readonly prune?: ContextEpochPruneReceipt
}

export type MemoryCompactionPlanDecision = "submit" | "skip"

export type MemoryCompactionPlanReason =
  | "above_waterline"
  | "below_waterline"
  | "no_replacements"
  | "insufficient_savings"

export interface PlanMemoryCompactionRequest {
  readonly storage: CoreStore
  readonly sessionId: SessionId
  readonly policy?: Partial<ContextMemoryPolicy>
  readonly waterlineTokens?: number
  readonly minimumTokenSavings?: number
  readonly tokenEstimator?: ContextTokenEstimator
}

export interface MemoryCompactionPlan {
  readonly sessionId: SessionId
  readonly policyVersion: string
  readonly decision: MemoryCompactionPlanDecision
  readonly reason: MemoryCompactionPlanReason
  readonly waterlineTokens: number
  readonly minimumTokenSavings: number
  readonly tokenEstimateBefore: number
  readonly tokenEstimateAfter: number
  readonly tokenSavings: number
  readonly replacementCount: number
}

export interface MemoryCompactionHandlerOptions {
  readonly storage: CoreStore
  readonly policy?: Partial<ContextMemoryPolicy>
  readonly tokenEstimator?: ContextTokenEstimator
  readonly retention?: MemoryCompactionRetentionPolicy
  readonly now?: () => number
}

export interface CreateMemoryCompactionWorkerOptions
  extends Pick<
    WanexWorkerOptions,
    "workerId" | "heartbeatIntervalMs" | "timeoutMs"
  > {
  readonly leaseMs?: number
  readonly storage: CoreStore
  readonly policy?: Partial<ContextMemoryPolicy>
  readonly tokenEstimator?: ContextTokenEstimator
  readonly retention?: MemoryCompactionRetentionPolicy
  readonly now?: () => number
}

export interface MemoryCompactionRetentionPolicy {
  readonly keepLastSuperseded?: number
  readonly olderThanUpdatedAt?: number
  readonly dryRun?: boolean
}

export interface SweepMemoryCompactionRequest {
  readonly storage: CoreStore
  readonly principalId: string
  readonly sessions?: ListSessionsRequest
  readonly policy?: Partial<ContextMemoryPolicy>
  readonly waterlineTokens?: number
  readonly minimumTokenSavings?: number
  readonly tokenEstimator?: ContextTokenEstimator
  readonly metadata?: JsonValue
  readonly priority?: number
  readonly maxAttempts?: number
  readonly retryPolicy?: EnqueueJobRequest["retryPolicy"]
  readonly budgetGrantId?: string
  readonly idempotencyKeyPrefix?: string
}

export interface MemoryCompactionSweepReceipt {
  readonly scannedSessionIds: readonly SessionId[]
  readonly plans: readonly MemoryCompactionPlan[]
  readonly submittedJobs: readonly SchedulerJobRecord[]
  readonly skippedPlans: readonly MemoryCompactionPlan[]
  readonly idempotencyKeyPrefix: string
}
