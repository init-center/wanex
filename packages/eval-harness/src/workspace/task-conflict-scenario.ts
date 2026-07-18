import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { WorkspaceProposalApplyRuntime } from "@wanex/workspace/review"
import type { EvalStore } from "../eval-storage.js"
import { WorkspaceRuntime } from "@wanex/workspace"
import type {
  WorkspaceIsolationAdapter,
  WorkspaceIsolationLease,
  WorkspaceIsolationRequest
} from "@wanex/workspace/isolation"
import { WorkspaceTaskRuntime } from "@wanex/workspace/tasks"
import { createEvalScenario } from "../runner.js"
import { assert } from "../scenario-utils.js"

export const workspaceTaskMultiAgentConflictScenario = createEvalScenario({
  id: "workspace-task.multi-agent-conflict",
  title: "Competing agent workspace task outputs stop at proposal review",
  tags: ["workspace", "workspace-task", "multi-agent"],
  async run(context) {
    const isolationRoot = await mkdtemp(
      join(tmpdir(), "wanex-eval-workspace-task-isolation-")
    )
    const isolation = new EvalIsolationAdapter(isolationRoot)
    try {
      const tasks = new WorkspaceTaskRuntime({
        storage: context.storage,
        isolation,
        workspaceId: "eval_workspace_task",
        principalId: "agent_eval_workspace_task"
      })
      const workspace = new WorkspaceRuntime({
        storage: context.storage,
        rootDir: context.workspaceRootDir,
        workspaceId: "eval_workspace_task",
        principalId: "agent_eval_workspace_task"
      })
      const proposals = new WorkspaceProposalApplyRuntime({
        storage: context.storage,
        workspace,
        actorId: "eval-workspace-task"
      })

      const [agentA, agentB] = await Promise.all([
        tasks.runTask({
          id: "wtsk_eval_agent_a",
          jobId: "job_eval_agent_a",
          agentId: "agent_a",
          handler: () => ({
            changeSet: {
              id: "cs_eval_agent_a_conflict",
              title: "Agent A edit",
              changes: [
                {
                  path: "src/shared.ts",
                  kind: "create",
                  targetText: "export const owner = 'agent-a'\n"
                }
              ]
            }
          })
        }),
        tasks.runTask({
          id: "wtsk_eval_agent_b",
          jobId: "job_eval_agent_b",
          agentId: "agent_b",
          handler: () => ({
            changeSet: {
              id: "cs_eval_agent_b_conflict",
              title: "Agent B edit",
              changes: [
                {
                  path: "src/shared.ts",
                  kind: "create",
                  targetText: "export const owner = 'agent-b'\n"
                }
              ]
            }
          })
        })
      ])

      assert(agentA.status === "succeeded", "agent A task should succeed")
      assert(agentB.status === "succeeded", "agent B task should succeed")
      assert(
        agentA.changeSet?.currentState === "submitted",
        "agent A changeset should be submitted"
      )
      assert(
        agentB.changeSet?.currentState === "submitted",
        "agent B changeset should be submitted"
      )

      await promoteEvalChangeSetToApplyRequestedProposal(context.storage, {
        proposalId: "wcp_eval_agent_a_conflict",
        changeSetId: "cs_eval_agent_a_conflict",
        reviewerId: "reviewer_eval_agent_a"
      })
      await promoteEvalChangeSetToApplyRequestedProposal(context.storage, {
        proposalId: "wcp_eval_agent_b_conflict",
        changeSetId: "cs_eval_agent_b_conflict",
        reviewerId: "reviewer_eval_agent_b"
      })

      const plan = await proposals.planApplyProposalBatch({
        items: [
          { proposalId: "wcp_eval_agent_a_conflict" },
          { proposalId: "wcp_eval_agent_b_conflict" }
        ]
      })
      assert(plan.status === "needs_review", "same-path plan should need review")

      const apply = await proposals.applyProposalBatch({
        items: [
          { proposalId: "wcp_eval_agent_a_conflict" },
          { proposalId: "wcp_eval_agent_b_conflict" }
        ]
      })
      assert(apply.status === "failed", "review-blocked batch should fail closed")
      assert(
        apply.results.some((item) => item.status === "needs_review"),
        "one item should be marked needs_review"
      )

      let activeWorkspaceWritten = true
      try {
        await readFile(join(context.workspaceRootDir, "src/shared.ts"), "utf8")
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          activeWorkspaceWritten = false
        } else {
          throw error
        }
      }
      assert(
        activeWorkspaceWritten === false,
        "active workspace should remain unchanged"
      )

      return {
        taskStatuses: [agentA.status, agentB.status],
        planStatus: plan.status,
        applyStatus: apply.status,
        conflictCount: plan.items.flatMap((item) => item.conflicts).length,
        activeWorkspaceWritten
      }
    } finally {
      await rm(isolationRoot, { recursive: true, force: true })
    }
  }
})

class EvalIsolationAdapter implements WorkspaceIsolationAdapter {
  private next = 0

  constructor(private readonly rootParent: string) {}

  async prepare(
    request: WorkspaceIsolationRequest = {}
  ): Promise<WorkspaceIsolationLease> {
    this.next += 1
    const id = `eval_lease_${this.next}`
    const rootDir = join(this.rootParent, id)
    await mkdir(rootDir, { recursive: true })
    return {
      id,
      kind: "fixed",
      rootDir,
      createdAt: Date.now(),
      releasePolicy: request.releasePolicy ?? "remove",
      ...(request.workspaceId === undefined
        ? {}
        : { workspaceId: request.workspaceId }),
      ...(request.jobId === undefined ? {} : { jobId: request.jobId }),
      ...(request.agentId === undefined ? {} : { agentId: request.agentId }),
      ...(request.metadata === undefined ? {} : { metadata: request.metadata })
    }
  }

  async release(lease: WorkspaceIsolationLease): Promise<void> {
    await rm(lease.rootDir, { recursive: true, force: true })
  }
}

async function promoteEvalChangeSetToApplyRequestedProposal(
  storage: EvalStore,
  input: {
    readonly proposalId: string
    readonly changeSetId: string
    readonly reviewerId: string
  }
): Promise<void> {
  await storage.putWorkspaceChangeProposal({
    id: input.proposalId,
    workspaceId: "eval_workspace_task",
    principalId: "agent_eval_workspace_task",
    changeSetId: input.changeSetId
  })
  await storage.recordWorkspaceChangeProposalOperation({
    proposalId: input.proposalId,
    operation: "approve",
    actorId: input.reviewerId
  })
  await storage.recordWorkspaceChangeProposalOperation({
    proposalId: input.proposalId,
    operation: "request_apply",
    actorId: input.reviewerId
  })
}
