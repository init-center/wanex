import {
  type GetWorkspaceChangeProposalRequest,
  type GetWorkspaceChangeSetRequest,
  type JsonValue,
  type ListWorkspaceChangeOperationsRequest,
  type ListWorkspaceChangeProposalOperationsRequest,
  type ListWorkspaceChangeProposalsRequest,
  type ListWorkspaceChangeSetsRequest,
  type PutWorkspaceChangeProposalRequest,
  type PutWorkspaceChangeSetRequest,
  type RecordWorkspaceChangeOperationRequest,
  type RecordWorkspaceChangeProposalOperationRequest
} from "@wanex/protocol"

import {
  workspaceChangeReceiptToJson,
  workspaceChangeSetToJson
} from "./codec-workspace-values.js"
import { toRpcJsonValue } from "./codec-common.js"
import type {
  ListWorkspaceChangeOperationsWire,
  ListWorkspaceChangeProposalOperationsWire,
  ListWorkspaceChangeProposalsWire,
  ListWorkspaceChangeSetsWire,
  PutWorkspaceChangeProposalWire,
  PutWorkspaceChangeSetWire,
  RecordWorkspaceChangeOperationWire,
  RecordWorkspaceChangeProposalOperationWire
} from "./generated/storage-rpc.js"

export function toRpcPutWorkspaceChangeSetRequest(
  request: PutWorkspaceChangeSetRequest
): PutWorkspaceChangeSetWire {
  return {
    workspace_id: request.workspaceId,
    principal_id: request.principalId,
    changeset: toRpcJsonValue(workspaceChangeSetToJson(request.changeSet))
  }
}

export function toRpcGetWorkspaceChangeSetRequest(
  request: GetWorkspaceChangeSetRequest
): JsonValue {
  return {
    change_set_id: request.changeSetId
  }
}

export function toRpcListWorkspaceChangeSetsRequest(
  request: ListWorkspaceChangeSetsRequest
): ListWorkspaceChangeSetsWire {
  return {
    workspace_id: request.workspaceId ?? null,
    state: request.state ?? null,
    limit: request.limit ?? null
  }
}

export function toRpcRecordWorkspaceChangeOperationRequest(
  request: RecordWorkspaceChangeOperationRequest
): RecordWorkspaceChangeOperationWire {
  return {
    id: request.id ?? null,
    changeset_id: request.changeSetId,
    operation: request.operation,
    receipt: toRpcJsonValue(workspaceChangeReceiptToJson(request.receipt))
  }
}

export function toRpcListWorkspaceChangeOperationsRequest(
  request: ListWorkspaceChangeOperationsRequest
): ListWorkspaceChangeOperationsWire {
  return {
    changeset_id: request.changeSetId
  }
}

export function toRpcPutWorkspaceChangeProposalRequest(
  request: PutWorkspaceChangeProposalRequest
): PutWorkspaceChangeProposalWire {
  return {
    id: request.id ?? null,
    workspace_id: request.workspaceId,
    changeset_id: request.changeSetId,
    principal_id: request.principalId,
    title: request.title ?? null,
    summary: request.summary ?? null,
    metadata: toRpcJsonValue(request.metadata ?? null),
    idempotency_key: request.idempotencyKey ?? null
  }
}

export function toRpcGetWorkspaceChangeProposalRequest(
  request: GetWorkspaceChangeProposalRequest
): JsonValue {
  return {
    proposal_id: request.proposalId
  }
}

export function toRpcListWorkspaceChangeProposalsRequest(
  request: ListWorkspaceChangeProposalsRequest
): ListWorkspaceChangeProposalsWire {
  return {
    workspace_id: request.workspaceId ?? null,
    state: request.state ?? null,
    changeset_id: request.changeSetId ?? null,
    limit: request.limit ?? null
  }
}

export function toRpcRecordWorkspaceChangeProposalOperationRequest(
  request: RecordWorkspaceChangeProposalOperationRequest
): RecordWorkspaceChangeProposalOperationWire {
  return {
    id: request.id ?? null,
    proposal_id: request.proposalId,
    operation: request.operation,
    actor_id: request.actorId,
    reason: request.reason ?? null,
    metadata: toRpcJsonValue(request.metadata ?? null)
  }
}

export function toRpcListWorkspaceChangeProposalOperationsRequest(
  request: ListWorkspaceChangeProposalOperationsRequest
): ListWorkspaceChangeProposalOperationsWire {
  return {
    proposal_id: request.proposalId
  }
}
