import type {
  AdmitObjectiveAttemptReceipt,
  BudgetLimit,
  JsonValue,
  ObjectiveAttemptDisposition,
  ObjectiveAttemptRecord,
  ObjectiveAttemptReviewRecord,
  ObjectiveAttemptTrigger,
  ObjectiveRecord,
  ObjectiveState,
  ObjectiveStateReason,
  ObjectiveStateReasonCode,
  ObjectiveStopPolicy,
  ObjectiveSuccessCriterion,
  ObjectiveVerificationEvidence,
  ObjectiveVerificationEvidenceKind,
  ObjectiveVerificationPolicy,
  ObjectiveVerificationRecord,
  ObjectiveVerificationRequirement,
  ObjectiveVerificationResult,
  ObjectiveVerifierKind,
  RequestObjectiveCancelReceipt,
  ReviewObjectiveAttemptReceipt
} from "@wanex/protocol"

import {
  expectArray,
  expectJsonField,
  expectNumber,
  expectString,
  isRecord,
  optionalNumber,
  optionalString,
  withOptionalFields
} from "./codec-helpers.js"
import { fromRpcSubmitSessionTurnReceipt } from "./codec-session-input-records.js"
import { fromRpcRequestSessionTurnCancelReceipt } from "./codec-session-turn-records.js"

const OBJECTIVE_STATES = [
  "active",
  "paused",
  "blocked",
  "limit_reached",
  "succeeded",
  "failed",
  "cancel_requested",
  "cancelled"
] as const satisfies readonly ObjectiveState[]

const OBJECTIVE_REASON_CODES = [
  "created",
  "user_paused",
  "user_resumed",
  "verification_succeeded",
  "verification_blocked",
  "max_attempts",
  "deadline",
  "budget",
  "verification_failed",
  "cancel_requested",
  "cancelled",
  "unrecoverable_failure"
] as const satisfies readonly ObjectiveStateReasonCode[]

const ATTEMPT_TRIGGERS = [
  "initial",
  "automatic_continuation",
  "user_resume"
] as const satisfies readonly ObjectiveAttemptTrigger[]

const ATTEMPT_DISPOSITIONS = [
  "continue",
  "blocked",
  "succeeded",
  "failed"
] as const satisfies readonly ObjectiveAttemptDisposition[]

const VERIFIER_KINDS = [
  "model",
  "script",
  "human",
  "runtime"
] as const satisfies readonly ObjectiveVerifierKind[]

const VERIFICATION_RESULTS = [
  "passed",
  "failed",
  "inconclusive",
  "blocked"
] as const satisfies readonly ObjectiveVerificationResult[]

const EVIDENCE_KINDS = [
  "provider_output",
  "resource",
  "tool_execution",
  "runtime_projection",
  "human_attestation"
] as const satisfies readonly ObjectiveVerificationEvidenceKind[]

export function fromRpcObjectiveRecord(value: JsonValue): ObjectiveRecord {
  const record = expectRecord(value, "objective")
  return withOptionalFields(
    {
      id: expectString(record.id, "objective.id"),
      sessionId: expectString(record.session_id, "objective.session_id"),
      principalId: expectString(record.principal_id, "objective.principal_id"),
      objective: expectString(record.objective, "objective.objective"),
      boundaries: stringArray(record.boundaries, "objective.boundaries"),
      constraints: stringArray(record.constraints, "objective.constraints"),
      successCriteria: expectArray(
        record.success_criteria,
        "objective.success_criteria"
      ).map(fromRpcSuccessCriterion),
      verificationPolicy: fromRpcVerificationPolicy(
        expectJsonField(
          record,
          "verification_policy",
          "objective.verification_policy"
        )
      ),
      stopPolicy: fromRpcStopPolicy(
        expectJsonField(record, "stop_policy", "objective.stop_policy")
      ),
      revision: expectNumber(record.revision, "objective.revision"),
      state: expectEnum(record.state, "objective.state", OBJECTIVE_STATES),
      reason: fromRpcObjectiveReason(
        expectJsonField(record, "reason", "objective.reason")
      ),
      createdAt: expectNumber(record.created_at, "objective.created_at"),
      updatedAt: expectNumber(record.updated_at, "objective.updated_at")
    },
    {
      activeAttemptId: optionalString(
        record.active_attempt_id,
        "objective.active_attempt_id"
      ),
      closedAt: optionalNumber(record.closed_at, "objective.closed_at")
    }
  )
}

