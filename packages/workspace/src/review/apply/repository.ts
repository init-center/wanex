import type {
  WorkspaceChangeProposalRecord,
  WorkspaceChangeSetRecord
} from "@wanex/protocol"
import type { WorkspaceStore } from "@wanex/storage/workspace"

export class ProposalApplyRepository {
  private readonly storage: WorkspaceStore

  constructor(storage: WorkspaceStore) {
    this.storage = storage
  }

  async requireApplyRequestedProposal(
    proposalId: string
  ): Promise<WorkspaceChangeProposalRecord> {
    const proposal = await this.requireProposal(proposalId)
    if (proposal.state !== "apply_requested") {
      throw new Error(
        `workspace proposal is not apply_requested: ${proposalId} (${proposal.state})`
      )
    }
    return proposal
  }

  async requireProposal(
    proposalId: string
  ): Promise<WorkspaceChangeProposalRecord> {
    const proposal = await this.storage.getWorkspaceChangeProposal({ proposalId })
    if (proposal === null) {
      throw new Error(`workspace proposal does not exist: ${proposalId}`)
    }
    return proposal
  }

  async requireChangeSet(
    changeSetId: string
  ): Promise<WorkspaceChangeSetRecord> {
    const changeSet = await this.storage.getWorkspaceChangeSet({ changeSetId })
    if (changeSet === null) {
      throw new Error(`workspace changeset does not exist: ${changeSetId}`)
    }
    return changeSet
  }
}
