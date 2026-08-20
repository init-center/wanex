import type { AppliedFileChange, FileConflict } from "./types.js"

export function appliedFileRecord(
  base: Pick<AppliedFileChange, "path" | "kind">,
  fields: {
    readonly beforeText?: string | undefined
    readonly afterText?: string | undefined
    readonly beforeSha256?: string | undefined
    readonly afterSha256?: string | undefined
  }
): AppliedFileChange {
  return withDefinedFields(base, fields)
}

export function conflictRecord(
  path: string,
  reason: FileConflict["reason"],
  fields: {
    readonly currentSha256?: string | undefined
    readonly expectedSha256?: string | undefined
  } = {}
): FileConflict {
  return withDefinedFields({ path, reason }, fields)
}

function withDefinedFields<T extends object>(
  base: T,
  fields: Record<string, unknown>
): T {
  const record = { ...base } as Record<string, unknown>
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      record[key] = value
    }
  }
  return record as T
}
