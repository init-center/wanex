import type { BudgetLimit } from "./budget.js"
import type {
  ObjectiveAttemptId,
  ObjectiveAttemptReviewId,
  ObjectiveId,
  ObjectiveVerificationId,
  PrincipalId,
  SessionId,
  SessionInputId,
  SessionTurnId
} from "./ids.js"
import type {
  RequestSessionTurnCancelReceipt,
  SubmitSessionTurnReceipt,
  SubmitSessionTurnRequest
} from "./session.js"

export type ObjectiveState =
  | "active"
  | "paused"
  | "blocked"
  | "limit_reached"
  | "succeeded"
  | "failed"
  | "cancel_requested"
  | "cancelled"

export type ObjectiveAttemptTrigger =
  | "initial"
  | "automatic_continuation"
  | "user_resume"

export type ObjectiveAttemptDisposition =
  | "continue"
  | "blocked"
  | "succeeded"
  | "failed"

export type ObjectiveVerifierKind = "model" | "script" | "human" | "runtime"

export type ObjectiveVerificationResult =
  | "passed"
  | "failed"
  | "inconclusive"
  | "blocked"

export type ObjectiveVerificationEvidenceKind =
  | "provider_output"
  | "resource"
  | "tool_execution"
  | "runtime_projection"
  | "human_attestation"

export type ObjectiveStateReasonCode =
  | "created"
  | "user_paused"
  | "user_resumed"
  | "verification_succeeded"
  | "verification_blocked"
  | "max_attempts"
  | "deadline"
  | "budget"
  | "verification_failed"
  | "cancel_requested"
  | "cancelled"
  | "unrecoverable_failure"

export interface ObjectiveStateReason {
  readonly code: ObjectiveStateReasonCode
  readonly detail?: string
}

export interface ObjectiveSuccessCriterion {
  readonly id: string
  readonly description: string
}

export interface ObjectiveVerificationRequirement {
  readonly id: string
  readonly criterionIds: readonly string[]
  readonly verifierKind: ObjectiveVerifierKind
  readonly verifierRef: string
}

export interface ObjectiveVerificationPolicy {
  readonly requirements: readonly ObjectiveVerificationRequirement[]
}

export interface ObjectiveStopPolicy {
  readonly maxAttempts: number
  readonly maxConsecutiveBlockedAttempts: number
  readonly deadlineAt?: number
  readonly budget?: BudgetLimit
}

export interface ObjectiveRecord {
  readonly id: ObjectiveId
  readonly sessionId: SessionId
  readonly principalId: PrincipalId
  readonly objective: string
  readonly boundaries: readonly string[]
  readonly constraints: readonly string[]
  readonly successCriteria: readonly ObjectiveSuccessCriterion[]
  readonly verificationPolicy: ObjectiveVerificationPolicy
  readonly stopPolicy: ObjectiveStopPolicy
  readonly revision: number
  readonly state: ObjectiveState
  readonly reason: ObjectiveStateReason
  readonly activeAttemptId?: ObjectiveAttemptId
  readonly createdAt: number
  readonly updatedAt: number
  readonly closedAt?: number
}

export interface ObjectiveAttemptRecord {
  readonly id: ObjectiveAttemptId
  readonly objectiveId: ObjectiveId
  readonly attemptNumber: number
  readonly inputId: SessionInputId
  readonly turnId: SessionTurnId
  readonly jobId: string
  readonly executionBindingDigest: string
  readonly trigger: ObjectiveAttemptTrigger
  readonly budgetGrantId?: string
  readonly idempotencyKey: string
  readonly boundAt: number
}

export interface ObjectiveVerificationEvidence {
  readonly kind: ObjectiveVerificationEvidenceKind
  readonly referenceId: string
  readonly digest: string
}

export interface ObjectiveVerificationRecord {
  readonly id: ObjectiveVerificationId
  readonly objectiveId: ObjectiveId
  readonly attemptId: ObjectiveAttemptId
  readonly requirementId: string
  readonly verifierKind: ObjectiveVerifierKind
  readonly verifierRef: string
  readonly result: ObjectiveVerificationResult
  readonly reason?: string
  readonly evidence: readonly ObjectiveVerificationEvidence[]
  readonly createdAt: number
}

