import {
  type JsonValue,
  type WorkspaceAppliedFileChange
} from "@wanex/protocol"

import { expectBoolean, expectString, isRecord } from "./codec-common.js"
import { expectWorkspaceFileChangeKind } from "./codec-workspace-file-kind.js"

export function workspaceAppliedFileChangeToJson(
  file: WorkspaceAppliedFileChange
): JsonValue {
  return {
    path: file.path,
    kind: file.kind,
    merged: file.merged,
    ...(file.beforeText === undefined ? {} : { beforeText: file.beforeText }),
    ...(file.afterText === undefined ? {} : { afterText: file.afterText }),
    ...(file.beforeSha256 === undefined
      ? {}
      : { beforeSha256: file.beforeSha256 }),
    ...(file.afterSha256 === undefined ? {} : { afterSha256: file.afterSha256 })
  }
}

export function workspaceAppliedFileChangeFromJson(
  value: JsonValue,
  index: number
): WorkspaceAppliedFileChange {
  if (!isRecord(value)) {
    throw new Error(`workspace applied file change ${index} must be an object`)
  }
  return {
    path: expectString(value.path, `workspace applied file change ${index}.path`),
    kind: expectWorkspaceFileChangeKind(
      value.kind,
      `workspace applied file change ${index}.kind`
    ),
    merged: expectBoolean(
      value.merged,
      `workspace applied file change ${index}.merged`
    ),
    ...(value.beforeText === null || value.beforeText === undefined
      ? {}
      : {
          beforeText: expectString(
            value.beforeText,
            `workspace applied file change ${index}.beforeText`
          )
        }),
    ...(value.afterText === null || value.afterText === undefined
      ? {}
      : {
          afterText: expectString(
            value.afterText,
            `workspace applied file change ${index}.afterText`
          )
        }),
    ...(value.beforeSha256 === null || value.beforeSha256 === undefined
      ? {}
      : {
          beforeSha256: expectString(
            value.beforeSha256,
            `workspace applied file change ${index}.beforeSha256`
          )
        }),
    ...(value.afterSha256 === null || value.afterSha256 === undefined
      ? {}
      : {
          afterSha256: expectString(
            value.afterSha256,
            `workspace applied file change ${index}.afterSha256`
          )
        })
  }
}
