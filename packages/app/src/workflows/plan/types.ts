import type {
  MessagePart,
  PlanProposalContent,
  PlanProposalOperationRecord,
  PlanProposalRecord,
  PlanProposalReference,
  PlanProposalState,
  PrincipalId,
  RuntimeAbortSignal,
  SchedulerJobRecord,
  SessionInputRecord,
  SessionTurnRecord
} from "@wanex/protocol"
import type {
  PreparedUserTurn,
  RuntimeHostEphemeralQueryRequest,
  RuntimeHostEphemeralQueryResult,
  SubmitUserTurnRequest
} from "@wanex/runtime/host"
import type { CoreStore } from "@wanex/storage"
import type { PlanStore } from "@wanex/storage/plan"

export const WANEX_APP_PLAN_WORKFLOW = "wanex-app-plan-workflow" as const

export interface PlanWorkflowRuntimePort {
  runEphemeralQuery(
    request: RuntimeHostEphemeralQueryRequest
  ): Promise<RuntimeHostEphemeralQueryResult>
  prepareUserTurn(request: SubmitUserTurnRequest): Promise<PreparedUserTurn>
  wake(): void
}

export interface PlanWorkflowOptions {
  readonly storage: CoreStore & PlanStore
  readonly runtime: PlanWorkflowRuntimePort
  readonly principalId?: PrincipalId
}

export interface GeneratePlanProposalRequest {
  readonly id?: string
  readonly sessionId: string
  readonly principalId?: PrincipalId
  readonly planningRequest: readonly MessagePart[]
  readonly modelEndpointId?: string
  readonly references?: readonly PlanProposalReference[]
  readonly idempotencyKey: string
  readonly maxOutputTokens?: number
  readonly signal?: RuntimeAbortSignal
}

export interface RevisePlanProposalRequest {
  readonly proposalId: string
  readonly expectedRevision: number
  readonly actorId: PrincipalId
  readonly content: PlanProposalContent
  readonly operationId?: string
  readonly reason?: string
  readonly idempotencyKey: string
}

export interface DecidePlanProposalRequest {
  readonly proposalId: string
  readonly expectedRevision: number
  readonly actorId: PrincipalId
  readonly operationId?: string
  readonly reason?: string
  readonly idempotencyKey: string
}

export interface ExecutePlanProposalRequest {
  readonly proposalId: string
  readonly expectedRevision: number
  readonly principalId?: PrincipalId
  readonly modelEndpointId?: string
  readonly idempotencyKey: string
  readonly maxSteps?: number
}

export interface ListPlanProposalsRuntimeRequest {
  readonly principalId?: PrincipalId
  readonly sourceSessionId?: string
  readonly state?: PlanProposalState
  readonly referenceKind?: PlanProposalReference["kind"]
  readonly referenceId?: string
  readonly limit?: number
}

export interface PlanExecutionProjection {
  readonly input: SessionInputRecord
  readonly turn: SessionTurnRecord
  readonly job: SchedulerJobRecord
}

export interface PlanProposalView {
  readonly proposal: PlanProposalRecord
  readonly execution?: PlanExecutionProjection
}

export interface PlanProposalHistory {
  readonly view: PlanProposalView
  readonly operations: readonly PlanProposalOperationRecord[]
}
