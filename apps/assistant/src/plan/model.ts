import type {
  PlanProposalReference,
  PlanProposalState,
  PlanProposalStep
} from "@wanex/protocol"
import type { BackendSafeError } from "@wanex/assistant/backend"
import type { ReadTrackedConversationOperationResult } from "../conversation/model.js"

export type PlanGenerationState =
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"

export interface StartPlanGenerationRequest {
  readonly text: string
  readonly sessionId?: string
  readonly idempotencyKey?: string
  readonly maxOutputTokens?: number
}

export interface PlanGenerationReference {
  readonly operationId: string
}

export interface PlanGenerationReadModel {
  readonly kind: "assistant.plan-generation"
  readonly operationId: string
  readonly sessionId: string
  readonly state: PlanGenerationState
  readonly proposalId?: string
  readonly error?: BackendSafeError
  readonly startedAt: number
  readonly updatedAt: number
  readonly finishedAt?: number
}

export type ReadPlanGenerationResult =
  | {
      readonly kind: "assistant.plan-generation.found"
      readonly generation: PlanGenerationReadModel
    }
  | {
      readonly kind: "assistant.plan-generation.missing"
      readonly operationId: string
    }

export interface DismissPlanGenerationResult {
  readonly kind: "assistant.plan-generation.dismissed"
  readonly operationId: string
}

export interface SelectPlanProposalRequest {
  readonly proposalId: string
}

export interface ReadPlanProposalRequest {
  readonly proposalId?: string
}

export interface ListPlanProposalsRequest {
  readonly sessionId?: string
  readonly limit?: number
}

export interface RevisePlanProposalRequest {
  readonly proposalId?: string
  readonly expectedRevision: number
  readonly title: string
  readonly summary: string
  readonly steps: readonly PlanProposalStep[]
  readonly references?: readonly PlanProposalReference[]
  readonly reason?: string
  readonly idempotencyKey?: string
}

export interface DecidePlanProposalRequest {
  readonly proposalId?: string
  readonly expectedRevision: number
  readonly decision: "approve" | "reject" | "withdraw"
  readonly reason?: string
  readonly idempotencyKey?: string
}

export interface ExecutePlanProposalRequest {
  readonly proposalId?: string
  readonly expectedRevision: number
  readonly idempotencyKey?: string
  readonly maxSteps?: number
}

export interface PlanProposalReadModel {
  readonly kind: "assistant.plan-proposal"
  readonly proposalId: string
  readonly revision: number
  readonly state: PlanProposalState
  readonly title: string
  readonly summary: string
  readonly steps: readonly PlanProposalStep[]
  readonly references: readonly PlanProposalReference[]
  readonly source: {
    readonly sessionId: string
    readonly headSequence: number
  }
  readonly generation: {
    readonly endpointId: string
    readonly providerId: string
    readonly modelId: string
    readonly generatedAt: number
  }
  readonly execution?: PlanExecutionReadModel
  readonly createdAt: number
  readonly updatedAt: number
  readonly decidedAt?: number
}

export interface PlanExecutionReadModel {
  readonly inputId: string
  readonly turnId: string
  readonly jobId: string
  readonly inputState: string
  readonly turnState: string
  readonly jobState: string
  readonly boundAt: number
}

export type ReadPlanProposalResult =
  | {
      readonly kind: "assistant.plan-proposal.found"
      readonly proposal: PlanProposalReadModel
    }
  | {
      readonly kind: "assistant.plan-proposal.missing"
      readonly proposalId: string
    }
  | {
      readonly kind: "assistant.plan-proposal.no-selection"
    }

export interface PlanProposalListReadModel {
  readonly kind: "assistant.plan-proposal-list"
  readonly sessionId: string
  readonly proposals: readonly PlanProposalReadModel[]
}

export interface ExecutePlanProposalResult {
  readonly kind: "assistant.plan-execution.submitted"
  readonly proposal: PlanProposalReadModel
  readonly operation: ReadTrackedConversationOperationResult
}

export type PlanInvalidationCause =
  | "generation_started"
  | "generation_succeeded"
  | "generation_failed"
  | "generation_cancelled"
  | "generation_dismissed"
  | "selection_changed"
  | "proposal_changed"
  | "execution_submitted"

export interface PlanInvalidatedEvent {
  readonly kind: "assistant.plan.invalidated"
  readonly sequence: number
  readonly at: number
  readonly cause: PlanInvalidationCause
  readonly sessionId?: string
  readonly operationId?: string
  readonly proposalId?: string
}

export type PlanEventListener = (
  event: PlanInvalidatedEvent
) => void

export type PlanEventUnsubscribe = () => void

export interface PlanEvents {
  subscribePlanEvents(
    listener: PlanEventListener
  ): PlanEventUnsubscribe
}
