import type { PrincipalId } from "./ids.js"
import type { JsonValue } from "./json.js"

export type PlanProposalState =
  | "open"
  | "approved"
  | "rejected"
  | "withdrawn"
  | "execution_requested"
  | "executed"
  | "execution_failed"

export type PlanProposalOperationKind =
  | "approve"
  | "reject"
  | "withdraw"
  | "request_execution"
  | "mark_executed"
  | "mark_execution_failed"

export type PlanReferenceKind =
  | "session"
  | "session_input"
  | "session_run"
  | "scheduler_job"
  | "workspace_change_proposal"
  | "delegation_graph"
  | "delegation_graph_node"
  | "team_conversation"
  | "resource"
  | "context_epoch"

export interface PlanProposalStep {
  readonly id?: string
  readonly title: string
  readonly detail?: string
  readonly status?: "pending" | "in_progress" | "completed" | "blocked"
  readonly metadata?: JsonValue
}

export interface PlanProposalReference {
  readonly kind: PlanReferenceKind
  readonly id: string
  readonly role?: string
  readonly metadata?: JsonValue
}

export interface PlanProposalRecord {
  readonly id: string
  readonly principalId: PrincipalId
  readonly title?: string
  readonly summary?: string
  readonly steps: readonly PlanProposalStep[]
  readonly references: readonly PlanProposalReference[]
  readonly state: PlanProposalState
  readonly metadata?: JsonValue
  readonly createdAt: number
  readonly updatedAt: number
  readonly closedAt?: number
}

export interface PlanProposalOperationRecord {
  readonly id: string
  readonly proposalId: string
  readonly operation: PlanProposalOperationKind
  readonly actorId: PrincipalId
  readonly fromState: PlanProposalState
  readonly toState: PlanProposalState
  readonly reason?: string
  readonly metadata?: JsonValue
  readonly createdAt: number
}

export interface PutPlanProposalRequest {
  readonly id?: string
  readonly principalId: PrincipalId
  readonly title?: string
  readonly summary?: string
  readonly steps: readonly PlanProposalStep[]
  readonly references?: readonly PlanProposalReference[]
  readonly metadata?: JsonValue
  readonly idempotencyKey?: string
}

export interface GetPlanProposalRequest {
  readonly proposalId: string
}

export interface ListPlanProposalsRequest {
  readonly principalId?: PrincipalId
  readonly state?: PlanProposalState
  readonly referenceKind?: PlanReferenceKind
  readonly referenceId?: string
  readonly limit?: number
}

export interface RecordPlanProposalOperationRequest {
  readonly id?: string
  readonly proposalId: string
  readonly operation: PlanProposalOperationKind
  readonly actorId: PrincipalId
  readonly reason?: string
  readonly metadata?: JsonValue
}

export interface ListPlanProposalOperationsRequest {
  readonly proposalId: string
}
