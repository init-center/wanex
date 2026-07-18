import {
  type JsonValue,
  type WorkspaceChangeSetReceipt
} from "@wanex/protocol"

import {
  expectArray,
  expectJsonField,
  expectString,
  isRecord
} from "./codec-common.js"
import {
  workspaceAppliedFileChangeFromJson,
  workspaceAppliedFileChangeToJson
} from "./codec-workspace-applied-file-change.js"
import { expectWorkspaceChangeApplyStatus } from "./codec-workspace-value-enums.js"
import {
  workspaceFileConflictFromJson,
  workspaceFileConflictToJson
} from "./codec-workspace-file-conflict.js"

export function workspaceChangeReceiptToJson(
  receipt: WorkspaceChangeSetReceipt
): JsonValue {
  return {
    changeSetId: receipt.changeSetId,
    status: receipt.status,
    files: receipt.files.map((file) => workspaceAppliedFileChangeToJson(file)),
    conflicts: receipt.conflicts.map((conflict) =>
      workspaceFileConflictToJson(conflict)
    )
  }
}

export function workspaceChangeReceiptFromJson(
  value: JsonValue
): WorkspaceChangeSetReceipt {
  if (!isRecord(value)) {
    throw new Error("workspace change receipt must be an object")
  }
  const files = expectArray(
    expectJsonField(value, "files", "workspace change receipt files"),
    "workspace change receipt files"
  )
  const conflicts = expectArray(
    expectJsonField(value, "conflicts", "workspace change receipt conflicts"),
    "workspace change receipt conflicts"
  )
  return {
    changeSetId: expectString(
      value.changeSetId,
      "workspace change receipt.changeSetId"
    ),
    status: expectWorkspaceChangeApplyStatus(
      value.status,
      "workspace change receipt.status"
    ),
    files: files.map((file, index) =>
      workspaceAppliedFileChangeFromJson(file, index)
    ),
    conflicts: conflicts.map((conflict, index) =>
      workspaceFileConflictFromJson(conflict, index)
    )
  }
}
