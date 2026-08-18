import type {
  ContextCompactionEvidence,
  ContextCompactionPlanReason,
  ContextCompactionPolicyOverrides,
  ContextTokenEstimator
} from "../context/memory/index.js"
import type {
  ContextEpochPruneReceipt,
  JsonValue,
  ListSessionsRequest,
  ModelEndpointExecutionBinding,
  SchedulerJobRecord,
  SessionId
} from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"
import type { WanexWorkerOptions } from "../jobs/index.js"
import type { ProviderAdapter } from "../provider/index.js"
import type { SecretResolverPort } from "../secrets/index.js"

export interface MemoryCompactionJobPayload {
  readonly evidence: ContextCompactionEvidence
  readonly metadata?: JsonValue
}

export interface SubmitMemoryCompactionJobRequest {
  readonly id?: string
  readonly principalId: string
  readonly evidence: ContextCompactionEvidence
  readonly metadata?: JsonValue
  readonly scheduledAt?: number
  readonly notBefore?: number
  readonly priority?: number
  readonly idempotencyKey?: string
  readonly budgetGrantId?: string
}

export interface MemoryCompactionJobResult {
  readonly sessionId: SessionId
  readonly epochId: string
  readonly cutSequence: number
  readonly summaryDigest: string
  readonly tokenEstimateBefore: number
  readonly tokenEstimateAfter: number
  readonly metadata?: JsonValue
  readonly prune?: ContextEpochPruneReceipt
}

export interface PlanMemoryCompactionRequest {
  readonly storage: CoreStore
  readonly sessionId: SessionId
  readonly modelEndpoint: ModelEndpointExecutionBinding
  readonly policy?: ContextCompactionPolicyOverrides
  readonly tokenEstimator?: ContextTokenEstimator
}

export interface MemoryCompactionPlan {
  readonly sessionId: SessionId
  readonly decision: "submit" | "skip"
  readonly reason: ContextCompactionPlanReason
  readonly tokenEstimateBefore: number
  readonly projectedTokenEstimateAfter: number
  readonly tokenSavings: number
  readonly evidence?: ContextCompactionEvidence
}

export interface MemoryCompactionHandlerOptions {
  readonly storage: CoreStore
  readonly directProvider?: ProviderAdapter
  readonly secretResolver?: SecretResolverPort
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
  readonly directProvider?: ProviderAdapter
  readonly secretResolver?: SecretResolverPort
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
  readonly resolveModelEndpoint: (
    sessionId: SessionId
  ) => Promise<ModelEndpointExecutionBinding | null>
  readonly policy?: ContextCompactionPolicyOverrides
  readonly tokenEstimator?: ContextTokenEstimator
  readonly metadata?: JsonValue
  readonly priority?: number
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
