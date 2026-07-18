import type { JsonValue, PrincipalId } from "@wanex/protocol"
import type { WorkspaceStore } from "@wanex/storage/workspace"
import {
  WorkspaceRuntime,
  type ApplyWorkspaceChangeSetResult
} from "../../index.js"
import { markApplyFailed } from "./failure.js"
import type { ProposalApplyRepository } from "./repository.js"
import {
  mergeMetadata,
  normalizeApplyError,
  toReceiptMetadata,
  validateApplyProposalRequest
} from "./result-helpers.js"
import type { ApplyProposalRequest, ApplyProposalResult } from "./types.js"

export async function applyProposal(input: {
  readonly request: ApplyProposalRequest
  readonly storage: WorkspaceStore
  readonly workspace: WorkspaceRuntime
  readonly repository: ProposalApplyRepository
  readonly defaultActorId: PrincipalId
}): Promise<ApplyProposalResult> {
  validateApplyProposalRequest(input.request)
  const actorId = input.request.actorId ?? input.defaultActorId
  const proposal = await input.repository.requireApplyRequestedProposal(
    input.request.proposalId
  )
  const changeSet = await input.repository.requireChangeSet(proposal.changeSetId)

  let applyResult: ApplyWorkspaceChangeSetResult
  try {
    applyResult = await input.workspace.applyChangeSet({
      changeSet: changeSet.changeSet,
      workspaceId: changeSet.workspaceId,
      principalId: changeSet.principalId
    })
  } catch (error) {
    const normalized = normalizeApplyError(error)
    const proposalOperation = await markApplyFailed({
      storage: input.storage,
      request: input.request,
      proposal,
      actorId,
      error: normalized
    })
    const latestProposal = await input.repository.requireProposal(proposal.id)
    return {
      status: "apply_failed",
      proposal: latestProposal,
      changeSet,
      proposalOperation,
      error: normalized
    }
  }

  if (applyResult.receipt.status === "conflicted") {
    const error: JsonValue = {
      type: "workspace.apply_conflicted",
      receipt: toReceiptMetadata(applyResult.receipt)
    }
    const proposalOperation = await markApplyFailed({
      storage: input.storage,
      request: input.request,
      proposal,
      actorId,
      error,
      workspaceOperation: applyResult.operation
    })
    const latestProposal = await input.repository.requireProposal(proposal.id)
    return {
      status: "apply_failed",
      proposal: latestProposal,
      changeSet: applyResult.changeSet,
      workspaceOperation: applyResult.operation,
      proposalOperation,
      applyResult,
      error
    }
  }

  const proposalOperation =
    await input.storage.recordWorkspaceChangeProposalOperation({
      ...(input.request.operationId === undefined
        ? {}
        : { id: input.request.operationId }),
      proposalId: proposal.id,
      operation: "mark_applied",
      actorId,
      metadata: mergeMetadata(input.request.metadata, {
        workspaceOperationId: applyResult.operation.id,
        changeSetId: changeSet.id,
        status: applyResult.receipt.status
      })
    })
  const latestProposal = await input.repository.requireProposal(proposal.id)
  return {
    status: "applied",
    proposal: latestProposal,
    changeSet: applyResult.changeSet,
    workspaceOperation: applyResult.operation,
    proposalOperation,
    applyResult
  }
}
