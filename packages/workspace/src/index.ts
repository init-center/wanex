export { isTerminalWorkspaceChangeSetState } from "./history.js"
export { FileSystemWorkspaceMutationGate } from "./mutation-gate.js"
export { WANEX_WORKSPACE, WorkspaceRuntime } from "./runtime.js"
export type {
  ApplyWorkspaceChangeSetRequest,
  ApplyWorkspaceChangeSetResult,
  FileSystemWorkspaceMutationGateOptions,
  ListWorkspaceRuntimeChangeSetsRequest,
  UndoWorkspaceChangeSetRequest,
  UndoWorkspaceChangeSetResult,
  WorkspaceRuntimeOptions,
  WorkspaceChangeSetHistory,
  WorkspaceLockMetadata,
  WorkspaceMutationGate
} from "./types.js"
