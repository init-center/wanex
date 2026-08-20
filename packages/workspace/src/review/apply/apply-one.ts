import type { JsonValue, PrincipalId } from "@wanex/protocol"
import type { WorkspaceStore } from "@wanex/storage/workspace"
import {
  WorkspaceRuntime,
  type ApplyWorkspaceChangeSetResult
} from "../../index.js"
import type { ProposalApplyRepository } from "./repository.js"
import {
  normalizeApplyError,
  toReceiptMetadata,
  validateApplyProposalRequest
} from "./result-helpers.js"
import type { ApplyProposalRequest, ApplyProposalResult } from "./types.js"
import { WorkspaceTransactionRecoveryRequiredError } from "../../transaction/runtime.js"

export async function applyProposal(input: {
  readonly request: ApplyProposalRequest
  readonly storage: WorkspaceStore
  readonly workspace: WorkspaceRuntime
  readonly repository: ProposalApplyRepository
  readonly defaultActorId: PrincipalId
  readonly createAttemptId: () => string
  readonly createClaimToken: () => string
}): Promise<ApplyProposalResult> {
  validateApplyProposalRequest(input.request)
  const actorId = input.request.actorId ?? input.defaultActorId
  const attemptId = input.createAttemptId()
  const claimToken = input.createClaimToken()
  const proposal = await input.repository.requireProposal(input.request.proposalId)
  const changeSet = await input.repository.requireChangeSet(proposal.changeSetId)
  await input.workspace.recoverPendingTransactions(changeSet.workspaceId)
  const claim = await input.storage.claimWorkspaceChangeProposalApply({
    proposalId: input.request.proposalId,
    attemptId,
    ownerId: actorId,
    claimToken,
    leaseMs: input.workspace.transactionLeaseMs,
    ...(input.request.metadata === undefined
      ? {}
      : { metadata: input.request.metadata })
  })
  if (claim.proposal.changeSetId !== changeSet.id) {
    throw new Error("workspace proposal changeset changed during apply claim")
  }
  if (claim.status !== "claimed") {
    return {
      status: claim.status,
      proposal: claim.proposal,
      changeSet,
      ...(claim.attempt === undefined ? {} : { applyAttempt: claim.attempt })
    }
  }
  if (claim.attempt === undefined) {
    throw new Error("claimed workspace proposal apply has no durable attempt")
  }

  let applyResult: ApplyWorkspaceChangeSetResult
  try {
    applyResult = await input.workspace.applyChangeSet({
      changeSet: changeSet.changeSet,
      workspaceId: changeSet.workspaceId,
      principalId: changeSet.principalId,
      mutation: {
        sourceKind: "proposal",
        sourceId: claim.proposal.id,
        idempotencyKey: `proposal-apply:${claim.attempt.id}`,
        ownerId: actorId,
        proposal: {
          proposalId: claim.proposal.id,
          proposalAttemptId: claim.attempt.id,
          proposalClaimToken: claimToken
        }
      }
    })
  } catch (error) {
    if (error instanceof WorkspaceTransactionRecoveryRequiredError) {
      const proposal = await input.repository.requireProposal(claim.proposal.id)
      return {
        status: "recovery_required",
        proposal,
        changeSet,
        ...(error.finalization?.proposalAttempt === undefined
          ? {}
          : { applyAttempt: error.finalization.proposalAttempt }),
        error: normalizeApplyError(error)
      }
    }
    throw error
  }

  if (applyResult.receipt.status === "conflicted") {
    const error: JsonValue = {
      type: "workspace.apply_conflicted",
      receipt: toReceiptMetadata(applyResult.receipt)
    }
    return {
      status: "apply_failed",
      proposal: applyResult.transaction.proposal ?? claim.proposal,
      changeSet: applyResult.changeSet,
      workspaceOperation: applyResult.operation,
      ...(applyResult.transaction.proposalAttempt === undefined
        ? {}
        : { applyAttempt: applyResult.transaction.proposalAttempt }),
      applyResult,
      error
    }
  }
  return {
    status: "applied",
    proposal: applyResult.transaction.proposal ?? claim.proposal,
    changeSet: applyResult.changeSet,
    workspaceOperation: applyResult.operation,
    ...(applyResult.transaction.proposalAttempt === undefined
      ? {}
      : { applyAttempt: applyResult.transaction.proposalAttempt }),
    applyResult
  }
}
