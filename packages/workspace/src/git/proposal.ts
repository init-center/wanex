import type { WorkspaceChangeProposalRecord, WorkspaceChangeSetRecord } from "@wanex/protocol"
import type { WorkspaceStore } from "@wanex/storage/workspace"
import type {
  CreateChangeSetFromWorktreeRequest,
  CreateProposalFromWorktreeOptions
} from "./types.js"

export async function createProposalFromWorktree(input: {
  readonly storage: WorkspaceStore
  readonly request: CreateChangeSetFromWorktreeRequest
  readonly changeSet: WorkspaceChangeSetRecord
}): Promise<WorkspaceChangeProposalRecord> {
  const proposalOptions: CreateProposalFromWorktreeOptions =
    typeof input.request.createProposal === "object"
      ? input.request.createProposal
      : {}
  const title =
    proposalOptions.title ??
    input.request.title ??
    input.changeSet.changeSet.title
  return await input.storage.putWorkspaceChangeProposal({
    ...(proposalOptions.id === undefined ? {} : { id: proposalOptions.id }),
    workspaceId: input.changeSet.workspaceId,
    principalId: input.changeSet.principalId,
    changeSetId: input.changeSet.id,
    ...(title === undefined ? {} : { title }),
    ...(proposalOptions.summary === undefined
      ? {}
      : { summary: proposalOptions.summary }),
    ...(proposalOptions.metadata === undefined
      ? {}
      : { metadata: proposalOptions.metadata }),
    ...(proposalOptions.idempotencyKey === undefined
      ? {}
      : { idempotencyKey: proposalOptions.idempotencyKey })
  })
}
