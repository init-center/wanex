import { sha256Optional } from "./hash.js"
import { planFileChange } from "./planner.js"
import { appliedFileRecord, conflictRecord } from "./records.js"
import { validateChangeSet } from "./validate.js"
import type {
  AppliedFileChange,
  ChangeSet,
  ChangeSetReceipt,
  FileConflict,
  Workspace
} from "./types.js"

export class ChangeSetApplier {
  private readonly workspace: Workspace

  constructor(workspace: Workspace) {
    this.workspace = workspace
  }

  async apply(changeSet: ChangeSet): Promise<ChangeSetReceipt> {
    validateChangeSet(changeSet)
    const planned: AppliedFileChange[] = []
    const conflicts: FileConflict[] = []

    for (const change of changeSet.changes) {
      const plan = await planFileChange(this.workspace, change)
      if ("conflict" in plan) {
        conflicts.push(plan.conflict)
      } else {
        planned.push(plan.file)
      }
    }

    if (conflicts.length > 0) {
      return {
        changeSetId: changeSet.id,
        status: "conflicted",
        files: [],
        conflicts
      }
    }

    const writes = planned.filter((file) => file.beforeText !== file.afterText)
    for (const file of writes) {
      if (file.afterText === undefined) {
        await this.workspace.delete(file.path)
      } else {
        await this.workspace.writeText(file.path, file.afterText)
      }
    }

    return {
      changeSetId: changeSet.id,
      status: writes.length === 0 ? "already_applied" : "applied",
      files: planned,
      conflicts: []
    }
  }

  async undo(receipt: ChangeSetReceipt): Promise<ChangeSetReceipt> {
    if (receipt.status === "conflicted") {
      return receipt
    }
    const conflicts: FileConflict[] = []
    for (const file of receipt.files) {
      const current = await this.workspace.readText(file.path)
      if (sha256Optional(current) !== file.afterSha256) {
        conflicts.push(
          conflictRecord(file.path, "undo_target_changed", {
            currentSha256: sha256Optional(current),
            expectedSha256: file.afterSha256
          })
        )
      }
    }
    if (conflicts.length > 0) {
      return {
        changeSetId: receipt.changeSetId,
        status: "conflicted",
        files: [],
        conflicts
      }
    }
    for (const file of [...receipt.files].reverse()) {
      if (file.beforeText === undefined) {
        await this.workspace.delete(file.path)
      } else {
        await this.workspace.writeText(file.path, file.beforeText)
      }
    }
    return {
      changeSetId: receipt.changeSetId,
      status: "applied",
      files: receipt.files.map((file) =>
        appliedFileRecord(
          {
            path: file.path,
            kind: file.kind,
            merged: false
          },
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
}
