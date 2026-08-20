import {
  blockedByPlanResult,
  classifyProposalPlan,
  planConflictToJson,
  planProposalBatch,
  uniqueSortedPaths,
  type LoadedProposalPlanItem
} from "./batch-plan.js"
import type { ProposalApplyRepository } from "./repository.js"
import { mergeMetadata, summarizeBatchStatus } from "./result-helpers.js"
import type {
  ApplyProposalBatchItemResult,
  ApplyProposalBatchItemStatus,
  ApplyProposalBatchPlanResult,
  ApplyProposalBatchRequest,
  ApplyProposalBatchResult,
  ApplyProposalRequest,
  ApplyProposalResult
} from "./types.js"

export async function applyProposalBatch(input: {
  readonly request: ApplyProposalBatchRequest
  readonly planApplyProposalBatch: (
    request: ApplyProposalBatchRequest
  ) => Promise<ApplyProposalBatchPlanResult>
  readonly applyProposal: (
    request: ApplyProposalRequest
  ) => Promise<ApplyProposalResult>
}): Promise<ApplyProposalBatchResult> {
  const plan = await input.planApplyProposalBatch(input.request)
  const stopOnFailure = input.request.stopOnFailure ?? true
  if (plan.status === "needs_review" && stopOnFailure) {
    return blockedByPlanResult(plan)
  }
  const results: ApplyProposalBatchItemResult[] = []
  const terminalByProposalId = new Map<string, ApplyProposalBatchItemStatus>()
  let stopped = false

  for (const [batchIndex, planItem] of plan.items.entries()) {
    if (planItem.status === "needs_review") {
      const itemResult: ApplyProposalBatchItemResult = {
        proposalId: planItem.proposalId,
        status: "needs_review",
        dependsOn: planItem.dependsOn,
        error: {
          type: "proposal_batch.needs_review",
          conflicts: planItem.conflicts.map(planConflictToJson)
        }
      }
      results.push(itemResult)
      terminalByProposalId.set(planItem.proposalId, itemResult.status)
      continue
    }

    const failedDependency = planItem.dependsOn.find((dependencyId) => {
      const dependencyStatus = terminalByProposalId.get(dependencyId)
      return (
        dependencyStatus === "apply_failed" ||
        dependencyStatus === "busy" ||
        dependencyStatus === "recovery_required" ||
        dependencyStatus === "not_ready" ||
        dependencyStatus === "already_terminal" ||
        dependencyStatus === "blocked" ||
        dependencyStatus === "needs_review" ||
        dependencyStatus === "skipped"
      )
    })

    if (failedDependency !== undefined) {
      const itemResult: ApplyProposalBatchItemResult = {
        proposalId: planItem.proposalId,
        status: "blocked",
        dependsOn: planItem.dependsOn,
        error: {
          type: "proposal_batch.dependency_failed",
          dependencyProposalId: failedDependency
        }
      }
      results.push(itemResult)
      terminalByProposalId.set(planItem.proposalId, itemResult.status)
      if (stopOnFailure) {
        stopped = true
        break
      }
      continue
    }

    const actorId = planItem.actorId ?? input.request.actorId
    const result = await input.applyProposal({
      proposalId: planItem.proposalId,
      ...(actorId === undefined ? {} : { actorId }),
      metadata: mergeMetadata(input.request.metadata, {
        itemMetadata: planItem.metadata,
        batchIndex,
        dependsOn: planItem.dependsOn
      })
    })
    const itemResult: ApplyProposalBatchItemResult = {
      proposalId: planItem.proposalId,
      status: result.status,
      dependsOn: planItem.dependsOn,
      result,
      ...(result.error === undefined ? {} : { error: result.error })
    }
    results.push(itemResult)
    terminalByProposalId.set(planItem.proposalId, itemResult.status)

    if (result.status !== "applied" && stopOnFailure) {
      stopped = true
      break
    }
  }

  if (stopped) {
    const attemptedProposalIds = new Set(
      results.map((result) => result.proposalId)
    )
    for (const item of plan.items) {
      if (attemptedProposalIds.has(item.proposalId)) {
        continue
      }
      const itemResult: ApplyProposalBatchItemResult = {
        proposalId: item.proposalId,
        status: "skipped",
        dependsOn: item.dependsOn,
        error: {
          type: "proposal_batch.stopped_after_failure"
        }
      }
      results.push(itemResult)
      terminalByProposalId.set(item.proposalId, itemResult.status)
    }
  }

  return {
    status: summarizeBatchStatus(results),
    orderedProposalIds: plan.items.map((item) => item.proposalId),
    results
  }
}

export async function planApplyProposalBatch(input: {
  readonly request: ApplyProposalBatchRequest
  readonly repository: ProposalApplyRepository
}): Promise<ApplyProposalBatchPlanResult> {
  const order = planProposalBatch(input.request.items)
  const items: LoadedProposalPlanItem[] = []
  for (const item of order.orderedItems) {
    const proposal = await input.repository.requireApplyRequestedProposal(
      item.proposalId
    )
    const changeSet = await input.repository.requireChangeSet(proposal.changeSetId)
    items.push({
      item,
      proposal,
      changeSet,
      paths: uniqueSortedPaths(
        changeSet.changeSet.changes.map((change) => change.path)
      )
    })
  }
  return classifyProposalPlan(items)
}
