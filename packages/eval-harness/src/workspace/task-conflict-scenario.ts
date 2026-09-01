import { execFile } from "node:child_process"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { LocalRepositoryLocator, WorkspaceRuntime } from "@wanex/workspace"
import {
  NativeChildSupervisor,
  NativeExecutionEnvironment,
  type ExecutionScope
} from "@wanex/runtime/execution"
import { WorkspaceGitRuntime } from "@wanex/workspace/git"
import {
  FixedWorkspaceIsolationAdapter,
  GitWorktreeIsolationAdapter
} from "@wanex/workspace/isolation"
import { ProcessWorkspaceSnapshotClient } from "@wanex/workspace/snapshot"
import { WorkspaceProposalApplyRuntime } from "@wanex/workspace/review"
import { WorkspaceTaskRuntime } from "@wanex/workspace/tasks"
import type { EvalStore } from "../eval-storage.js"
import { createEvalScenario } from "../runner.js"
import { assert } from "../scenario-utils.js"

const execFileAsync = promisify(execFile)

export const workspaceTaskMultiAgentConflictScenario = createEvalScenario({
  id: "workspace-task.multi-agent-conflict",
  title: "Competing agent workspace task outputs stop at proposal review",
  tags: ["workspace", "workspace-task", "multi-agent"],
  async run(context) {
    const repoDir = await createRepo()
    const worktreeParentDir = await mkdtemp(
      join(tmpdir(), "wanex-eval-workspace-task-worktrees-")
    )
    const executionEnvironment = new NativeExecutionEnvironment({
      environmentId: "native_eval_workspace_task",
      managedProcess: true,
      strategy: {
        kind: "supervised",
        childSupervisor: new NativeChildSupervisor({ serviceBin: context.serviceBin })
      }
    })
    let repositoryScope: ExecutionScope | undefined
    try {
      repositoryScope = await executionEnvironment.bind({
        scopeId: "eval_workspace_task_repository",
        policy: {
          revision: 1,
          filesystem: {
            roots: [
              { id: "repository", effects: ["read", "write", "create", "remove"] },
              { id: "worktrees", effects: ["read", "write", "create", "remove"] },
              { id: "workspace", effects: ["read", "write", "create", "remove"] }
            ],
            maxReadBytes: 50 * 1024 * 1024,
            maxDirectoryEntries: 100_000
          },
          process: {
            oneShot: true,
            managed: true,
            cleanup: "durable_supervisor",
            environmentVariables: []
          },
          network: "unrestricted",
          isolation: "none",
          pty: false
        },
        fileSystemRoots: [
          { id: "repository", path: repoDir },
          { id: "worktrees", path: worktreeParentDir },
          { id: "workspace", path: context.workspaceRootDir }
        ]
      })
      const locator = new LocalRepositoryLocator({
        repositories: [{
          repositoryId: "repo_eval_workspace_task",
          repositoryRoot: repoDir,
          worktreeParent: worktreeParentDir,
          serviceBin: context.serviceBin,
          fileSystem: repositoryScope.fileSystem
        }]
      })
      const repository = await locator.locate("repo_eval_workspace_task")
      const isolation = new GitWorktreeIsolationAdapter({
        repositoryId: "repo_eval_workspace_task",
        locator,
        snapshot: new ProcessWorkspaceSnapshotClient(),
        executionScope: repositoryScope
      })
      const tasks = new WorkspaceTaskRuntime({
        storage: context.storage,
        readOnlyIsolation: new FixedWorkspaceIsolationAdapter({
          rootDir: repository.repositoryRoot,
          fileSystem: repositoryScope.fileSystem
        }),
        writableIsolation: isolation,
        writableCollection: new WorkspaceGitRuntime({
          repositoryId: "repo_eval_workspace_task",
          worktreeParent: repository.worktreeParent,
          executionScope: repositoryScope
        }),
        repositoryId: "repo_eval_workspace_task",
        workspaceId: "eval_workspace_task",
        principalId: "agent_eval_workspace_task",
        executionEnvironment
      })
      const workspace = new WorkspaceRuntime({
        storage: context.storage,
        rootDir: context.workspaceRootDir,
        serviceBin: context.serviceBin,
        executionScope: repositoryScope,
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
          access: "writable",
          input: { prompt: "make agent A own src/shared.ts" },
          jobId: "job_eval_agent_a",
          agentId: "agent_a",
          handler: async (task) => {
            await mkdir(join(task.rootDir, "src"), { recursive: true })
            await writeFile(
              join(task.rootDir, "src/shared.ts"),
              "export const owner = 'agent-a'\n",
              "utf8"
            )
            return { summary: "Agent A edit" }
          }
        }),
        tasks.runTask({
          id: "wtsk_eval_agent_b",
          access: "writable",
          input: { prompt: "make agent B own src/shared.ts" },
          jobId: "job_eval_agent_b",
          agentId: "agent_b",
          handler: async (task) => {
            await mkdir(join(task.rootDir, "src"), { recursive: true })
            await writeFile(
              join(task.rootDir, "src/shared.ts"),
              "export const owner = 'agent-b'\n",
              "utf8"
            )
            return { summary: "Agent B edit" }
          }
        })
      ])

      assert(agentA.status === "succeeded", "agent A task should succeed")
      assert(agentB.status === "succeeded", "agent B task should succeed")
      assert(
        agentA.changeSet?.currentState === "submitted" &&
          agentA.proposal?.state === "open",
        "agent A output should be projected to one open proposal"
      )
      assert(
        agentB.changeSet?.currentState === "submitted" &&
          agentB.proposal?.state === "open",
        "agent B output should be projected to one open proposal"
      )

      await approveAndRequestApply(
        context.storage,
        agentA.proposal.id,
        "reviewer_eval_agent_a"
      )
      await approveAndRequestApply(
        context.storage,
        agentB.proposal.id,
        "reviewer_eval_agent_b"
      )

      const items = [
        { proposalId: agentA.proposal.id },
        { proposalId: agentB.proposal.id }
      ]
      const plan = await proposals.planApplyProposalBatch({ items })
      assert(plan.status === "needs_review", "same-path plan should need review")

      const apply = await proposals.applyProposalBatch({ items })
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
      await repositoryScope?.close()
      await executionEnvironment.close()
      await rm(worktreeParentDir, { recursive: true, force: true })
      await rm(repoDir, { recursive: true, force: true })
    }
  }
})

async function approveAndRequestApply(
  storage: EvalStore,
  proposalId: string,
  reviewerId: string
): Promise<void> {
  await storage.recordWorkspaceChangeProposalOperation({
    proposalId,
    operation: "approve",
    actorId: reviewerId
  })
  await storage.recordWorkspaceChangeProposalOperation({
    proposalId,
    operation: "request_apply",
    actorId: reviewerId
  })
}

async function createRepo(): Promise<string> {
  const repoDir = await mkdtemp(join(tmpdir(), "wanex-eval-workspace-task-repo-"))
  await git(repoDir, ["init"])
  await git(repoDir, ["config", "user.email", "wanex@example.local"])
  await git(repoDir, ["config", "user.name", "Wanex Eval"])
  await git(repoDir, ["config", "core.autocrlf", "false"])
  await writeFile(join(repoDir, "README.md"), "base\n", "utf8")
  await git(repoDir, ["add", "README.md"])
  await git(repoDir, ["commit", "-m", "initial"])
  return repoDir
}

async function git(repoDir: string, args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", repoDir, ...args], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024
  })
  return stdout.trim()
}
