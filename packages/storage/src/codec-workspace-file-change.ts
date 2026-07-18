import {
  type JsonValue,
  type WorkspaceFileChange
} from "@wanex/protocol"

import {
  expectString,
  isRecord,
  withOptionalFields
} from "./codec-common.js"
import { expectWorkspaceFileChangeKind } from "./codec-workspace-file-kind.js"

export function workspaceFileChangeToJson(
  change: WorkspaceFileChange
): JsonValue {
  return {
    path: change.path,
    kind: change.kind,
    ...(change.baseText === undefined ? {} : { baseText: change.baseText }),
    ...(change.baseSha256 === undefined
      ? {}
      : { baseSha256: change.baseSha256 }),
    ...(change.targetText === undefined ? {} : { targetText: change.targetText })
  }
}

export function workspaceFileChangeFromJson(
  value: JsonValue,
  index: number
): WorkspaceFileChange {
  if (!isRecord(value)) {
    throw new Error(`workspace file change ${index} must be an object`)
  }
  return withOptionalFields(
    {
      path: expectString(value.path, `workspace file change ${index}.path`),
      kind: expectWorkspaceFileChangeKind(
        value.kind,
        `workspace file change ${index}.kind`
      )
    },
    {
      baseText:
        value.baseText === null || value.baseText === undefined
          ? undefined
          : expectString(
              value.baseText,
              `workspace file change ${index}.baseText`
            ),
      baseSha256:
        value.baseSha256 === null || value.baseSha256 === undefined
          ? undefined
          : expectString(
              value.baseSha256,
              `workspace file change ${index}.baseSha256`
            ),
      targetText:
        value.targetText === null || value.targetText === undefined
          ? undefined
          : expectString(
              value.targetText,
              `workspace file change ${index}.targetText`
            )
    }
  )
}
