import type {
  MessageId,
  PrincipalId,
  SessionId,
  SessionInputId,
  SessionTurnId
} from "./ids.js"
import type { JsonValue } from "./json.js"
import type { MessagePart } from "./message.js"
import type {
  SubmitSessionTurnReceipt,
  SubmitSessionTurnRequest
} from "./session.js"

export type PlanProposalState =
  | "open"
  | "approved"
  | "rejected"
  | "withdrawn"

export type PlanProposalOperationKind =
  | "revise"
  | "approve"
  | "reject"
  | "withdraw"

export type PlanReferenceKind =
  | "workspace_change_proposal"
  | "delegation_graph"
  | "delegation_graph_node"
  | "team_conversation"
  | "resource"
  | "context_epoch"

export interface PlanProposalStep {
  readonly id: string
  readonly title: string
  readonly detail?: string
  readonly metadata?: JsonValue
}

export interface PlanProposalReference {
  readonly kind: PlanReferenceKind
  readonly id: string
  readonly role?: string
  readonly metadata?: JsonValue
}

export interface PlanProposalContent {
  readonly title: string
  readonly summary: string
  readonly steps: readonly PlanProposalStep[]
  readonly references: readonly PlanProposalReference[]
}

export interface PlanProposalSourceBinding {
  readonly sessionId: SessionId
  readonly headSequence: number
  readonly headMessageId?: MessageId
  readonly headTurnId?: SessionTurnId
  readonly analysisInputDigest: string
  readonly planningRequest: readonly MessagePart[]
}

export interface PlanProposalGenerationBinding {
  readonly endpointId: string
  readonly endpointDigest: string
  readonly protocolId: string
  readonly providerId: string
  readonly modelId: string
  readonly generatedAt: number
  readonly outputDigest: string
  readonly output: readonly MessagePart[]
}

export interface PlanProposalExecutionBinding {
  readonly inputId: SessionInputId
  readonly turnId: SessionTurnId
  readonly jobId: string
  readonly executionBindingDigest: string
  readonly digest: string
  readonly boundAt: number
}

export interface PlanProposalRecord extends PlanProposalContent {
  readonly id: string
  readonly principalId: PrincipalId
  readonly revision: number
  readonly source: PlanProposalSourceBinding
  readonly generation: PlanProposalGenerationBinding
  readonly state: PlanProposalState
  readonly execution?: PlanProposalExecutionBinding
  readonly createdAt: number
  readonly updatedAt: number
  readonly decidedAt?: number
}

export interface PlanProposalActor {
  readonly kind: "human"
  readonly id: PrincipalId
}

export interface PlanProposalOperationRecord {
  readonly id: string
  readonly proposalId: string
  readonly operation: PlanProposalOperationKind
  readonly actor: PlanProposalActor
  readonly fromState: PlanProposalState
  readonly toState: PlanProposalState
  readonly fromRevision: number
  readonly toRevision: number
  readonly content?: PlanProposalContent
  readonly reason?: string
  readonly createdAt: number
}

export interface CreatePlanProposalRequest extends PlanProposalContent {
  readonly id?: string
  readonly principalId: PrincipalId
  readonly source: PlanProposalSourceBinding
  readonly generation: PlanProposalGenerationBinding
  readonly idempotencyKey: string
}

export interface GetPlanProposalRequest {
  readonly proposalId: string
}

export interface ListPlanProposalsRequest {
  readonly principalId?: PrincipalId
  readonly sourceSessionId?: SessionId
  readonly state?: PlanProposalState
  readonly referenceKind?: PlanReferenceKind
  readonly referenceId?: string
  readonly limit?: number
}

export interface RecordPlanProposalOperationRequest {
  readonly id?: string
  readonly proposalId: string
  readonly operation: PlanProposalOperationKind
  readonly expectedRevision: number
  readonly actor: PlanProposalActor
  readonly content?: PlanProposalContent
  readonly reason?: string
  readonly idempotencyKey: string
}

export interface ExecuteApprovedPlanRequest {
  readonly proposalId: string
  readonly expectedRevision: number
  readonly idempotencyKey: string
  readonly turn: SubmitSessionTurnRequest
}

export interface ExecuteApprovedPlanReceipt {
  readonly proposal: PlanProposalRecord
  readonly submission: SubmitSessionTurnReceipt
}

export interface ListPlanProposalOperationsRequest {
  readonly proposalId: string
}
