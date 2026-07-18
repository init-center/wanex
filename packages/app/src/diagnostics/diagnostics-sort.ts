import type { AppActivityEntry, AppDiagnosticEntry } from "./diagnostics-types.js"

export function sortDiagnosticEntries(
  entries: readonly AppDiagnosticEntry[]
): AppDiagnosticEntry[] {
  return [...entries].sort(
    (left, right) => right.at - left.at || left.id.localeCompare(right.id)
  )
}

export function sortActivityEntries(
  entries: readonly AppActivityEntry[]
): AppActivityEntry[] {
  return [...entries].sort(
    (left, right) => right.at - left.at || left.id.localeCompare(right.id)
  )
}
