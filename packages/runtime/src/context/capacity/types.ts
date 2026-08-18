import type {
  ModelDescriptor,
  RuntimeAbortSignal
} from "@wanex/protocol"
import type {
  PreparedProviderReplayMessage,
  ProviderToolDefinition
} from "../../provider/index.js"
import type { ContextTokenEstimator } from "../memory/index.js"

export type ContextCapacityStatus = "fits" | "exceeds" | "unknown"

export interface ContextCapacityEstimate {
  readonly replayTokens: number
  readonly toolDefinitionTokens: number
  readonly inputTokens: number
  readonly inputResources: number
  readonly requestedOutputTokens: number
  readonly contextWindowTokens?: number
  readonly maxInputTokens?: number
  readonly maxInputResources?: number
  readonly inputTokenCeiling?: number
  readonly tokenStatus: ContextCapacityStatus
  readonly resourceStatus: ContextCapacityStatus
  readonly decision: "dispatch" | "compact"
  readonly reasons: readonly ContextCapacityReason[]
}

export type ContextCapacityReason =
  | "input_tokens_exceeded"
  | "input_resources_exceeded"

export interface EstimateContextCapacityRequest {
  readonly messages: readonly PreparedProviderReplayMessage[]
  readonly tools: readonly ProviderToolDefinition[]
  readonly model: ModelDescriptor
  readonly maxOutputTokens: number
  readonly tokenEstimator?: ContextTokenEstimator
}

export interface ContextCapacityCompactionRequest {
  readonly sessionId: string
  readonly estimate: ContextCapacityEstimate
  readonly signal: RuntimeAbortSignal | undefined
  readonly heartbeat: () => Promise<void>
}

export interface ContextCapacityCompactionResult {
  readonly status: "compacted" | "skipped"
  readonly reason?: string
}

export type ContextCapacityCompactor = (
  request: ContextCapacityCompactionRequest
) => Promise<ContextCapacityCompactionResult>

export interface ContextCapacityFailureDetail {
  readonly estimate: ContextCapacityEstimate
  readonly compactionAttempted: boolean
  readonly compactionReason?: string
}