export function fromRpcObjectiveAttemptRecord(
  value: JsonValue
): ObjectiveAttemptRecord {
  const record = expectRecord(value, "objective attempt")
  return withOptionalFields(
    {
      id: expectString(record.id, "objective_attempt.id"),
      objectiveId: expectString(
        record.objective_id,
        "objective_attempt.objective_id"
      ),
      attemptNumber: expectNumber(
        record.attempt_number,
        "objective_attempt.attempt_number"
      ),
      inputId: expectString(record.input_id, "objective_attempt.input_id"),
      turnId: expectString(record.turn_id, "objective_attempt.turn_id"),
      jobId: expectString(record.job_id, "objective_attempt.job_id"),
      executionBindingDigest: expectString(
        record.execution_binding_digest,
        "objective_attempt.execution_binding_digest"
      ),
      trigger: expectEnum(
        record.trigger,
        "objective_attempt.trigger",
        ATTEMPT_TRIGGERS
      ),
      idempotencyKey: expectString(
        record.idempotency_key,
        "objective_attempt.idempotency_key"
      ),
      boundAt: expectNumber(record.bound_at, "objective_attempt.bound_at")
    },
    {
      budgetGrantId: optionalString(
        record.budget_grant_id,
        "objective_attempt.budget_grant_id"
      )
    }
  )
}

export function fromRpcObjectiveAttemptReviewRecord(
  value: JsonValue
): ObjectiveAttemptReviewRecord {
  const record = expectRecord(value, "objective attempt review")
  return withOptionalFields(
    {
      id: expectString(record.id, "objective_review.id"),
      objectiveId: expectString(record.objective_id, "objective_review.objective_id"),
      attemptId: expectString(record.attempt_id, "objective_review.attempt_id"),
      disposition: expectEnum(
        record.disposition,
        "objective_review.disposition",
        ATTEMPT_DISPOSITIONS
      ),
      createdAt: expectNumber(record.created_at, "objective_review.created_at")
    },
    { reason: optionalString(record.reason, "objective_review.reason") }
  )
}

export function fromRpcObjectiveVerificationRecord(
  value: JsonValue
): ObjectiveVerificationRecord {
  const record = expectRecord(value, "objective verification")
  return withOptionalFields(
    {
      id: expectString(record.id, "objective_verification.id"),
      objectiveId: expectString(
        record.objective_id,
        "objective_verification.objective_id"
      ),
      attemptId: expectString(
        record.attempt_id,
        "objective_verification.attempt_id"
      ),
      requirementId: expectString(
        record.requirement_id,
        "objective_verification.requirement_id"
      ),
      verifierKind: expectEnum(
        record.verifier_kind,
        "objective_verification.verifier_kind",
        VERIFIER_KINDS
      ),
      verifierRef: expectString(
        record.verifier_ref,
        "objective_verification.verifier_ref"
      ),
      result: expectEnum(
        record.result,
        "objective_verification.result",
        VERIFICATION_RESULTS
      ),
      evidence: expectArray(
        record.evidence,
        "objective_verification.evidence"
      ).map(fromRpcVerificationEvidence),
      createdAt: expectNumber(
        record.created_at,
        "objective_verification.created_at"
      )
    },
    { reason: optionalString(record.reason, "objective_verification.reason") }
  )
}

export function fromRpcAdmitObjectiveAttemptReceipt(
  value: JsonValue
): AdmitObjectiveAttemptReceipt {
  const receipt = expectRecord(value, "objective attempt admission receipt")
  const status = expectString(receipt.status, "objective admission status")
  if (status === "limit_reached") {
    return {
      status,
      objective: fromRpcObjectiveRecord(
        expectJsonField(receipt, "objective", "objective admission objective")
      )
    }
  }
  if (status !== "admitted") {
    throw new Error(`invalid objective admission status: ${status}`)
  }
  return {
    status,
    objective: fromRpcObjectiveRecord(
      expectJsonField(receipt, "objective", "objective admission objective")
    ),
    attempt: fromRpcObjectiveAttemptRecord(
      expectJsonField(receipt, "attempt", "objective admission attempt")
    ),
    submission: fromRpcSubmitSessionTurnReceipt(
      expectJsonField(receipt, "submission", "objective admission submission")
    )
  }
}

export function fromRpcReviewObjectiveAttemptReceipt(
  value: JsonValue
): ReviewObjectiveAttemptReceipt {
  const receipt = expectRecord(value, "objective review receipt")
  return {
    objective: fromRpcObjectiveRecord(
      expectJsonField(receipt, "objective", "objective review objective")
    ),
    attempt: fromRpcObjectiveAttemptRecord(
      expectJsonField(receipt, "attempt", "objective review attempt")
    ),
    review: fromRpcObjectiveAttemptReviewRecord(
      expectJsonField(receipt, "review", "objective review")
    ),
    verifications: expectArray(
      receipt.verifications,
      "objective review verifications"
    ).map(fromRpcObjectiveVerificationRecord)
  }
}

