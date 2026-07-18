import type {
  JsonValue,
  PlanProposalOperationKind,
  PlanProposalOperationRecord,
  PlanProposalRecord,
  PlanProposalReference,
  PlanProposalState,
  PlanProposalStep,
  PrincipalId
} from "@wanex/protocol"
import type { PlanStore } from "@wanex/storage/plan"

export const WANEX_APP_PLAN_WORKFLOW =
  "wanex-app-plan-workflow" as const

export interface PlanWorkflowOptions {
  readonly storage: PlanStore
  readonly principalId?: PrincipalId
}

export interface CreatePlanProposalRequest {
  readonly id?: string
  readonly principalId?: PrincipalId
  readonly title?: string
  readonly summary?: string
  readonly steps: readonly PlanProposalStep[]
  readonly references?: readonly PlanProposalReference[]
  readonly metadata?: JsonValue
  readonly idempotencyKey?: string
}

export interface ReviewPlanProposalRequest {
  readonly proposalId: string
  readonly actorId?: PrincipalId
  readonly operationId?: string
  readonly reason?: string
  readonly metadata?: JsonValue
}

export interface ListPlanProposalsRuntimeRequest {
  readonly principalId?: PrincipalId
  readonly state?: PlanProposalState
  readonly referenceKind?: PlanProposalReference["kind"]
  readonly referenceId?: string
  readonly limit?: number
}

export interface PlanProposalHistory {
  readonly proposal: PlanProposalRecord
  readonly operations: readonly PlanProposalOperationRecord[]
}

const DEFAULT_PRINCIPAL_ID = "app-plan-workflow"

export class PlanWorkflow {
  private readonly storage: PlanStore
  private readonly principalId: PrincipalId

  constructor(options: PlanWorkflowOptions) {
    this.storage = options.storage
    this.principalId = options.principalId ?? DEFAULT_PRINCIPAL_ID
  }

  async createProposal(
    request: CreatePlanProposalRequest
  ): Promise<PlanProposalRecord> {
    return await this.storage.putPlanProposal({
      ...(request.id === undefined ? {} : { id: request.id }),
      principalId: request.principalId ?? this.principalId,
      ...(request.title === undefined ? {} : { title: request.title }),
      ...(request.summary === undefined ? {} : { summary: request.summary }),
      steps: request.steps,
      ...(request.references === undefined
        ? {}
        : { references: request.references }),
      ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
      ...(request.idempotencyKey === undefined
        ? {}
        : { idempotencyKey: request.idempotencyKey })
    })
  }

  async approveProposal(
    request: ReviewPlanProposalRequest
  ): Promise<PlanProposalOperationRecord> {
    return await this.recordOperation(request, "approve")
  }

  async rejectProposal(
    request: ReviewPlanProposalRequest
  ): Promise<PlanProposalOperationRecord> {
    return await this.recordOperation(request, "reject")
  }

  async withdrawProposal(
    request: ReviewPlanProposalRequest
  ): Promise<PlanProposalOperationRecord> {
    return await this.recordOperation(request, "withdraw")
  }

  async requestExecution(
    request: ReviewPlanProposalRequest
  ): Promise<PlanProposalOperationRecord> {
    return await this.recordOperation(request, "request_execution")
  }

  async markExecuted(
    request: ReviewPlanProposalRequest
  ): Promise<PlanProposalOperationRecord> {
    return await this.recordOperation(request, "mark_executed")
  }

  async markExecutionFailed(
    request: ReviewPlanProposalRequest
  ): Promise<PlanProposalOperationRecord> {
    return await this.recordOperation(request, "mark_execution_failed")
  }

  async getProposal(proposalId: string): Promise<PlanProposalRecord | null> {
    return await this.storage.getPlanProposal({ proposalId })
  }

  async listProposals(
    request: ListPlanProposalsRuntimeRequest = {}
  ): Promise<PlanProposalRecord[]> {
    return await this.storage.listPlanProposals({
      ...(request.principalId === undefined
        ? {}
        : { principalId: request.principalId }),
      ...(request.state === undefined ? {} : { state: request.state }),
      ...(request.referenceKind === undefined
        ? {}
        : { referenceKind: request.referenceKind }),
      ...(request.referenceId === undefined
        ? {}
        : { referenceId: request.referenceId }),
      ...(request.limit === undefined ? {} : { limit: request.limit })
    })
  }

  async getHistory(proposalId: string): Promise<PlanProposalHistory | null> {
    const proposal = await this.storage.getPlanProposal({ proposalId })
    if (proposal === null) {
      return null
    }
    const operations = await this.storage.listPlanProposalOperations({
      proposalId
    })
    return { proposal, operations }
  }

  private async recordOperation(
    request: ReviewPlanProposalRequest,
    operation: PlanProposalOperationKind
  ): Promise<PlanProposalOperationRecord> {
    return await this.storage.recordPlanProposalOperation({
      ...(request.operationId === undefined ? {} : { id: request.operationId }),
      proposalId: request.proposalId,
      operation,
      actorId: request.actorId ?? this.principalId,
      ...(request.reason === undefined ? {} : { reason: request.reason }),
      ...(request.metadata === undefined ? {} : { metadata: request.metadata })
    })
  }
}
