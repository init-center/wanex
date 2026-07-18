import {
  type JsonValue,
  type ObjectiveAttemptRecord,
  type ObjectiveRunOperationRecord,
  type ObjectiveRunRecord,
  type ObjectiveVerificationRecord
} from "@wanex/protocol"

import {
  expectArray,
  expectNumber,
  expectString,
  isRecord,
  optionalNumber,
  optionalString,
  withOptionalFields
} from "./codec-helpers.js"
import {
  expectObjectiveAttemptState,
  expectObjectiveRunOperationKind,
  expectObjectiveRunState,
  expectObjectiveVerificationKind,
  expectObjectiveVerificationState
} from "./codec-objective-state.js"
import { objectiveReferenceFromJson } from "./codec-objective-reference.js"
import { objectiveStopPolicyFromJson } from "./codec-objective-stop-policy.js"

export function fromRpcObjectiveRunRecord(value: JsonValue): ObjectiveRunRecord {
  if (!isRecord(value)) {
    throw new Error("objective run must be an object")
  }
  return withOptionalFields(
    {
      id: expectString(value.id, "objective_run.id"),
      principalId: expectString(
        value.principal_id,
        "objective_run.principal_id"
      ),
      objective: expectString(value.objective, "objective_run.objective"),
      constraints: expectArray(
        value.constraints,
        "objective_run.constraints"
      ).map((item, index) =>
        expectString(item, `objective_run.constraints.${String(index)}`)
      ),
      successCriteria: expectArray(
        value.success_criteria,
        "objective_run.success_criteria"
      ).map((item, index) =>
        expectString(item, `objective_run.success_criteria.${String(index)}`)
      ),
      references: expectArray(value.references, "objective_run.references").map(
        objectiveReferenceFromJson
      ),
      state: expectObjectiveRunState(value.state, "objective_run.state"),
      createdAt: expectNumber(value.created_at, "objective_run.created_at"),
      updatedAt: expectNumber(value.updated_at, "objective_run.updated_at")
    },
    {
      scope: optionalString(value.scope, "objective_run.scope"),
      stopPolicy:
        value.stop_policy === null || value.stop_policy === undefined
          ? undefined
          : objectiveStopPolicyFromJson(value.stop_policy),
      metadata: value.metadata ?? undefined,
      closedAt: optionalNumber(value.closed_at, "objective_run.closed_at")
    }
  )
}

export function fromRpcObjectiveRunOperationRecord(
  value: JsonValue
): ObjectiveRunOperationRecord {
  if (!isRecord(value)) {
    throw new Error("objective run operation must be an object")
  }
  return withOptionalFields(
    {
      id: expectString(value.id, "objective_run_operation.id"),
      objectiveId: expectString(
        value.objective_id,
        "objective_run_operation.objective_id"
      ),
      operation: expectObjectiveRunOperationKind(
        value.operation,
        "objective_run_operation.operation"
      ),
      actorId: expectString(
        value.actor_id,
        "objective_run_operation.actor_id"
      ),
      fromState: expectObjectiveRunState(
        value.from_state,
        "objective_run_operation.from_state"
      ),
      toState: expectObjectiveRunState(
        value.to_state,
        "objective_run_operation.to_state"
      ),
      createdAt: expectNumber(
        value.created_at,
        "objective_run_operation.created_at"
      )
    },
    {
      reason: optionalString(value.reason, "objective_run_operation.reason"),
      metadata: value.metadata ?? undefined
    }
  )
}

export function fromRpcObjectiveAttemptRecord(
  value: JsonValue
): ObjectiveAttemptRecord {
  if (!isRecord(value)) {
    throw new Error("objective attempt must be an object")
  }
  return withOptionalFields(
    {
      id: expectString(value.id, "objective_attempt.id"),
      objectiveId: expectString(
        value.objective_id,
        "objective_attempt.objective_id"
      ),
      attemptNumber: expectNumber(
        value.attempt_number,
        "objective_attempt.attempt_number"
      ),
      state: expectObjectiveAttemptState(value.state, "objective_attempt.state"),
      createdAt: expectNumber(value.created_at, "objective_attempt.created_at"),
      updatedAt: expectNumber(value.updated_at, "objective_attempt.updated_at")
    },
    {
      sessionId: optionalString(value.session_id, "objective_attempt.session_id"),
      sessionInputId: optionalString(
        value.session_input_id,
        "objective_attempt.session_input_id"
      ),
      sessionRunId: optionalString(
        value.session_run_id,
        "objective_attempt.session_run_id"
      ),
      schedulerJobId: optionalString(
        value.scheduler_job_id,
        "objective_attempt.scheduler_job_id"
      ),
      delegationGraphId: optionalString(
        value.delegation_graph_id,
        "objective_attempt.delegation_graph_id"
      ),
      planProposalId: optionalString(
        value.plan_proposal_id,
        "objective_attempt.plan_proposal_id"
      ),
      workspaceChangeProposalId: optionalString(
        value.workspace_change_proposal_id,
        "objective_attempt.workspace_change_proposal_id"
      ),
      summary: optionalString(value.summary, "objective_attempt.summary"),
      result: value.result ?? undefined,
      error: value.error ?? undefined,
      metadata: value.metadata ?? undefined,
      startedAt: optionalNumber(value.started_at, "objective_attempt.started_at"),
      finishedAt: optionalNumber(
        value.finished_at,
        "objective_attempt.finished_at"
      )
    }
  )
}

export function fromRpcObjectiveVerificationRecord(
  value: JsonValue
): ObjectiveVerificationRecord {
  if (!isRecord(value)) {
    throw new Error("objective verification must be an object")
  }
  return withOptionalFields(
    {
      id: expectString(value.id, "objective_verification.id"),
      objectiveId: expectString(
        value.objective_id,
        "objective_verification.objective_id"
      ),
      kind: expectObjectiveVerificationKind(
        value.kind,
        "objective_verification.kind"
      ),
      state: expectObjectiveVerificationState(
        value.state,
        "objective_verification.state"
      ),
      createdAt: expectNumber(
        value.created_at,
        "objective_verification.created_at"
      )
    },
    {
      attemptId: optionalString(
        value.attempt_id,
        "objective_verification.attempt_id"
      ),
      reason: optionalString(value.reason, "objective_verification.reason"),
      evidence: value.evidence ?? undefined,
      verifierRef: optionalString(
        value.verifier_ref,
        "objective_verification.verifier_ref"
      ),
      metadata: value.metadata ?? undefined
    }
  )
}
