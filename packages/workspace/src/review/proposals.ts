import type {
  JsonValue,
  PrincipalId,
  WorkspaceChangeProposalOperationRecord,
  WorkspaceChangeProposalRecord,
  WorkspaceChangeProposalState,
  WorkspaceChangeSetRecord
} from "@wanex/protocol"
import type { WorkspaceStore } from "@wanex/storage/workspace"

export const WANEX_WORKSPACE_REVIEW =
  "wanex-workspace-review" as const

export interface WorkspaceProposalRuntimeOptions {
  readonly storage: WorkspaceStore
  readonly workspaceId?: string
  readonly principalId?: PrincipalId
}

export interface CreateChangeProposalRequest {
  readonly id?: string
  readonly changeSetId: string
  readonly workspaceId?: string
  readonly principalId?: PrincipalId
  readonly title?: string
  readonly summary?: string
  readonly metadata?: JsonValue
  readonly idempotencyKey?: string
}

export interface ReviewChangeProposalRequest {
  readonly proposalId: string
  readonly actorId?: PrincipalId
  readonly operationId?: string
  readonly reason?: string
  readonly metadata?: JsonValue
}

export interface ListChangeProposalsRequest {
  readonly workspaceId?: string
  readonly state?: WorkspaceChangeProposalState
  readonly changeSetId?: string
  readonly limit?: number
}

export interface ChangeProposalHistory {
  readonly proposal: WorkspaceChangeProposalRecord
  readonly changeSet: WorkspaceChangeSetRecord | null
  readonly operations: readonly WorkspaceChangeProposalOperationRecord[]
}

const DEFAULT_WORKSPACE_ID = "local"
const DEFAULT_PRINCIPAL_ID = "workspace-review"

export class WorkspaceProposalRuntime {
  readonly workspaceId: string

  private readonly storage: WorkspaceStore
  private readonly principalId: PrincipalId

  constructor(options: WorkspaceProposalRuntimeOptions) {
    this.storage = options.storage
    this.workspaceId = options.workspaceId ?? DEFAULT_WORKSPACE_ID
    this.principalId = options.principalId ?? DEFAULT_PRINCIPAL_ID
  }

  async createProposal(
    request: CreateChangeProposalRequest
  ): Promise<WorkspaceChangeProposalRecord> {
    return await this.storage.putWorkspaceChangeProposal({
      ...(request.id === undefined ? {} : { id: request.id }),
      workspaceId: request.workspaceId ?? this.workspaceId,
      changeSetId: request.changeSetId,
      principalId: request.principalId ?? this.principalId,
      ...(request.title === undefined ? {} : { title: request.title }),
      ...(request.summary === undefined ? {} : { summary: request.summary }),
      ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
      ...(request.idempotencyKey === undefined
        ? {}
        : { idempotencyKey: request.idempotencyKey })
    })
  }

  async approveProposal(
    request: ReviewChangeProposalRequest
  ): Promise<WorkspaceChangeProposalOperationRecord> {
    return await this.recordReviewOperation(request, "approve")
  }

  async rejectProposal(
    request: ReviewChangeProposalRequest
  ): Promise<WorkspaceChangeProposalOperationRecord> {
    return await this.recordReviewOperation(request, "reject")
  }

  async withdrawProposal(
    request: ReviewChangeProposalRequest
  ): Promise<WorkspaceChangeProposalOperationRecord> {
    return await this.recordReviewOperation(request, "withdraw")
  }

  async requestApply(
    request: ReviewChangeProposalRequest
  ): Promise<WorkspaceChangeProposalOperationRecord> {
    return await this.recordReviewOperation(request, "request_apply")
  }

  async getProposal(
    proposalId: string
  ): Promise<WorkspaceChangeProposalRecord | null> {
    return await this.storage.getWorkspaceChangeProposal({ proposalId })
  }

  async listProposals(
    request: ListChangeProposalsRequest = {}
  ): Promise<WorkspaceChangeProposalRecord[]> {
    return await this.storage.listWorkspaceChangeProposals({
      workspaceId: request.workspaceId ?? this.workspaceId,
      ...(request.state === undefined ? {} : { state: request.state }),
      ...(request.changeSetId === undefined
        ? {}
        : { changeSetId: request.changeSetId }),
      ...(request.limit === undefined ? {} : { limit: request.limit })
    })
  }

  async getHistory(proposalId: string): Promise<ChangeProposalHistory | null> {
    const proposal = await this.storage.getWorkspaceChangeProposal({ proposalId })
    if (proposal === null) {
      return null
    }
    const [changeSet, operations] = await Promise.all([
      this.storage.getWorkspaceChangeSet({ changeSetId: proposal.changeSetId }),
      this.storage.listWorkspaceChangeProposalOperations({ proposalId })
    ])
    return { proposal, changeSet, operations }
  }

  private async recordReviewOperation(
    request: ReviewChangeProposalRequest,
    operation:
      | "approve"
      | "reject"
      | "withdraw"
      | "request_apply"
  ): Promise<WorkspaceChangeProposalOperationRecord> {
    return await this.storage.recordWorkspaceChangeProposalOperation({
      ...(request.operationId === undefined ? {} : { id: request.operationId }),
      proposalId: request.proposalId,
      operation,
      actorId: request.actorId ?? this.principalId,
      ...(request.reason === undefined ? {} : { reason: request.reason }),
      ...(request.metadata === undefined ? {} : { metadata: request.metadata })
    })
  }
}
