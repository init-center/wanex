export const WANEX_WORKSPACE_TASKS = "wanex-workspace-tasks" as const

export { WorkspaceTaskRuntime } from "./runtime.js"
export {
  workspaceTaskJobResultFromReceipt,
  workspaceTaskJobResultToJson
} from "./codec.js"
export {
  createWorkspaceTaskJobHandler,
  registerWorkspaceTaskJobHandler,
  submitWorkspaceTaskJob
} from "./job.js"
export { recoverExpiredWorkspaceTasks } from "./recovery-admission.js"
export type {
  SubmitWorkspaceTaskJobRequest,
  RecoverWorkspaceTaskRequest,
  WorkspaceTaskContext,
  WorkspaceTaskError,
  WorkspaceTaskHandler,
  WorkspaceTaskHandlerResult,
  WorkspaceTaskJobHandlerOptions,
  WorkspaceTaskJobPayload,
  WorkspaceTaskJobResult,
  WorkspaceTaskReceipt,
  WorkspaceTaskRequest,
  WorkspaceTaskRuntimeOptions,
  WorkspaceTaskRecoveryAdmissionDiagnostic,
  WorkspaceTaskRecoveryAdmissionDiagnosticCode,
  WorkspaceTaskRecoveryAdmissionEntry,
  WorkspaceTaskRecoveryAdmissionOutcome,
  WorkspaceTaskRecoveryAdmissionRequest,
  WorkspaceTaskRecoveryAdmissionResult,
  WorkspaceTaskStatus
} from "./types.js"
export type { WorkspaceTaskAccess } from "@wanex/protocol"
export { WorkspaceTaskJobFailedError } from "./types.js"
