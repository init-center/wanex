import type { ChangeSet } from "../changesets/index.js"
import type {
  JsonValue,
  PrincipalId,
  ResourceRecord,
  WorkspaceChangeSetRecord
} from "@wanex/protocol"
import type { ProviderArtifactOutput } from "@wanex/runtime/resources"
import type { WorkspaceTaskStore } from "./storage.js"
import type {
  WorkspaceIsolationAdapter,
  WorkspaceIsolationLease,
  WorkspaceIsolationRequest
} from "../isolation/index.js"
import type { WorkspaceTaskRuntime } from "./runtime.js"

export type WorkspaceTaskStatus = "succeeded" | "failed"

export interface WorkspaceTaskRuntimeOptions {
  readonly storage: WorkspaceTaskStore
  readonly isolation: WorkspaceIsolationAdapter
  readonly workspaceId?: string
  readonly principalId?: PrincipalId
}

export interface WorkspaceTaskRequest {
  readonly id?: string
  readonly workspaceId?: string
  readonly principalId?: PrincipalId
  readonly jobId?: string
  readonly agentId?: string
  readonly isolation?: WorkspaceIsolationRequest
  readonly keepLease?: boolean
  readonly handler: WorkspaceTaskHandler
}

export interface WorkspaceTaskContext {
  readonly taskId: string
  readonly workspaceId: string
  readonly principalId: PrincipalId
  readonly lease: WorkspaceIsolationLease
  readonly rootDir: string
  readonly storage: WorkspaceTaskStore
}

export type WorkspaceTaskHandler = (
  context: WorkspaceTaskContext
) => Promise<WorkspaceTaskHandlerResult> | WorkspaceTaskHandlerResult

export interface WorkspaceTaskHandlerResult {
  readonly artifacts?: readonly ProviderArtifactOutput[]
  readonly changeSet?: ChangeSet
  readonly metadata?: Record<string, unknown>
}

export interface WorkspaceTaskReceipt {
  readonly taskId: string
  readonly status: WorkspaceTaskStatus
  readonly workspaceId: string
  readonly principalId: PrincipalId
  readonly lease: WorkspaceIsolationLease
  readonly released: boolean
  readonly resources: readonly ResourceRecord[]
  readonly changeSet?: WorkspaceChangeSetRecord
  readonly metadata?: Record<string, unknown>
  readonly error?: WorkspaceTaskError
}

export interface WorkspaceTaskError {
  readonly message: string
  readonly name?: string
}

export interface WorkspaceTaskJobPayload {
  readonly handlerId: string
  readonly taskId?: string
  readonly workspaceId?: string
  readonly principalId?: PrincipalId
  readonly jobId?: string
  readonly agentId?: string
  readonly keepLease?: boolean
  readonly isolation?: WorkspaceIsolationRequest
  readonly metadata?: Record<string, JsonValue>
}

export interface SubmitWorkspaceTaskJobRequest {
  readonly id?: string
  readonly handlerId: string
  readonly principalId: PrincipalId
  readonly taskId?: string
  readonly workspaceId?: string
  readonly jobId?: string
  readonly agentId?: string
  readonly keepLease?: boolean
  readonly isolation?: WorkspaceIsolationRequest
  readonly metadata?: Record<string, JsonValue>
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
  readonly workspaceId: string
  readonly principalId: PrincipalId
  readonly released: boolean
  readonly lease: JsonValue
  readonly resourceIds: readonly string[]
  readonly changeSetId?: string
  readonly metadata?: JsonValue
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
