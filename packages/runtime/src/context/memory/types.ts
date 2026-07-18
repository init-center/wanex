import type { ProviderReplayMessage } from "../../provider/index.js"
import type {
  ContextEpochRecord,
  ContextReplacementRecord as DurableContextReplacementRecord,
  GetActiveContextEpochRequest,
  ListContextReplacementsRequest,
  MessagePart,
  PutContextReplacementRequest,
  SessionId,
  SessionInputRecord,
  SessionMessageRecord
} from "@wanex/protocol"
import type { ContextTokenEstimator } from "./token-estimate.js"

export type ContextReplacementTier = "tier1_snip" | "tier2_placeholder"

export interface ContextMemoryPolicy {
  readonly version: string
  readonly maxInputTokens: number
  readonly recentUserTurns: number
  readonly snipTextOverChars: number
  readonly placeholderTextOverChars: number
  readonly snipHeadChars: number
  readonly snipTailChars: number
}

export interface CompileContextInput {
  readonly sessionId: SessionId
  readonly epochId?: string
  readonly inputs: readonly SessionInputRecord[]
  readonly messages: readonly SessionMessageRecord[]
  readonly policy?: Partial<ContextMemoryPolicy>
  readonly tokenEstimator?: ContextTokenEstimator
}

export interface ContextReplacementRecord {
  readonly id: string
  readonly epochId?: string
  readonly sessionId: SessionId
  readonly policyVersion: string
  readonly messageId?: string
  readonly partId: string
  readonly tier: ContextReplacementTier
  readonly originalTokenEstimate: number
  readonly replacementTokenEstimate: number
  readonly replacement: MessagePart
}

export interface ContextCompileStats {
  readonly tokenEstimateBefore: number
  readonly tokenEstimateAfter: number
  readonly replacementCount: number
}

export interface CompiledContext {
  readonly sessionId: SessionId
  readonly epochId?: string
  readonly policy: ContextMemoryPolicy
  readonly messages: readonly ProviderReplayMessage[]
  readonly replacements: readonly ContextReplacementRecord[]
  readonly stats: ContextCompileStats
}

export interface ContextCompiler {
  compile(input: CompileContextInput): Promise<CompiledContext>
}

export interface DeterministicContextCompilerOptions {
  readonly policy?: Partial<ContextMemoryPolicy>
  readonly replacementStore?: ContextReplacementStore
  readonly tokenEstimator?: ContextTokenEstimator
}

export interface ContextReplacementStore {
  getActiveContextEpoch(
    request: GetActiveContextEpochRequest
  ): Promise<ContextEpochRecord | null>
  listContextReplacements(
    request: ListContextReplacementsRequest
  ): Promise<readonly DurableContextReplacementRecord[]>
  putContextReplacement(
    request: PutContextReplacementRequest
  ): Promise<DurableContextReplacementRecord>
}

export interface ReplaySource {
  readonly role: ProviderReplayMessage["role"]
  readonly content: readonly MessagePart[]
  readonly inputId?: string
  readonly inputStatus?: SessionInputRecord["status"]
  readonly messageId?: string
  readonly createdAt: number
}
