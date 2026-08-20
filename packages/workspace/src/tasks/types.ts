import type {
  JsonValue,
  PrincipalId,
  ResourceRecord,
  WorkspaceChangeProposalRecord,
  WorkspaceChangeSetRecord,
  WorkspaceTaskAccess
} from "@wanex/protocol"
import type { ProviderArtifactOutput } from "@wanex/runtime/resources"
import type { ChildSupervisor, ExecutionHost } from "@wanex/runtime/execution"
import type { WorkspaceTaskStore } from "./storage.js"
import type { WorkspaceIsolationAdapter } from "../isolation/index.js"
import type { WorkspaceGitRuntime } from "../git/index.js"
import type { WorkspaceTaskRuntime } from "./runtime.js"

export type WorkspaceTaskStatus = "succeeded" | "failed"

export interface WorkspaceTaskRuntimeOptions {
  readonly storage: WorkspaceTaskStore
  readonly readOnlyIsolation: WorkspaceIsolationAdapter
  readonly writableIsolation: WorkspaceIsolationAdapter
  readonly writableCollection: WorkspaceGitRuntime
  readonly repositoryId: string
  readonly ownerId?: PrincipalId
  readonly leaseMs?: number
  readonly workspaceId?: string
  readonly principalId?: PrincipalId
  readonly childSupervisor?: ChildSupervisor
}

export interface WorkspaceTaskRequest {
  readonly access: WorkspaceTaskAccess
  readonly input: JsonValue
  readonly id?: string
  readonly workspaceId?: string
  readonly principalId?: PrincipalId
  readonly jobId?: string
  readonly agentId?: string
  readonly handler: WorkspaceTaskHandler
}

export interface RecoverWorkspaceTaskRequest {
  readonly runId: string
}

export interface WorkspaceTaskContext {
  readonly taskId: string
  readonly workspaceId: string
  readonly principalId: PrincipalId
  readonly access: WorkspaceTaskAccess
  readonly input: JsonValue
  readonly rootDir: string
  readonly executionHost?: ExecutionHost
}

export type WorkspaceTaskHandler = (
  context: WorkspaceTaskContext
) => Promise<WorkspaceTaskHandlerResult> | WorkspaceTaskHandlerResult

export interface WorkspaceTaskHandlerResult {
  readonly artifacts?: readonly ProviderArtifactOutput[]
  readonly summary?: string
}

export interface WorkspaceTaskReceipt {
  readonly taskId: string
  readonly status: WorkspaceTaskStatus
  readonly access: WorkspaceTaskAccess
  readonly workspaceId: string
  readonly principalId: PrincipalId
  readonly resources: readonly ResourceRecord[]
  readonly changeSet?: WorkspaceChangeSetRecord
  readonly proposal?: WorkspaceChangeProposalRecord
  readonly summary?: string
  readonly error?: WorkspaceTaskError
}

export interface WorkspaceTaskError {
  readonly message: string
  readonly name?: string
}

export interface WorkspaceTaskJobPayload {
  readonly handlerId: string
  readonly access: WorkspaceTaskAccess
  readonly input: JsonValue
  readonly taskId?: string
  readonly workspaceId?: string
  readonly principalId?: PrincipalId
  readonly jobId?: string
  readonly agentId?: string
}

export interface SubmitWorkspaceTaskJobRequest {
  readonly id?: string
  readonly handlerId: string
  readonly principalId: PrincipalId
  readonly access: WorkspaceTaskAccess
  readonly input: JsonValue
  readonly taskId?: string
  readonly workspaceId?: string
  readonly jobId?: string
  readonly agentId?: string
  readonly scheduledAt?: number
  readonly notBefore?: number
  readonly priority?: number
  readonly maxAttempts?: number
  readonly idempotencyKey?: string
}

export interface WorkspaceTaskJobHandlerOptions {
  readonly runtime: WorkspaceTaskRuntime
  readonly handlers: ReadonlyMap<string, WorkspaceTaskHandler> | Record<string, WorkspaceTaskHandler>
}

export interface WorkspaceTaskJobResult {
  readonly taskId: string
  readonly status: WorkspaceTaskStatus
  readonly access: WorkspaceTaskAccess
  readonly workspaceId: string
  readonly principalId: PrincipalId
  readonly resourceIds: readonly string[]
  readonly changeSetId?: string
  readonly proposalId?: string
  readonly summary?: string
  readonly error?: WorkspaceTaskError
}

export class WorkspaceTaskJobFailedError extends Error {
  readonly result: WorkspaceTaskJobResult

  constructor(result: WorkspaceTaskJobResult) {
    super(result.error?.message ?? `workspace task failed: ${result.taskId}`)
    this.name = "WorkspaceTaskJobFailedError"
    this.result = result
  }
}
