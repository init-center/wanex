import type {
  JsonValue,
  PrincipalId,
  WorkspaceChangeOperationRecord,
  WorkspaceChangeProposalOperationRecord,
  WorkspaceChangeProposalRecord
} from "@wanex/protocol"
import type { WorkspaceStore } from "@wanex/storage/workspace"
import { extractErrorReason, mergeMetadata } from "./result-helpers.js"
import type { ApplyProposalRequest } from "./types.js"

export async function markApplyFailed(input: {
  readonly storage: WorkspaceStore
  readonly request: ApplyProposalRequest
  readonly proposal: WorkspaceChangeProposalRecord
  readonly actorId: PrincipalId
  readonly error: JsonValue
  readonly workspaceOperation?: WorkspaceChangeOperationRecord
}): Promise<WorkspaceChangeProposalOperationRecord> {
  return await input.storage.recordWorkspaceChangeProposalOperation({
    ...(input.request.failureOperationId === undefined
      ? {}
      : { id: input.request.failureOperationId }),
    proposalId: input.proposal.id,
    operation: "mark_apply_failed",
    actorId: input.actorId,
    reason: extractErrorReason(input.error),
    metadata: mergeMetadata(input.request.metadata, {
      workspaceOperationId: input.workspaceOperation?.id,
      changeSetId: input.proposal.changeSetId,
      error: input.error
    })
  })
}
