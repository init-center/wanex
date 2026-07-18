import {
  type GetPlanProposalRequest,
  type JsonValue,
  type ListPlanProposalOperationsRequest,
  type ListPlanProposalsRequest,
  type PutPlanProposalRequest,
  type RecordPlanProposalOperationRequest
} from "@wanex/protocol"

import {
  planReferenceToJson,
  planStepToJson
} from "./codec-plan-values.js"
import { toRpcJsonValue } from "./codec-common.js"
import type {
  ListPlanProposalOperationsWire,
  ListPlanProposalsWire,
  PutPlanProposalWire,
  RecordPlanProposalOperationWire
} from "./generated/storage-rpc.js"

export function toRpcPutPlanProposalRequest(
  request: PutPlanProposalRequest
): PutPlanProposalWire {
  return {
    id: request.id ?? null,
    principal_id: request.principalId,
    title: request.title ?? null,
    summary: request.summary ?? null,
    steps: toRpcJsonValue(request.steps.map(planStepToJson)),
    references: toRpcJsonValue(
      request.references?.map(planReferenceToJson) ?? null
    ),
    metadata: toRpcJsonValue(request.metadata ?? null),
    idempotency_key: request.idempotencyKey ?? null
  }
}

export function toRpcGetPlanProposalRequest(
  request: GetPlanProposalRequest
): JsonValue {
  return {
    proposal_id: request.proposalId
  }
}

export function toRpcListPlanProposalsRequest(
  request: ListPlanProposalsRequest
): ListPlanProposalsWire {
  return {
    principal_id: request.principalId ?? null,
    state: request.state ?? null,
    reference_kind: request.referenceKind ?? null,
    reference_id: request.referenceId ?? null,
    limit: request.limit ?? null
  }
}

export function toRpcRecordPlanProposalOperationRequest(
  request: RecordPlanProposalOperationRequest
): RecordPlanProposalOperationWire {
  return {
    id: request.id ?? null,
    proposal_id: request.proposalId,
    operation: request.operation,
    actor_id: request.actorId,
    reason: request.reason ?? null,
    metadata: toRpcJsonValue(request.metadata ?? null)
  }
}

export function toRpcListPlanProposalOperationsRequest(
  request: ListPlanProposalOperationsRequest
): ListPlanProposalOperationsWire {
  return {
    proposal_id: request.proposalId
  }
}
