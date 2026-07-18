import type { JsonValue } from "@wanex/protocol"
import type {
  ApplyProposalBatchPlanResult,
  ApplyProposalBatchResult,
  ApplyProposalPlanConflict
} from "./types.js"

export function blockedByPlanResult(
  plan: ApplyProposalBatchPlanResult
): ApplyProposalBatchResult {
  return {
    status: "failed",
    orderedProposalIds: plan.orderedProposalIds,
    results: plan.items.map((item) => ({
      proposalId: item.proposalId,
      status: item.status === "needs_review" ? "needs_review" : "blocked",
      dependsOn: item.dependsOn,
      error:
        item.status === "needs_review"
          ? {
              type: "proposal_batch.needs_review",
              conflicts: item.conflicts.map(planConflictToJson)
            }
          : {
              type: "proposal_batch.blocked_by_plan_review"
            }
    }))
  }
}

export function planConflictToJson(conflict: ApplyProposalPlanConflict): JsonValue {
  return {
    path: conflict.path,
    reason: conflict.reason,
    conflictingProposalId: conflict.conflictingProposalId,
    conflictingChangeSetId: conflict.conflictingChangeSetId
  }
}
