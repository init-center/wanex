import { sha256Optional, sha256Text } from "./hash.js"
import { mergeText } from "./merge.js"
import { appliedFileRecord, conflictRecord } from "./records.js"
import type { FileChange, PlannedFileChange, WorkspaceReader } from "./types.js"

export async function planFileChange(
  workspace: WorkspaceReader,
  change: FileChange
): Promise<PlannedFileChange> {
  const current = await workspace.readText(change.path)
  const currentSha256 = sha256Optional(current)
  const baseText = change.baseText
  const baseSha256 = change.baseSha256 ?? sha256Optional(baseText)
  const targetSha256 = sha256Optional(change.targetText)

  if (change.kind === "create") {
    if (current !== null && currentSha256 !== targetSha256) {
      return {
        conflict: conflictRecord(change.path, "already_exists", {
          currentSha256
        })
      }
    }
    return {
      file: appliedFileRecord(
        {
          path: change.path,
          kind: change.kind,
          merged: false
        },
        {
          beforeText: current ?? undefined,
          afterText: change.targetText,
          beforeSha256: currentSha256,
          afterSha256: targetSha256
        }
      )
    }
  }

  if (current === null) {
    return {
      conflict: conflictRecord(change.path, "missing_file", {
        expectedSha256: baseSha256
      })
    }
  }
  if (baseText === undefined || baseSha256 === undefined) {
    return {
      conflict: conflictRecord(change.path, "missing_base", {
        currentSha256
      })
    }
  }
  if (currentSha256 === targetSha256) {
    return {
      file: appliedFileRecord(
        {
          path: change.path,
          kind: change.kind,
          merged: false
        },
        {
          beforeText: current,
          afterText: current,
          beforeSha256: currentSha256,
          afterSha256: currentSha256
        }
      )
    }
  }
  if (currentSha256 === baseSha256) {
    return {
      file: appliedFileRecord(
        {
          path: change.path,
          kind: change.kind,
          merged: false
        },
        {
          beforeText: current,
          afterText: change.kind === "delete" ? undefined : change.targetText,
          beforeSha256: currentSha256,
          afterSha256: change.kind === "delete" ? undefined : targetSha256
        }
      )
    }
  }
  if (change.kind === "delete") {
    return {
      conflict: conflictRecord(change.path, "base_hash_mismatch", {
        currentSha256,
        expectedSha256: baseSha256
      })
    }
  }
  const merged = mergeText(baseText, current, change.targetText ?? "")
  if (merged === null) {
    return {
      conflict: conflictRecord(change.path, "merge_conflict", {
        currentSha256,
        expectedSha256: baseSha256
      })
    }
  }
  return {
    file: appliedFileRecord(
      {
        path: change.path,
        kind: change.kind,
        merged: true
      },
      {
        beforeText: current,
        afterText: merged,
        beforeSha256: currentSha256,
        afterSha256: sha256Text(merged)
      }
    )
  }
}
