export {
  WorkspaceGitRuntime,
  WANEX_WORKSPACE_GIT
} from "./runtime.js"
export {
  probeWorkspaceGitCapability,
  resolveWorkspaceStrategy
} from "./capability.js"
export type {
  ProbeWorkspaceGitCapabilityOptions,
  ResolveWorkspaceStrategyOptions,
  WorkspaceExecutionStrategy,
  WorkspaceGitCapability,
  WorkspaceGitCapabilityStatus,
  WorkspaceStrategyResolution
} from "./capability.js"
export type {
  CollectWorktreeRequest,
  EmptyWorktreeProjection,
  GitWorktreeDiffEntry,
  GitWorktreeDiffStatus,
  WorktreeAttentionProjection,
  WorkspaceGitRuntimeOptions,
  WorktreeChangeCollection,
  WorktreeCollection
} from "./types.js"
export {
  GitProjectionError,
  projectionAttention,
  projectionAttentionToJson
} from "./projection.js"
export type { GitProjectionAttention, GitProjectionAttentionCode } from "./projection.js"
