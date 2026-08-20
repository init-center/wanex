import type {
  WorkspaceChangeProposalRecord,
  WorkspaceChangeSetRecord
} from "@wanex/protocol"
import type { PlannedBatchItem } from "./batch-order.js"
import type {
  ApplyProposalBatchPlanResult,
  ApplyProposalPlanConflict,
  ApplyProposalPlanConflictReason,
  ApplyProposalPlanItem,
  ApplyProposalPlanItemStatus
} from "./types.js"

export interface LoadedProposalPlanItem {
  readonly item: PlannedBatchItem
  readonly proposal: WorkspaceChangeProposalRecord
  readonly changeSet: WorkspaceChangeSetRecord
  readonly paths: readonly string[]
}

interface PathOwner {
  readonly proposalId: string
  readonly changeSetId: string
  readonly kind: string
}

export function classifyProposalPlan(
  items: readonly LoadedProposalPlanItem[]
): ApplyProposalBatchPlanResult {
  const pathOwners = new Map<string, PathOwner[]>()
  const planned: ApplyProposalPlanItem[] = []

  for (const loaded of items) {
    const conflicts: ApplyProposalPlanConflict[] = []
    for (const change of loaded.changeSet.changeSet.changes) {
      const owners = pathOwners.get(change.path) ?? []
      for (const owner of owners) {
        if (loaded.item.dependsOn.includes(owner.proposalId)) {
          continue
        }
        conflicts.push({
          path: change.path,
          reason: classifyPlanConflictReason(owner.kind, change.kind),
          conflictingProposalId: owner.proposalId,
          conflictingChangeSetId: owner.changeSetId
        })
      }
    }

    const status: ApplyProposalPlanItemStatus =
      conflicts.length > 0
        ? "needs_review"
        : loaded.item.dependsOn.length > 0
          ? "queued"
          : "ready"
    planned.push({
      proposalId: loaded.item.proposalId,
      changeSetId: loaded.proposal.changeSetId,
      status,
      dependsOn: loaded.item.dependsOn,
      paths: loaded.paths,
      conflicts,
      ...(loaded.item.actorId === undefined ? {} : { actorId: loaded.item.actorId }),
      ...(loaded.item.metadata === undefined ? {} : { metadata: loaded.item.metadata })
    })

    for (const change of loaded.changeSet.changeSet.changes) {
      const owners = pathOwners.get(change.path) ?? []
      owners.push({
        proposalId: loaded.item.proposalId,
        changeSetId: loaded.proposal.changeSetId,
        kind: change.kind
      })
      pathOwners.set(change.path, owners)
    }
  }

  return {
    status: planned.some((item) => item.status === "needs_review")
      ? "needs_review"
      : "executable",
    orderedProposalIds: planned.map((item) => item.proposalId),
    items: planned
  }
}

function classifyPlanConflictReason(
  previousKind: string,
  nextKind: string
): ApplyProposalPlanConflictReason {
  if (previousKind === "create" && nextKind === "create") {
    return "create_create_same_path"
  }
  if (
    (previousKind === "delete" && nextKind === "update") ||
    (previousKind === "update" && nextKind === "delete")
  ) {
    return "delete_update_same_path"
  }
  return "same_path_without_dependency"
}
