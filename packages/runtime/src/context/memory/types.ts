import type {
  ContextEpochRecord,
  GetActiveContextEpochRequest,
  JsonValue,
  ModelEndpointExecutionBinding,
  SessionInputRecord,
  SessionMessageRecord,
  SessionTurnRecord
} from "@wanex/protocol"
import type {
  PreparedProviderReplayMessage,
  ProviderReplayMessage
} from "../../provider/index.js"
import type { ContextTokenEstimator } from "./token-estimate.js"

export interface ContextCompactionPolicy {
  readonly algorithm: "semantic-summary"
  readonly modelContextWindowTokens: number
  readonly modelMaxInputTokens?: number
  readonly waterlineTokens: number
  readonly keepRecentTokens: number
  readonly minimumRecentTurns: number
  readonly maxSummaryOutputTokens: number
  readonly maxSerializedToolResultChars: number
  readonly minimumTokenSavings: number
  readonly maxProviderAttempts: number
}

export interface ContextCompactionPolicyOverrides {
  readonly reserveInputTokens?: number
  readonly keepRecentTokens?: number
  readonly minimumRecentTurns?: number
  readonly maxSummaryOutputTokens?: number
  readonly maxSerializedToolResultChars?: number
  readonly minimumTokenSavings?: number
  readonly maxProviderAttempts?: number
}

export interface CompileContextInput {
  readonly sessionId: string
  readonly epochId?: string
  readonly inputs: readonly SessionInputRecord[]
  readonly messages: readonly SessionMessageRecord[]
  readonly tokenEstimator?: ContextTokenEstimator
}

export interface ContextCompileStats {
  readonly tokenEstimateBefore: number
  readonly tokenEstimateAfter: number
  readonly summarizedThroughSequence?: number
}

export interface CompiledContext {
  readonly sessionId: string
  readonly epochId?: string
  readonly messages: readonly ProviderReplayMessage[]
  readonly stats: ContextCompileStats
}

export interface ContextCompiler {
  compile(input: CompileContextInput): Promise<CompiledContext>
}

export interface SemanticContextCompilerOptions {
  readonly epochStore: ContextEpochStore
  readonly tokenEstimator?: ContextTokenEstimator
}

export interface ContextEpochStore {
  getActiveContextEpoch(
    request: GetActiveContextEpochRequest
  ): Promise<ContextEpochRecord | null>
}

export type ContextCompactionPlanReason =
  | "above_waterline"
  | "below_waterline"
  | "model_limit_unknown"
  | "no_compactable_turns"
  | "unsafe_turn_boundary"
  | "summary_input_too_large"
  | "insufficient_savings"
  | "retained_tail_too_large"

export interface ContextCompactionEvidence {
  readonly sessionId: string
  readonly previousEpochId?: string
  readonly previousSummaryDigest?: string
  readonly sourceHeadSequence: number
  readonly sourceHeadMessageId: string
  readonly cutSequence: number
  readonly cutMessageId: string
  readonly retainedFromSequence: number
  readonly retainedFromMessageId: string
  readonly sourceDigest: string
  readonly policy: ContextCompactionPolicy
  readonly policyDigest: string
  readonly modelEndpoint: ModelEndpointExecutionBinding
  readonly requestDigest: string
  readonly tokenEstimateBefore: number
  readonly projectedTokenEstimateAfter: number
}

export interface PreparedContextCompaction {
  readonly decision: "submit" | "skip"
  readonly reason: ContextCompactionPlanReason
  readonly policy?: ContextCompactionPolicy
  readonly tokenEstimateBefore: number
  readonly projectedTokenEstimateAfter: number
  readonly tokenSavings: number
  readonly evidence?: ContextCompactionEvidence
  readonly providerMessages?: readonly ProviderReplayMessage[]
}

export interface PrepareContextCompactionInput {
  readonly sessionId: string
  readonly messages: readonly SessionMessageRecord[]
  readonly turns: readonly SessionTurnRecord[]
  readonly activeEpoch: ContextEpochRecord | null
  readonly modelEndpoint: ModelEndpointExecutionBinding
  readonly policy?: ContextCompactionPolicyOverrides
  readonly tokenEstimator?: ContextTokenEstimator
}

export interface ReconstructContextCompactionInput {
  readonly evidence: ContextCompactionEvidence
  readonly messages: readonly SessionMessageRecord[]
  readonly activeEpoch: ContextEpochRecord | null
  readonly tokenEstimator?: ContextTokenEstimator
}

export interface SerializedContextSource {
  readonly text: string
  readonly sourceDigest: string
  readonly requestDigest: string
  readonly providerMessages: readonly PreparedProviderReplayMessage[]
  readonly tokenEstimate: number
}

export interface ContextSummaryProviderRequest {
  readonly messages: readonly PreparedProviderReplayMessage[]
  readonly maxOutputTokens: number
  readonly tools?: never
  readonly toolChoice?: never
}

export interface ContextCompactionPolicyJson extends Readonly<Record<string, JsonValue>> {
  readonly algorithm: "semantic-summary"
}
