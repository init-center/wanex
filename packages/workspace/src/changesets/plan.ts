import { sha256Optional } from "./hash.js"
import { planFileChange } from "./planner.js"
import { appliedFileRecord, conflictRecord } from "./records.js"
import { validateChangeSet } from "./validate.js"
import type {
  AppliedFileChange,
  ChangeSet,
  ChangeSetReceipt,
  FileConflict,
  WorkspaceReader
} from "./types.js"

export async function planChangeSetApply(
  workspace: WorkspaceReader,
  changeSet: ChangeSet
): Promise<ChangeSetReceipt> {
  validateChangeSet(changeSet)
  const files: AppliedFileChange[] = []
  const conflicts: FileConflict[] = []
  for (const change of changeSet.changes) {
    const plan = await planFileChange(workspace, change)
    if ("conflict" in plan) conflicts.push(plan.conflict)
    else files.push(plan.file)
  }
  if (conflicts.length > 0) {
    return {
      changeSetId: changeSet.id,
      status: "conflicted",
      files: [],
      conflicts
    }
  }
  return {
    changeSetId: changeSet.id,
    status: files.every((file) => file.beforeText === file.afterText)
      ? "already_applied"
      : "applied",
    files,
    conflicts: []
  }
}

export async function planChangeSetUndo(
  workspace: WorkspaceReader,
  source: ChangeSetReceipt
): Promise<ChangeSetReceipt> {
  if (source.status === "conflicted") {
    throw new Error("conflicted workspace receipt cannot be undone")
  }
  const conflicts: FileConflict[] = []
  for (const file of source.files) {
    const current = await workspace.readText(file.path)
    if (sha256Optional(current) !== file.afterSha256) {
      conflicts.push(conflictRecord(file.path, "undo_target_changed", {
        currentSha256: sha256Optional(current),
        expectedSha256: file.afterSha256
      }))
    }
  }
  if (conflicts.length > 0) {
    return {
      changeSetId: source.changeSetId,
      status: "conflicted",
      files: [],
      conflicts
    }
  }
  return {
    changeSetId: source.changeSetId,
    status: "applied",
    files: source.files.map((file) =>
      appliedFileRecord(
        { path: file.path, kind: file.kind, merged: false },
        {
          beforeText: file.afterText,
          afterText: file.beforeText,
          beforeSha256: file.afterSha256,
          afterSha256: file.beforeSha256
        }
      )
    ),
    conflicts: []
  }
}
