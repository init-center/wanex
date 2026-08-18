import type { JsonValue } from "./json.js"
import type { ModelEndpointExecutionBinding } from "./session.js"

export const SESSION_TURN_CONTEXT_CAPACITY_ERROR_KIND =
  "session_turn.context_capacity_exceeded" as const

export type SessionTurnContextCapacityReason =
  | "input_tokens_exceeded"
  | "input_resources_exceeded"

export type SessionTurnContextCapacityError = {
  readonly kind: typeof SESSION_TURN_CONTEXT_CAPACITY_ERROR_KIND
  readonly message: string
  readonly capacity: SessionTurnContextCapacityFailure
}

export type SessionTurnContextCapacityFailure = {
  readonly reasons: readonly SessionTurnContextCapacityReason[]
  readonly inputTokens: number
  readonly inputTokenCeiling?: number
  readonly inputResources: number
  readonly maxInputResources?: number
  readonly requestedOutputTokens: number
  readonly compactionAttempted: boolean
  readonly compactionReason?: string
}

export type ContextEpochState =
  | "building"
  | "active"
  | "superseded"
  | "failed"

export type ContextSummaryGenerationState =
  | "prepared"
  | "dispatched"
  | "output_observed"
  | "succeeded"
  | "failed_before_output"
  | "ambiguous"

export interface ContextSummaryUsage {
  readonly inputTokens?: number
  readonly outputTokens?: number
  readonly reasoningTokens?: number
  readonly cacheReadTokens?: number
  readonly cacheWriteTokens?: number
  readonly metadata?: Readonly<Record<string, JsonValue>>
}

export interface ContextEpochRecord {
  readonly id: string
  readonly sessionId: string
  readonly jobId: string
  readonly state: ContextEpochState
  readonly generationState: ContextSummaryGenerationState
  readonly generationAttempt: number
  readonly maxProviderAttempts: number
  readonly previousEpochId?: string
  readonly previousSummaryDigest?: string
  readonly sourceHeadSequence: number
  readonly sourceHeadMessageId: string
  readonly cutSequence: number
  readonly cutMessageId: string
  readonly retainedFromSequence: number
  readonly retainedFromMessageId: string
  readonly sourceDigest: string
  readonly policy: JsonValue
  readonly policyDigest: string
  readonly modelEndpoint: ModelEndpointExecutionBinding
  readonly requestDigest: string
  readonly summary?: string
  readonly summaryDigest?: string
  readonly usage?: ContextSummaryUsage
  readonly error?: JsonValue
  readonly tokenEstimateBefore: number
  readonly tokenEstimateAfter: number
  readonly tokenSavings: number
  readonly createdAt: number
  readonly activatedAt?: number
  readonly finishedAt?: number
  readonly updatedAt: number
}

export interface BeginContextEpochRequest {
  readonly id: string
  readonly sessionId: string
  readonly jobId: string
  readonly workerId: string
  readonly leaseToken: string
  readonly maxProviderAttempts: number
  readonly previousEpochId?: string
  readonly previousSummaryDigest?: string
  readonly sourceHeadSequence: number
  readonly sourceHeadMessageId: string
  readonly cutSequence: number
  readonly cutMessageId: string
  readonly retainedFromSequence: number
  readonly retainedFromMessageId: string
  readonly sourceDigest: string
  readonly policy: JsonValue
  readonly policyDigest: string
  readonly modelEndpoint: ModelEndpointExecutionBinding
  readonly requestDigest: string
  readonly tokenEstimateBefore: number
}

export interface MarkContextEpochDispatchedRequest {
  readonly epochId: string
  readonly jobId: string
  readonly workerId: string
  readonly leaseToken: string
}

export interface MarkContextEpochOutputObservedRequest {
  readonly epochId: string
  readonly jobId: string
  readonly workerId: string
  readonly leaseToken: string
  readonly generationAttempt: number
}

export type FinishContextEpochGenerationRequest = {
  readonly epochId: string
  readonly jobId: string
  readonly workerId: string
  readonly leaseToken: string
  readonly generationAttempt: number
  readonly summary?: string
  readonly summaryDigest?: string
  readonly usage?: ContextSummaryUsage
  readonly error?: JsonValue
  readonly tokenEstimateAfter?: number
  readonly tokenSavings?: number
} & (
  | { readonly outcome: "succeeded"; readonly retryable?: never }
  | { readonly outcome: "failed_before_output"; readonly retryable: boolean }
  | { readonly outcome: "ambiguous"; readonly retryable?: never }
)

export interface ActivateContextEpochRequest {
  readonly epochId: string
  readonly jobId: string
  readonly workerId: string
  readonly leaseToken: string
  readonly expectedPreviousEpochId?: string
}

export interface PruneContextEpochsRequest {
  readonly sessionId: string
  readonly keepLastSuperseded?: number
  readonly olderThanUpdatedAt?: number
  readonly dryRun?: boolean
}

export interface ContextEpochPruneReceipt {
  readonly sessionId: string
  readonly scannedCount: number
  readonly deletedEpochIds: readonly string[]
  readonly dryRun: boolean
}

export interface ListContextEpochsRequest {
  readonly sessionId: string
  readonly state?: ContextEpochState
}

export interface GetActiveContextEpochRequest {
  readonly sessionId: string
}
