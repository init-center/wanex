import { randomBytes, randomUUID } from "node:crypto"
import type { PrincipalId } from "@wanex/protocol"
import type { WorkspaceStore } from "@wanex/storage/workspace"
import type { WorkspaceRuntime } from "../../index.js"
import { applyProposalBatch, planApplyProposalBatch } from "./apply-batch.js"
import { applyProposal } from "./apply-one.js"
import { ProposalApplyRepository } from "./repository.js"
import type {
  ApplyProposalBatchPlanResult,
  ApplyProposalBatchRequest,
  ApplyProposalBatchResult,
  ApplyProposalRequest,
  ApplyProposalResult,
  WorkspaceProposalApplyRuntimeOptions
} from "./types.js"

export const WANEX_WORKSPACE_PROPOSAL_APPLY =
  "wanex-workspace-review-apply" as const

const DEFAULT_ACTOR_ID = "workspace-review-apply"
export class WorkspaceProposalApplyRuntime {
  private readonly storage: WorkspaceStore
  private readonly workspace: WorkspaceRuntime
  private readonly actorId: PrincipalId
  private readonly repository: ProposalApplyRepository
  private readonly createAttemptId: () => string
  private readonly createClaimToken: () => string

  constructor(options: WorkspaceProposalApplyRuntimeOptions) {
    this.storage = options.storage
    this.workspace = options.workspace
    this.actorId = options.actorId ?? DEFAULT_ACTOR_ID
    this.repository = new ProposalApplyRepository(options.storage)
    this.createAttemptId =
      options.createAttemptId ?? (() => `wcpa_${randomUUID()}`)
    this.createClaimToken =
      options.createClaimToken ?? (() => randomBytes(32).toString("base64url"))
  }

  async applyProposal(
    request: ApplyProposalRequest
  ): Promise<ApplyProposalResult> {
    return await applyProposal({
      request,
      storage: this.storage,
      workspace: this.workspace,
      repository: this.repository,
      defaultActorId: this.actorId,
      createAttemptId: this.createAttemptId,
      createClaimToken: this.createClaimToken
    })
  }

  async applyProposalBatch(
    request: ApplyProposalBatchRequest
  ): Promise<ApplyProposalBatchResult> {
    return await applyProposalBatch({
      request,
      planApplyProposalBatch: async (planRequest) =>
        await this.planApplyProposalBatch(planRequest),
      applyProposal: async (applyRequest) => await this.applyProposal(applyRequest)
    })
  }

  async planApplyProposalBatch(
    request: ApplyProposalBatchRequest
  ): Promise<ApplyProposalBatchPlanResult> {
    return await planApplyProposalBatch({
      request,
      repository: this.repository
    })
  }
}
