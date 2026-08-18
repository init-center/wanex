import type {
  AdmitObjectiveAttemptRequest,
  BudgetLimit,
  CreateObjectiveRequest,
  ListObjectiveAttemptReviewsRequest,
  ListObjectiveAttemptsRequest,
  ListObjectivesRequest,
  ListObjectiveVerificationsRequest,
  ObjectiveStopPolicy,
  ObjectiveVerificationSubmission,
  PauseObjectiveRequest,
  ReconcileObjectiveCancellationRequest,
  RequestObjectiveCancelRequest,
  ResumeObjectiveRequest,
  ReviewObjectiveAttemptRequest
} from "@wanex/protocol"

import { toRpcJsonValueFromUnknown } from "./codec-common.js"
import { toRpcSubmitSessionTurnRequest } from "./codec-session-requests.js"
import type {
  AdmitObjectiveAttemptWire,
  ChangeObjectiveStateWire,
  CreateObjectiveWire,
  ListObjectiveAttemptReviewsWire,
  ListObjectiveAttemptsWire,
  ListObjectivesWire,
  ListObjectiveVerificationsWire,
  ReconcileObjectiveCancellationWire,
  RequestObjectiveCancelWire,
  ReviewObjectiveAttemptWire
} from "./generated/storage-rpc.js"

export function toRpcCreateObjectiveRequest(
  request: CreateObjectiveRequest
): CreateObjectiveWire {
  return {
    id: request.id ?? null,
    session_id: request.sessionId,
    principal_id: request.principalId,
    objective: request.objective,
    boundaries: toRpcJsonValueFromUnknown(request.boundaries ?? []),
    constraints: toRpcJsonValueFromUnknown(request.constraints ?? []),
    success_criteria: toRpcJsonValueFromUnknown(request.successCriteria),
    verification_policy: toRpcJsonValueFromUnknown(request.verificationPolicy),
    stop_policy: objectiveStopPolicyToJson(request.stopPolicy),
    idempotency_key: request.idempotencyKey
  }
}

export function toRpcListObjectivesRequest(
  request: ListObjectivesRequest
): ListObjectivesWire {
  return {
    session_id: request.sessionId ?? null,
    principal_id: request.principalId ?? null,
    states: request.states === undefined ? null : [...request.states],
    limit: request.limit ?? null
  }
}

export function toRpcChangeObjectiveStateRequest(
  request: PauseObjectiveRequest | ResumeObjectiveRequest
): ChangeObjectiveStateWire {
  return {
    objective_id: request.objectiveId,
    expected_revision: request.expectedRevision,
    reason: request.reason ?? null,
    idempotency_key: request.idempotencyKey
  }
}

export function toRpcAdmitObjectiveAttemptRequest(
  request: AdmitObjectiveAttemptRequest
): AdmitObjectiveAttemptWire {
  return {
    objective_id: request.objectiveId,
    expected_revision: request.expectedRevision,
    trigger: request.trigger,
    idempotency_key: request.idempotencyKey,
    turn: toRpcSubmitSessionTurnRequest(request.turn)
  }
}

export function toRpcReviewObjectiveAttemptRequest(
  request: ReviewObjectiveAttemptRequest
): ReviewObjectiveAttemptWire {
  return {
    id: request.id ?? null,
    objective_id: request.objectiveId,
    attempt_id: request.attemptId,
    expected_revision: request.expectedRevision,
    disposition: request.disposition,
    reason: request.reason ?? null,
    verifications: toRpcJsonValueFromUnknown(
      request.verifications.map(verificationSubmissionToJson)
    ),
    idempotency_key: request.idempotencyKey
  }
}

export function toRpcRequestObjectiveCancelRequest(
  request: RequestObjectiveCancelRequest
): RequestObjectiveCancelWire {
  return {
    objective_id: request.objectiveId,
    expected_revision: request.expectedRevision,
    reason: request.reason,
    idempotency_key: request.idempotencyKey
  }
}

export function toRpcReconcileObjectiveCancellationRequest(
  request: ReconcileObjectiveCancellationRequest
): ReconcileObjectiveCancellationWire {
  return {
    objective_id: request.objectiveId,
    attempt_id: request.attemptId,
    expected_revision: request.expectedRevision,
    idempotency_key: request.idempotencyKey
  }
}

export function toRpcListObjectiveAttemptsRequest(
  request: ListObjectiveAttemptsRequest
): ListObjectiveAttemptsWire {
  return {
    objective_id: request.objectiveId,
    limit: request.limit ?? null
  }
}

export function toRpcListObjectiveAttemptReviewsRequest(
  request: ListObjectiveAttemptReviewsRequest
): ListObjectiveAttemptReviewsWire {
  return {
    objective_id: request.objectiveId,
    attempt_id: request.attemptId ?? null,
    limit: request.limit ?? null
  }
}

export function toRpcListObjectiveVerificationsRequest(
  request: ListObjectiveVerificationsRequest
): ListObjectiveVerificationsWire {
  return {
    objective_id: request.objectiveId,
    attempt_id: request.attemptId ?? null,
    requirement_id: request.requirementId ?? null,
    result: request.result ?? null,
    limit: request.limit ?? null
  }
}

function objectiveStopPolicyToJson(policy: ObjectiveStopPolicy) {
  return toRpcJsonValueFromUnknown({
    maxAttempts: policy.maxAttempts,
    maxConsecutiveBlockedAttempts: policy.maxConsecutiveBlockedAttempts,
    ...(policy.deadlineAt === undefined ? {} : { deadlineAt: policy.deadlineAt }),
    ...(policy.budget === undefined
      ? {}
      : { budget: objectiveBudgetLimitToJson(policy.budget) })
  })
}

function objectiveBudgetLimitToJson(budget: BudgetLimit) {
  return {
    ...(budget.tokens === undefined ? {} : { tokens: budget.tokens }),
    ...(budget.costMicros === undefined ? {} : { costMicros: budget.costMicros }),
    ...(budget.wallTimeMs === undefined
      ? {}
      : { wallTimeMs: budget.wallTimeMs }),
    ...(budget.toolCalls === undefined ? {} : { toolCalls: budget.toolCalls })
  }
}

function verificationSubmissionToJson(
  verification: ObjectiveVerificationSubmission
) {
  return {
    requirementId: verification.requirementId,
    verifierKind: verification.verifierKind,
    verifierRef: verification.verifierRef,
    result: verification.result,
    ...(verification.reason === undefined ? {} : { reason: verification.reason }),
    evidence: verification.evidence.map((evidence) => ({
      kind: evidence.kind,
      referenceId: evidence.referenceId,
      digest: evidence.digest
    }))
  }
}
