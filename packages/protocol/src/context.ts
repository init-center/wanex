import type { JsonValue } from "./json.js"
import type { MessagePart } from "./message.js"

export type ContextReplacementTier = "tier1_snip" | "tier2_placeholder"
export type ContextEpochState = "building" | "active" | "superseded"

export interface ContextEpochRecord {
  readonly id: string
  readonly sessionId: string
  readonly policyVersion: string
  readonly state: ContextEpochState
  readonly tokenEstimateBefore: number
  readonly tokenEstimateAfter: number
  readonly tokenSavings: number
  readonly replacementCount: number
  readonly metadata?: JsonValue
  readonly createdAt: number
  readonly activatedAt?: number
  readonly updatedAt: number
}

export interface PutContextEpochRequest {
  readonly id?: string
  readonly sessionId: string
  readonly policyVersion: string
  readonly state?: ContextEpochState
  readonly tokenEstimateBefore?: number
  readonly tokenEstimateAfter?: number
  readonly tokenSavings?: number
  readonly replacementCount?: number
  readonly metadata?: JsonValue
}

export interface ActivateContextEpochRequest {
  readonly epochId: string
}

export interface CloneContextEpochRequest {
  readonly sourceEpochId: string
  readonly id?: string
  readonly metadata?: JsonValue
}

export interface PruneContextEpochsRequest {
  readonly sessionId: string
  readonly policyVersion: string
  readonly keepLastSuperseded?: number
  readonly olderThanUpdatedAt?: number
  readonly dryRun?: boolean
}

export interface ContextEpochPruneReceipt {
  readonly sessionId: string
  readonly policyVersion: string
  readonly scannedCount: number
  readonly deletedEpochIds: readonly string[]
  readonly deletedReplacementCount: number
  readonly dryRun: boolean
}

export interface ListContextEpochsRequest {
  readonly sessionId: string
  readonly policyVersion?: string
  readonly state?: ContextEpochState
}

export interface GetActiveContextEpochRequest {
  readonly sessionId: string
  readonly policyVersion: string
}

export interface ContextReplacementRecord {
  readonly id: string
  readonly epochId: string
  readonly sessionId: string
  readonly policyVersion: string
  readonly messageId?: string
  readonly partId: string
  readonly tier: ContextReplacementTier
  readonly originalTokenEstimate: number
  readonly replacementTokenEstimate: number
  readonly replacement: MessagePart
  readonly metadata?: JsonValue
  readonly createdAt: number
  readonly updatedAt: number
}

export interface PutContextReplacementRequest {
  readonly id?: string
  readonly epochId: string
  readonly sessionId: string
  readonly policyVersion: string
  readonly messageId?: string
  readonly partId: string
  readonly tier: ContextReplacementTier
  readonly originalTokenEstimate: number
  readonly replacementTokenEstimate: number
  readonly replacement: MessagePart
  readonly metadata?: JsonValue
}

export interface ListContextReplacementsRequest {
  readonly sessionId: string
  readonly policyVersion?: string
  readonly epochId?: string
}
