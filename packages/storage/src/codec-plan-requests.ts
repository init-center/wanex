import type {
  CreatePlanProposalRequest,
  ExecuteApprovedPlanRequest,
  GetPlanProposalRequest,
  JsonValue,
  ListPlanProposalOperationsRequest,
  ListPlanProposalsRequest,
  RecordPlanProposalOperationRequest
} from "@wanex/protocol"

import {
  planContentToWire,
  planGenerationToWire,
  planSourceToWire
} from "./codec-plan-values.js"
import { toRpcSubmitSessionTurnRequest } from "./codec-session-requests.js"
import type {
  CreatePlanProposalWire,
  ExecuteApprovedPlanWire,
  ListPlanProposalOperationsWire,
  ListPlanProposalsWire,
  RecordPlanProposalOperationWire
} from "./generated/storage-rpc.js"

export function toRpcCreatePlanProposalRequest(
  request: CreatePlanProposalRequest
): CreatePlanProposalWire {
  return {
    id: request.id ?? null,
    principal_id: request.principalId,
    source: planSourceToWire(request.source),
    generation: planGenerationToWire(request.generation),
    content: planContentToWire(request),
    idempotency_key: request.idempotencyKey
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
    source_session_id: request.sourceSessionId ?? null,
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
    expected_revision: request.expectedRevision,
    actor_kind: request.actor.kind,
    actor_id: request.actor.id,
    content:
      request.content === undefined ? null : planContentToWire(request.content),
    reason: request.reason ?? null,
    idempotency_key: request.idempotencyKey
  }
}

export function toRpcExecuteApprovedPlanRequest(
  request: ExecuteApprovedPlanRequest
): ExecuteApprovedPlanWire {
  return {
    proposal_id: request.proposalId,
    expected_revision: request.expectedRevision,
    idempotency_key: request.idempotencyKey,
    turn: toRpcSubmitSessionTurnRequest(request.turn)
  }
}

export function toRpcListPlanProposalOperationsRequest(
  request: ListPlanProposalOperationsRequest
): ListPlanProposalOperationsWire {
  return {
    proposal_id: request.proposalId
  }
}
