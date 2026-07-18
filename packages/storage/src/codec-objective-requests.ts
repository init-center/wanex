import {
  type GetObjectiveRunRequest,
  type ListObjectiveAttemptsRequest,
  type ListObjectiveRunOperationsRequest,
  type ListObjectiveRunsRequest,
  type ListObjectiveVerificationsRequest,
  type PutObjectiveAttemptRequest,
  type PutObjectiveRunRequest,
  type PutObjectiveVerificationRequest,
  type RecordObjectiveRunOperationRequest
} from "@wanex/protocol"

import {
  objectiveReferenceToJson
} from "./codec-objective-reference.js"
import { objectiveStopPolicyToJson } from "./codec-objective-stop-policy.js"
import { toRpcJsonValue } from "./codec-common.js"
import type {
  ListObjectiveAttemptsWire,
  ListObjectiveRunOperationsWire,
  ListObjectiveRunsWire,
  ListObjectiveVerificationsWire,
  PutObjectiveAttemptWire,
  PutObjectiveRunWire,
  PutObjectiveVerificationWire,
  RecordObjectiveRunOperationWire
} from "./generated/storage-rpc.js"

export function toRpcPutObjectiveRunRequest(
  request: PutObjectiveRunRequest
): PutObjectiveRunWire {
  return {
    id: request.id ?? null,
    principal_id: request.principalId,
    objective: request.objective,
    scope: request.scope ?? null,
    constraints: toRpcJsonValue(request.constraints?.slice() ?? null),
    success_criteria: toRpcJsonValue(request.successCriteria?.slice() ?? null),
    stop_policy:
      request.stopPolicy === undefined
        ? null
        : toRpcJsonValue(objectiveStopPolicyToJson(request.stopPolicy)),
    references: toRpcJsonValue(
      request.references?.map(objectiveReferenceToJson) ?? null
    ),
    metadata: toRpcJsonValue(request.metadata ?? null),
    idempotency_key: request.idempotencyKey ?? null
  }
}

export function toRpcGetObjectiveRunRequest(
  request: GetObjectiveRunRequest
): { readonly objective_id: string } {
  return {
    objective_id: request.objectiveId
  }
}

export function toRpcListObjectiveRunsRequest(
  request: ListObjectiveRunsRequest
): ListObjectiveRunsWire {
  return {
    principal_id: request.principalId ?? null,
    state: request.state ?? null,
    reference_kind: request.referenceKind ?? null,
    reference_id: request.referenceId ?? null,
    limit: request.limit ?? null
  }
}

export function toRpcRecordObjectiveRunOperationRequest(
  request: RecordObjectiveRunOperationRequest
): RecordObjectiveRunOperationWire {
  return {
    id: request.id ?? null,
    objective_id: request.objectiveId,
    operation: request.operation,
    actor_id: request.actorId,
    reason: request.reason ?? null,
    metadata: toRpcJsonValue(request.metadata ?? null)
  }
}

export function toRpcListObjectiveRunOperationsRequest(
  request: ListObjectiveRunOperationsRequest
): ListObjectiveRunOperationsWire {
  return {
    objective_id: request.objectiveId
  }
}

export function toRpcPutObjectiveAttemptRequest(
  request: PutObjectiveAttemptRequest
): PutObjectiveAttemptWire {
  return {
    id: request.id ?? null,
    objective_id: request.objectiveId,
    attempt_number: request.attemptNumber ?? null,
    state: request.state ?? null,
    session_id: request.sessionId ?? null,
    session_input_id: request.sessionInputId ?? null,
    session_run_id: request.sessionRunId ?? null,
    scheduler_job_id: request.schedulerJobId ?? null,
    delegation_graph_id: request.delegationGraphId ?? null,
    plan_proposal_id: request.planProposalId ?? null,
    workspace_change_proposal_id: request.workspaceChangeProposalId ?? null,
    summary: request.summary ?? null,
    result: toRpcJsonValue(request.result ?? null),
    error: toRpcJsonValue(request.error ?? null),
    metadata: toRpcJsonValue(request.metadata ?? null),
    started_at: request.startedAt ?? null,
    finished_at: request.finishedAt ?? null,
    idempotency_key: request.idempotencyKey ?? null
  }
}

export function toRpcListObjectiveAttemptsRequest(
  request: ListObjectiveAttemptsRequest
): ListObjectiveAttemptsWire {
  return {
    objective_id: request.objectiveId,
    state: request.state ?? null,
    limit: request.limit ?? null
  }
}

export function toRpcPutObjectiveVerificationRequest(
  request: PutObjectiveVerificationRequest
): PutObjectiveVerificationWire {
  return {
    id: request.id ?? null,
    objective_id: request.objectiveId,
    attempt_id: request.attemptId ?? null,
    kind: request.kind,
    state: request.state,
    reason: request.reason ?? null,
    evidence: toRpcJsonValue(request.evidence ?? null),
    verifier_ref: request.verifierRef ?? null,
    metadata: toRpcJsonValue(request.metadata ?? null),
    idempotency_key: request.idempotencyKey ?? null
  }
}

export function toRpcListObjectiveVerificationsRequest(
  request: ListObjectiveVerificationsRequest
): ListObjectiveVerificationsWire {
  return {
    objective_id: request.objectiveId,
    attempt_id: request.attemptId ?? null,
    state: request.state ?? null,
    limit: request.limit ?? null
  }
}
