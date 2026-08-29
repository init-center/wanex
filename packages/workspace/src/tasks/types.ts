import type {
  JsonValue,
  PrincipalId,
  ResourceRecord,
  WorkspaceChangeProposalRecord,
  WorkspaceChangeSetRecord,
  WorkspaceTaskAccess,
  WorkspaceTaskRunState
} from "@wanex/protocol"
import type { ProviderArtifactOutput } from "@wanex/runtime/resources"
import type {
  BorrowedExecutionScope,
  ExecutionEnvironment,
} from "@wanex/runtime/execution"
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
  readonly executionEnvironment: ExecutionEnvironment
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

export interface ResumeWorkspaceTaskRequest {
  readonly runId: string
  readonly input: JsonValue
  readonly handler: WorkspaceTaskHandler
}

export type WorkspaceTaskRecoveryAdmissionOutcome =
  | "released"
  | "attention"
  | "skipped"
  | "failed"

export type WorkspaceTaskRecoveryAdmissionDiagnosticCode =
  | "budget_exceeded"
  | "limit_reached"
  | "recovery_failed"

export interface WorkspaceTaskRecoveryAdmissionEntry {
  readonly runId: string
  readonly previousState: WorkspaceTaskRunState
  readonly outcome: WorkspaceTaskRecoveryAdmissionOutcome
}

export interface WorkspaceTaskRecoveryAdmissionDiagnostic {
  readonly code: WorkspaceTaskRecoveryAdmissionDiagnosticCode
}

export interface WorkspaceTaskRecoveryAdmissionResult {
  readonly attempted: number
  readonly released: number
  readonly attention: number
  readonly skipped: number
  readonly failed: number
  readonly remaining: boolean
  readonly entries: readonly WorkspaceTaskRecoveryAdmissionEntry[]
  readonly diagnostics: readonly WorkspaceTaskRecoveryAdmissionDiagnostic[]
}

export interface WorkspaceTaskRecoveryAdmissionRequest {
  readonly workspaceId?: string
  readonly maxRuns?: number
  readonly budgetMs?: number
}

export interface WorkspaceTaskContext {
  readonly taskId: string
  readonly workspaceId: string
  readonly principalId: PrincipalId
  readonly access: WorkspaceTaskAccess
  readonly input: JsonValue
  readonly rootDir: string
  readonly executionScope: BorrowedExecutionScope
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
  readonly details?: JsonValue
}

export class WorkspaceTaskAttentionError extends Error {
  readonly failure: WorkspaceTaskError

  constructor(failure: WorkspaceTaskError) {
    super(failure.message)
    this.name = failure.name ?? "WorkspaceTaskAttentionError"
    this.failure = failure
  }
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