export function fromRpcRequestObjectiveCancelReceipt(
  value: JsonValue
): RequestObjectiveCancelReceipt {
  const receipt = expectRecord(value, "objective cancel receipt")
  return withOptionalFields(
    {
      objective: fromRpcObjectiveRecord(
        expectJsonField(receipt, "objective", "objective cancel objective")
      )
    },
    {
      turnCancellation:
        receipt.turn_cancellation === null ||
        receipt.turn_cancellation === undefined
          ? undefined
          : fromRpcRequestSessionTurnCancelReceipt(receipt.turn_cancellation)
    }
  )
}

function fromRpcSuccessCriterion(value: JsonValue): ObjectiveSuccessCriterion {
  const criterion = expectRecord(value, "objective success criterion")
  return {
    id: expectString(criterion.id, "objective criterion.id"),
    description: expectString(
      criterion.description,
      "objective criterion.description"
    )
  }
}

function fromRpcVerificationPolicy(value: JsonValue): ObjectiveVerificationPolicy {
  const policy = expectRecord(value, "objective verification policy")
  return {
    requirements: expectArray(
      policy.requirements,
      "objective verification requirements"
    ).map(fromRpcVerificationRequirement)
  }
}

function fromRpcVerificationRequirement(
  value: JsonValue
): ObjectiveVerificationRequirement {
  const requirement = expectRecord(value, "objective verification requirement")
  return {
    id: expectString(requirement.id, "objective requirement.id"),
    criterionIds: stringArray(
      requirement.criterionIds,
      "objective requirement.criterionIds"
    ),
    verifierKind: expectEnum(
      requirement.verifierKind,
      "objective requirement.verifierKind",
      VERIFIER_KINDS
    ),
    verifierRef: expectString(
      requirement.verifierRef,
      "objective requirement.verifierRef"
    )
  }
}

function fromRpcStopPolicy(value: JsonValue): ObjectiveStopPolicy {
  const policy = expectRecord(value, "objective stop policy")
  return withOptionalFields(
    {
      maxAttempts: expectNumber(policy.maxAttempts, "objective stop maxAttempts"),
      maxConsecutiveBlockedAttempts: expectNumber(
        policy.maxConsecutiveBlockedAttempts,
        "objective stop maxConsecutiveBlockedAttempts"
      )
    },
    {
      deadlineAt: optionalNumber(policy.deadlineAt, "objective stop deadlineAt"),
      budget:
        policy.budget === null || policy.budget === undefined
          ? undefined
          : fromRpcObjectiveBudget(policy.budget)
    }
  )
}

function fromRpcObjectiveBudget(value: JsonValue): BudgetLimit {
  const budget = expectRecord(value, "objective budget")
  return withOptionalFields(
    {},
    {
      tokens: optionalNumber(budget.tokens, "objective budget.tokens"),
      costMicros: optionalNumber(budget.costMicros, "objective budget.costMicros"),
      wallTimeMs: optionalNumber(
        budget.wallTimeMs,
        "objective budget.wallTimeMs"
      ),
      toolCalls: optionalNumber(budget.toolCalls, "objective budget.toolCalls")
    }
  )
}

function fromRpcObjectiveReason(value: JsonValue): ObjectiveStateReason {
  const reason = expectRecord(value, "objective reason")
  return withOptionalFields(
    {
      code: expectEnum(
        reason.code,
        "objective reason.code",
        OBJECTIVE_REASON_CODES
      )
    },
    { detail: optionalString(reason.detail, "objective reason.detail") }
  )
}

function fromRpcVerificationEvidence(
  value: JsonValue
): ObjectiveVerificationEvidence {
  const evidence = expectRecord(value, "objective verification evidence")
  return {
    kind: expectEnum(
      evidence.kind,
      "objective verification evidence.kind",
      EVIDENCE_KINDS
    ),
    referenceId: expectString(
      evidence.referenceId,
      "objective verification evidence.referenceId"
    ),
    digest: expectString(
      evidence.digest,
      "objective verification evidence.digest"
    )
  }
}

function expectRecord(value: JsonValue, name: string): Record<string, JsonValue> {
  if (!isRecord(value)) {
    throw new Error(`${name} must be an object`)
  }
  return value
}

function stringArray(value: JsonValue | undefined, name: string): string[] {
  return expectArray(value, name).map((item, index) =>
    expectString(item, `${name}.${String(index)}`)
  )
}

function expectEnum<const T extends string>(
  value: unknown,
  name: string,
  allowed: readonly T[]
): T {
  const parsed = expectString(value, name)
  if (!allowed.includes(parsed as T)) {
    throw new Error(`invalid ${name}: ${parsed}`)
  }
  return parsed as T
}