export interface ObjectiveAttemptReviewRecord {
  readonly id: ObjectiveAttemptReviewId
  readonly objectiveId: ObjectiveId
  readonly attemptId: ObjectiveAttemptId
  readonly disposition: ObjectiveAttemptDisposition
  readonly reason?: string
  readonly createdAt: number
}

export interface CreateObjectiveRequest {
  readonly id?: ObjectiveId
  readonly sessionId: SessionId
  readonly principalId: PrincipalId
  readonly objective: string
  readonly boundaries?: readonly string[]
  readonly constraints?: readonly string[]
  readonly successCriteria: readonly ObjectiveSuccessCriterion[]
  readonly verificationPolicy: ObjectiveVerificationPolicy
  readonly stopPolicy: ObjectiveStopPolicy
  readonly idempotencyKey: string
}

export interface GetObjectiveRequest {
  readonly objectiveId: ObjectiveId
}

export interface ListObjectivesRequest {
  readonly sessionId?: SessionId
  readonly principalId?: PrincipalId
  readonly states?: readonly ObjectiveState[]
  readonly limit?: number
}

export interface PauseObjectiveRequest {
  readonly objectiveId: ObjectiveId
  readonly expectedRevision: number
  readonly reason?: string
  readonly idempotencyKey: string
}

export interface ResumeObjectiveRequest {
  readonly objectiveId: ObjectiveId
  readonly expectedRevision: number
  readonly reason?: string
  readonly idempotencyKey: string
}

export interface AdmitObjectiveAttemptRequest {
  readonly objectiveId: ObjectiveId
  readonly expectedRevision: number
  readonly trigger: ObjectiveAttemptTrigger
  readonly idempotencyKey: string
  readonly turn: SubmitSessionTurnRequest
}

export interface ObjectiveAttemptAdmittedReceipt {
  readonly status: "admitted"
  readonly objective: ObjectiveRecord
  readonly attempt: ObjectiveAttemptRecord
  readonly submission: SubmitSessionTurnReceipt
}

export interface ObjectiveAttemptLimitReachedReceipt {
  readonly status: "limit_reached"
  readonly objective: ObjectiveRecord
}

export type AdmitObjectiveAttemptReceipt =
  | ObjectiveAttemptAdmittedReceipt
  | ObjectiveAttemptLimitReachedReceipt

export interface ObjectiveVerificationSubmission {
  readonly requirementId: string
  readonly verifierKind: ObjectiveVerifierKind
  readonly verifierRef: string
  readonly result: ObjectiveVerificationResult
  readonly reason?: string
  readonly evidence: readonly ObjectiveVerificationEvidence[]
}

export interface ReviewObjectiveAttemptRequest {
  readonly id?: ObjectiveAttemptReviewId
  readonly objectiveId: ObjectiveId
  readonly attemptId: ObjectiveAttemptId
  readonly expectedRevision: number
  readonly disposition: ObjectiveAttemptDisposition
  readonly reason?: string
  readonly verifications: readonly ObjectiveVerificationSubmission[]
  readonly idempotencyKey: string
}

export interface ReviewObjectiveAttemptReceipt {
  readonly objective: ObjectiveRecord
  readonly attempt: ObjectiveAttemptRecord
  readonly review: ObjectiveAttemptReviewRecord
  readonly verifications: readonly ObjectiveVerificationRecord[]
}

export interface RequestObjectiveCancelRequest {
  readonly objectiveId: ObjectiveId
  readonly expectedRevision: number
  readonly reason: string
  readonly idempotencyKey: string
}

export interface RequestObjectiveCancelReceipt {
  readonly objective: ObjectiveRecord
  readonly turnCancellation?: RequestSessionTurnCancelReceipt
}

export interface ReconcileObjectiveCancellationRequest {
  readonly objectiveId: ObjectiveId
  readonly attemptId: ObjectiveAttemptId
  readonly expectedRevision: number
  readonly idempotencyKey: string
}

export interface ListObjectiveAttemptsRequest {
  readonly objectiveId: ObjectiveId
  readonly limit?: number
}

export interface ListObjectiveAttemptReviewsRequest {
  readonly objectiveId: ObjectiveId
  readonly attemptId?: ObjectiveAttemptId
  readonly limit?: number
}

export interface ListObjectiveVerificationsRequest {
  readonly objectiveId: ObjectiveId
  readonly attemptId?: ObjectiveAttemptId
  readonly requirementId?: string
  readonly result?: ObjectiveVerificationResult
  readonly limit?: number
}
