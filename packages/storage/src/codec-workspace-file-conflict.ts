import {
  type JsonValue,
  type WorkspaceFileConflict
} from "@wanex/protocol"

import { expectString, isRecord } from "./codec-common.js"

export function workspaceFileConflictToJson(
  conflict: WorkspaceFileConflict
): JsonValue {
  return {
    path: conflict.path,
    reason: conflict.reason,
    ...(conflict.currentSha256 === undefined
      ? {}
      : { currentSha256: conflict.currentSha256 }),
    ...(conflict.expectedSha256 === undefined
      ? {}
      : { expectedSha256: conflict.expectedSha256 })
  }
}

export function workspaceFileConflictFromJson(
  value: JsonValue,
  index: number
): WorkspaceFileConflict {
  if (!isRecord(value)) {
    throw new Error(`workspace file conflict ${index} must be an object`)
  }
  const reason = expectString(
    value.reason,
    `workspace file conflict ${index}.reason`
  )
  if (
    reason !== "missing_base" &&
    reason !== "base_hash_mismatch" &&
    reason !== "already_exists" &&
    reason !== "missing_file" &&
    reason !== "undo_target_changed"
  ) {
    throw new Error(`invalid workspace file conflict reason: ${reason}`)
  }
  return {
    path: expectString(value.path, `workspace file conflict ${index}.path`),
    reason,
    ...(value.currentSha256 === null || value.currentSha256 === undefined
      ? {}
      : {
          currentSha256: expectString(
            value.currentSha256,
            `workspace file conflict ${index}.currentSha256`
          )
        }),
    ...(value.expectedSha256 === null || value.expectedSha256 === undefined
      ? {}
      : {
          expectedSha256: expectString(
            value.expectedSha256,
            `workspace file conflict ${index}.expectedSha256`
          )
        })
  }
}
