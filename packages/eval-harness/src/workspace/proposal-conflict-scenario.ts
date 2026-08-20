import { WorkspaceProposalApplyRuntime } from "@wanex/workspace/review"
import { WorkspaceRuntime } from "@wanex/workspace"
import { createEvalScenario } from "../runner.js"
import { assert, putRequestedCreateProposal } from "../scenario-utils.js"

export const workspaceConflictScenario = createEvalScenario({
  id: "workspace.conflict-plan",
  title: "Same-path proposal batch is surfaced for review",
  tags: ["workspace", "multi-agent"],
  async run(context) {
    const workspace = new WorkspaceRuntime({
      storage: context.storage,
      rootDir: context.workspaceRootDir,
      serviceBin: context.serviceBin,
      workspaceId: "eval_workspace",
      principalId: "agent_eval_workspace"
    })
    const proposal = new WorkspaceProposalApplyRuntime({
      storage: context.storage,
      workspace,
      actorId: "eval-harness"
    })
    await putRequestedCreateProposal(context.storage, {
      proposalId: "wcp_eval_conflict_a",
      changeSetId: "cs_eval_conflict_a",
      targetText: "a\n"
    })
    await putRequestedCreateProposal(context.storage, {
      proposalId: "wcp_eval_conflict_b",
      changeSetId: "cs_eval_conflict_b",
      targetText: "b\n"
    })
    const plan = await proposal.planApplyProposalBatch({
      items: [
        {
          proposalId: "wcp_eval_conflict_a"
        },
        {
          proposalId: "wcp_eval_conflict_b"
        }
      ]
    })
    assert(plan.status === "needs_review", "plan should need review")
    assert(
      plan.items.some((item) => item.status === "needs_review"),
      "one proposal should need review"
    )
    return {
      status: plan.status,
      conflictCount: plan.items.flatMap((item) => item.conflicts).length
    }
  }
})
