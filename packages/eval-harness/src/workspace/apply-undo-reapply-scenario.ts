import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { WorkspaceRuntime } from "@wanex/workspace"
import { createEvalScenario } from "../runner.js"
import { assert } from "../scenario-utils.js"

export const workspaceApplyUndoReapplyScenario = createEvalScenario({
  id: "workspace.apply-undo-reapply",
  title: "Workspace changes can be applied, undone, and reapplied",
  tags: ["workspace", "coding-agent"],
  async run(context) {
    const workspace = new WorkspaceRuntime({
      storage: context.storage,
      rootDir: context.workspaceRootDir,
      workspaceId: "eval_workspace_apply",
      principalId: "agent_eval_workspace_apply"
    })
    await mkdir(join(context.workspaceRootDir, "src"), { recursive: true })
    const targetPath = join(context.workspaceRootDir, "src/app.ts")
    await writeFile(targetPath, "one\n", "utf8")
    const changeSet = {
      id: "cs_eval_workspace_apply",
      title: "Update app",
      changes: [
        {
          path: "src/app.ts",
          kind: "update" as const,
          baseText: "one\n",
          targetText: "two\n"
        }
      ]
    }

    const applied = await workspace.applyChangeSet({ changeSet })
    assert(applied.receipt.status === "applied", "changeset should apply")
    assert((await readFile(targetPath, "utf8")) === "two\n", "file should update")

    const undone = await workspace.undoChangeSet({
      changeSetId: changeSet.id
    })
    assert(undone.changeSet.currentState === "undone", "changeset should undo")
    assert((await readFile(targetPath, "utf8")) === "one\n", "file should revert")

    const reapplied = await workspace.applyChangeSet({ changeSet })
    assert(
      reapplied.changeSet.currentState === "applied",
      "changeset should reapply"
    )
    assert((await readFile(targetPath, "utf8")) === "two\n", "file should reupdate")

    const history = await workspace.getHistory(changeSet.id)
    const operations =
      history?.operations.map((operation) => operation.operation) ?? []
    assert(
      operations.join(",") === "apply,undo,apply",
      "history should record apply, undo, apply"
    )
    return {
      state: reapplied.changeSet.currentState,
      operations
    }
  }
})
