import type { ChangeSet } from "./types.js"

export function validateChangeSet(changeSet: ChangeSet): void {
  if (changeSet.id.length === 0) {
    throw new Error("changeset id must not be empty")
  }
  if (changeSet.changes.length === 0) {
    throw new Error("changeset must include at least one file change")
  }
  const paths = new Set<string>()
  for (const change of changeSet.changes) {
    if (change.path.length === 0) {
      throw new Error("file change path must not be empty")
    }
    if (paths.has(change.path)) {
      throw new Error(`changeset contains duplicate path: ${change.path}`)
    }
    paths.add(change.path)
    if (change.kind !== "delete" && change.targetText === undefined) {
      throw new Error(`file change targetText is required: ${change.path}`)
    }
  }
}
