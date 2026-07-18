import type {
  JsonValue,
  ObjectiveAttemptRecord,
  ObjectiveAttemptState,
  ObjectiveReference,
  ObjectiveReferenceKind,
  ObjectiveRunOperationRecord,
  ObjectiveRunRecord,
  ObjectiveRunState,
  ObjectiveStopPolicy,
  ObjectiveVerificationKind,
  ObjectiveVerificationRecord,
  ObjectiveVerificationState,
  PrincipalId
} from "@wanex/protocol"
import type { ObjectiveStore } from "@wanex/storage/objective"

export const WANEX_APP_OBJECTIVE_WORKFLOW = "wanex-app-objective-workflow" as const

export interface ObjectiveWorkflowOptions {
  readonly storage: ObjectiveStore
  readonly principalId?: PrincipalId
}

export interface CreateObjectiveRequest {
  readonly id?: string
  readonly principalId?: PrincipalId
  readonly objective: string
  readonly scope?: string
  readonly constraints?: readonly string[]
  readonly successCriteria?: readonly string[]
  readonly stopPolicy?: ObjectiveStopPolicy
  readonly references?: readonly ObjectiveReference[]
  readonly metadata?: JsonValue
  readonly idempotencyKey?: string
}

export interface ObjectiveOperationRequest {
  readonly objectiveId: string
  readonly actorId?: PrincipalId
  readonly operationId?: string
  readonly reason?: string
  readonly metadata?: JsonValue
}

export interface RecordObjectiveAttemptRequest {
  readonly id?: string
  readonly objectiveId: string
  readonly attemptNumber?: number
  readonly state?: ObjectiveAttemptState
  readonly sessionId?: string
  readonly sessionInputId?: string
  readonly sessionRunId?: string
  readonly schedulerJobId?: string
  readonly delegationGraphId?: string
  readonly planProposalId?: string
  readonly workspaceChangeProposalId?: string
  readonly summary?: string
  readonly result?: JsonValue
  readonly error?: JsonValue
  readonly metadata?: JsonValue
  readonly startedAt?: number
  readonly finishedAt?: number
  readonly idempotencyKey?: string
}

export interface RecordObjectiveVerificationRequest {
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

export interface ListObjectivesRuntimeRequest {
  readonly principalId?: PrincipalId
  readonly state?: ObjectiveRunState
  readonly referenceKind?: ObjectiveReferenceKind
  readonly referenceId?: string
  readonly limit?: number
}

export interface ObjectiveHistory {
  readonly objective: ObjectiveRunRecord
  readonly operations: readonly ObjectiveRunOperationRecord[]
  readonly attempts: readonly ObjectiveAttemptRecord[]
  readonly verifications: readonly ObjectiveVerificationRecord[]
}
