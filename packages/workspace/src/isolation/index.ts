export { removeDirectory } from "./fs.js"
export { FixedWorkspaceIsolationAdapter } from "./fixed-adapter.js"
export { GitWorktreeIsolationAdapter } from "./git-worktree-adapter.js"
export const WANEX_WORKSPACE_ISOLATION = "wanex-workspace-isolation" as const
export type {
  FixedWorkspaceIsolationAdapterOptions,
  GitWorktreeIsolationAdapterOptions,
  WorkspaceIsolationAdapter,
  WorkspaceIsolationDurableIdentity,
  WorkspaceIsolationKind,
  WorkspaceIsolationLease,
  WorkspaceIsolationRequest
} from "./types.js"
