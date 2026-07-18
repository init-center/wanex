export const WANEX_WORKSPACE_CHANGESETS = "wanex-workspace-changesets" as const

export { ChangeSetApplier } from "./applier.js"
export { sha256Text } from "./hash.js"
export { mergeText } from "./merge.js"
export { LocalWorkspace } from "./workspace.js"
export type {
  AppliedFileChange,
  ChangeApplyStatus,
  ChangeSet,
  ChangeSetReceipt,
  FileChange,
  FileChangeKind,
  FileConflict,
  Workspace
} from "./types.js"
