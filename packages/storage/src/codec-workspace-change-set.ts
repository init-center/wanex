import {
  type JsonValue,
  type WorkspaceChangeSetRecord
} from "@wanex/protocol"

import {
  expectArray,
  expectJsonField,
  expectString,
  isRecord
} from "./codec-common.js"
import {
  workspaceFileChangeFromJson,
  workspaceFileChangeToJson
} from "./codec-workspace-file-change.js"

export function workspaceChangeSetToJson(
  changeSet: WorkspaceChangeSetRecord["changeSet"]
): JsonValue {
  return {
    id: changeSet.id,
    ...(changeSet.title === undefined ? {} : { title: changeSet.title }),
    ...(changeSet.baseRevision === undefined
      ? {}
      : { baseRevision: changeSet.baseRevision }),
    changes: changeSet.changes.map((change) => workspaceFileChangeToJson(change))
  }
}

export function workspaceChangeSetFromJson(
  value: JsonValue
): WorkspaceChangeSetRecord["changeSet"] {
  if (!isRecord(value)) {
    throw new Error("workspace changeset payload must be an object")
  }
  const changes = expectArray(
    expectJsonField(value, "changes", "workspace changeset changes"),
    "workspace changeset changes"
  )
  return {
    id: expectString(value.id, "workspace changeset payload.id"),
    ...(value.title === null || value.title === undefined
      ? {}
      : {
          title: expectString(
            value.title,
            "workspace changeset payload.title"
          )
        }),
    ...(value.baseRevision === null || value.baseRevision === undefined
      ? {}
      : {
          baseRevision: expectString(
            value.baseRevision,
            "workspace changeset payload.baseRevision"
          )
        }),
    changes: changes.map((change, index) =>
      workspaceFileChangeFromJson(change, index)
    )
  }
}
