import type {
  DelegationGraphId,
  PlanProposalId,
  PrincipalId,
  SchedulerJobId,
  SessionId,
  SessionInputId,
  SessionRunId,
  WorkspaceChangeProposalId
} from "./ids.js"
import type { JsonValue } from "./json.js"

export type ObjectiveRunState =
  | "open"
  | "running"
  | "blocked"
  | "succeeded"
  | "failed"
  | "cancelled"

export type ObjectiveRunOperationKind =
  | "start"
  | "record_blocked"
  | "mark_succeeded"
  | "mark_failed"
  | "cancel"

export type ObjectiveAttemptState =
  | "planned"
  | "running"
  | "succeeded"
  | "failed"
  | "blocked"
  | "cancelled"

export type ObjectiveVerificationKind = "script" | "model" | "human" | "runtime"

export type ObjectiveVerificationState =
  | "passed"
  | "failed"
  | "inconclusive"
  | "blocked"

export interface ObjectiveStopPolicy {
  readonly maxAttempts?: number
  readonly maxElapsedMs?: number
  readonly maxTokens?: number
  readonly repeatedBlockThreshold?: number
  readonly requireVerification?: boolean
  readonly metadata?: JsonValue
}

export type ObjectiveReferenceKind =
  | "session"
  | "session_input"
  | "session_run"
  | "scheduler_job"
  | "plan_proposal"
  | "workspace_change_proposal"
  | "delegation_graph"
  | "resource"
  | "context_epoch"

export interface ObjectiveReference {
  readonly kind: ObjectiveReferenceKind
  readonly id: string
  readonly role?: string
  readonly metadata?: JsonValue
}

export interface ObjectiveRunRecord {
  readonly id: string
  readonly principalId: PrincipalId
  readonly objective: string
  readonly scope?: string
  readonly constraints?: readonly string[]
  readonly successCriteria?: readonly string[]
  readonly stopPolicy?: ObjectiveStopPolicy
  readonly references: readonly ObjectiveReference[]
  readonly state: ObjectiveRunState
  readonly metadata?: JsonValue
  readonly createdAt: number
  readonly updatedAt: number
  readonly closedAt?: number
}

export interface ObjectiveRunOperationRecord {
  readonly id: string
  readonly objectiveId: string
  readonly operation: ObjectiveRunOperationKind
  readonly actorId: PrincipalId
  readonly fromState: ObjectiveRunState
  readonly toState: ObjectiveRunState
  readonly reason?: string
  readonly metadata?: JsonValue
  readonly createdAt: number
}

export interface ObjectiveAttemptRecord {
  readonly id: string
  readonly objectiveId: string
  readonly attemptNumber: number
  readonly state: ObjectiveAttemptState
  readonly sessionId?: SessionId
  readonly sessionInputId?: SessionInputId
  readonly sessionRunId?: SessionRunId
  readonly schedulerJobId?: SchedulerJobId
  readonly delegationGraphId?: DelegationGraphId
  readonly planProposalId?: PlanProposalId
  readonly workspaceChangeProposalId?: WorkspaceChangeProposalId
  readonly summary?: string
  readonly result?: JsonValue
  readonly error?: JsonValue
  readonly metadata?: JsonValue
  readonly startedAt?: number
  readonly finishedAt?: number
  readonly createdAt: number
  readonly updatedAt: number
}

export interface ObjectiveVerificationRecord {
  readonly id: string
  readonly objectiveId: string
  readonly attemptId?: string
  readonly kind: ObjectiveVerificationKind
  readonly state: ObjectiveVerificationState
  readonly reason?: string
  readonly evidence?: JsonValue
  readonly verifierRef?: string
  readonly metadata?: JsonValue
  readonly createdAt: number
}

export interface PutObjectiveRunRequest {
  readonly id?: string
  readonly principalId: PrincipalId
  readonly objective: string
  readonly scope?: string
  readonly constraints?: readonly string[]
  readonly successCriteria?: readonly string[]
  readonly stopPolicy?: ObjectiveStopPolicy
  readonly references?: readonly ObjectiveReference[]
  readonly metadata?: JsonValue
  readonly idempotencyKey?: string
}

export interface GetObjectiveRunRequest {
  readonly objectiveId: string
}

export interface ListObjectiveRunsRequest {
  readonly principalId?: PrincipalId
  readonly state?: ObjectiveRunState
  readonly referenceKind?: ObjectiveReferenceKind
  readonly referenceId?: string
  readonly limit?: number
}

export interface RecordObjectiveRunOperationRequest {
  readonly id?: string
  readonly objectiveId: string
  readonly operation: ObjectiveRunOperationKind
  readonly actorId: PrincipalId
  readonly reason?: string
  readonly metadata?: JsonValue
}

export interface ListObjectiveRunOperationsRequest {
  readonly objectiveId: string
}

export interface PutObjectiveAttemptRequest {
  readonly id?: string
  readonly objectiveId: string
  readonly attemptNumber?: number
  readonly state?: ObjectiveAttemptState
  readonly sessionId?: SessionId
  readonly sessionInputId?: SessionInputId
  readonly sessionRunId?: SessionRunId
  readonly schedulerJobId?: SchedulerJobId
  readonly delegationGraphId?: DelegationGraphId
  readonly planProposalId?: PlanProposalId
  readonly workspaceChangeProposalId?: WorkspaceChangeProposalId
  readonly summary?: string
  readonly result?: JsonValue
  readonly error?: JsonValue
  readonly metadata?: JsonValue
  readonly startedAt?: number
  readonly finishedAt?: number
  readonly idempotencyKey?: string
}

export interface ListObjectiveAttemptsRequest {
  readonly objectiveId: string
  readonly state?: ObjectiveAttemptState
  readonly limit?: number
}

export interface PutObjectiveVerificationRequest {
  readonly id?: string
  readonly objectiveId: string
  readonly attemptId?: string
  readonly kind: ObjectiveVerificationKind
  readonly state: ObjectiveVerificationState
  readonly reason?: string
  readonly evidence?: JsonValue
  readonly verifierRef?: string
  readonly metadata?: JsonValue
  readonly idempotencyKey?: string
}

export interface ListObjectiveVerificationsRequest {
  readonly objectiveId: string
  readonly attemptId?: string
  readonly state?: ObjectiveVerificationState
  readonly limit?: number
}
