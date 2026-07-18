import type {
  AppDiagnosticEntry,
  BaseWorkspaceApplyPlan,
  BaseWorkspaceApplyPlanItem
} from "./diagnostics-types.js"

export function workspaceApplyPlanDiagnostics(
  plan: BaseWorkspaceApplyPlan | undefined,
  generatedAt: number
): readonly AppDiagnosticEntry[] {
  return (plan?.items ?? []).map((item) =>
    workspaceApplyPlanItemDiagnostic(item, generatedAt)
  )
}

function workspaceApplyPlanItemDiagnostic(
  item: BaseWorkspaceApplyPlanItem,
  generatedAt: number
): AppDiagnosticEntry {
  return {
    id: `workspace-apply-plan:${item.proposalId}`,
    source: "workspace",
    severity: item.status === "needs_review" ? "warning" : "info",
    code: `workspace.apply.plan.${item.status}`,
    message: workspaceApplyPlanMessage(item.status, item.proposalId),
    at: generatedAt,
    detail: {
      proposalId: item.proposalId,
      changeSetId: item.changeSetId,
      status: item.status,
      dependsOn: [...item.dependsOn],
      paths: [...item.paths],
      conflicts: item.conflicts.map((conflict) => ({
        path: conflict.path,
        reason: conflict.reason,
        ...(conflict.conflictingProposalId === undefined
          ? {}
          : { conflictingProposalId: conflict.conflictingProposalId }),
        ...(conflict.conflictingChangeSetId === undefined
          ? {}
          : { conflictingChangeSetId: conflict.conflictingChangeSetId })
      }))
    }
  }
}

function workspaceApplyPlanMessage(
  status: BaseWorkspaceApplyPlanItem["status"],
  proposalId: string
): string {
  if (status === "ready") {
    return `Workspace apply ready: ${proposalId}`
  }
  if (status === "queued") {
    return `Workspace apply queued: ${proposalId}`
  }
  return `Workspace apply needs review: ${proposalId}`
}
