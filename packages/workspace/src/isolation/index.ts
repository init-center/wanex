export { removeDirectory } from "./fs.js"
export { FixedWorkspaceIsolationAdapter } from "./fixed-adapter.js"
export { GitWorktreeIsolationAdapter } from "./git-worktree-adapter.js"
export { generatedBranchName, safePathSegment } from "./naming.js"
export const WANEX_WORKSPACE_ISOLATION = "wanex-workspace-isolation" as const
export type {
  FixedWorkspaceIsolationAdapterOptions,
  GitWorktreeIsolationAdapterOptions,
  WorkspaceIsolationAdapter,
  WorkspaceIsolationKind,
  WorkspaceIsolationLease,
  WorkspaceIsolationReleasePolicy,
  WorkspaceIsolationRequest
} from "./types.js"
