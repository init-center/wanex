import {
  type AttachDelegationGraphNodeJobRequest,
  type GetDelegationGraphRequest,
  type GetDelegationGraphNodeRequest,
  type ListDelegationGraphDependenciesRequest,
  type ListDelegationGraphNodesRequest,
  type ListDelegationGraphsRequest,
  type ListReadyDelegationGraphNodesRequest,
  type MaterializeReadyDelegationGraphNodeRequest,
  type PutDelegationGraphDependencyRequest,
  type PutDelegationGraphNodeRequest,
  type PutDelegationGraphRequest,
  type UpdateDelegationGraphNodeStateRequest,
  type UpdateDelegationGraphStateRequest
} from "@wanex/protocol"

import { toRpcJsonValue } from "./codec-common.js"
import type {
  AttachDelegationGraphNodeJobWire,
  GetDelegationGraphNodeWire,
  ListDelegationGraphDependenciesWire,
  ListDelegationGraphNodesWire,
  ListDelegationGraphsWire,
  ListReadyDelegationGraphNodesWire,
  MaterializeReadyDelegationGraphNodeWire,
  PutDelegationGraphDependencyWire,
  PutDelegationGraphNodeWire,
  PutDelegationGraphWire,
  UpdateDelegationGraphNodeStateWire,
  UpdateDelegationGraphStateWire
} from "./generated/storage-rpc.js"

export function toRpcPutDelegationGraphRequest(
  request: PutDelegationGraphRequest
): PutDelegationGraphWire {
  return {
    id: request.id ?? null,
    principal_id: request.principalId,
    title: request.title ?? null,
    metadata: toRpcJsonValue(request.metadata ?? null),
    idempotency_key: request.idempotencyKey ?? null
  }
}

export function toRpcGetDelegationGraphRequest(
  request: GetDelegationGraphRequest
): { readonly graph_id: string } {
  return {
    graph_id: request.graphId
  }
}

export function toRpcListDelegationGraphsRequest(
  request: ListDelegationGraphsRequest
): ListDelegationGraphsWire {
  return {
    principal_id: request.principalId ?? null,
    state: request.state ?? null,
    limit: request.limit ?? null
  }
}

export function toRpcPutDelegationGraphNodeRequest(
  request: PutDelegationGraphNodeRequest
): PutDelegationGraphNodeWire {
  return {
    id: request.id ?? null,
    graph_id: request.graphId,
    kind: request.kind,
    principal_id: request.principalId,
    payload: toRpcJsonValue(request.payload),
    metadata: toRpcJsonValue(request.metadata ?? null),
    idempotency_key: request.idempotencyKey ?? null
  }
}

export function toRpcGetDelegationGraphNodeRequest(
  request: GetDelegationGraphNodeRequest
): GetDelegationGraphNodeWire {
  return {
    node_id: request.nodeId
  }
}

export function toRpcListDelegationGraphNodesRequest(
  request: ListDelegationGraphNodesRequest
): ListDelegationGraphNodesWire {
  return {
    graph_id: request.graphId,
    state: request.state ?? null
  }
}

export function toRpcPutDelegationGraphDependencyRequest(
  request: PutDelegationGraphDependencyRequest
): PutDelegationGraphDependencyWire {
  return {
    id: request.id ?? null,
    graph_id: request.graphId,
    from_node_id: request.fromNodeId,
    to_node_id: request.toNodeId,
    kind: request.kind ?? null
  }
}

export function toRpcListDelegationGraphDependenciesRequest(
  request: ListDelegationGraphDependenciesRequest
): ListDelegationGraphDependenciesWire {
  return {
    graph_id: request.graphId
  }
}

export function toRpcUpdateDelegationGraphStateRequest(
  request: UpdateDelegationGraphStateRequest
): UpdateDelegationGraphStateWire {
  return {
    graph_id: request.graphId,
    state: request.state
  }
}

export function toRpcUpdateDelegationGraphNodeStateRequest(
  request: UpdateDelegationGraphNodeStateRequest
): UpdateDelegationGraphNodeStateWire {
  return {
    node_id: request.nodeId,
    state: request.state,
    scheduler_job_id: request.schedulerJobId ?? null,
    metadata: toRpcJsonValue(request.metadata ?? null)
  }
}

export function toRpcAttachDelegationGraphNodeJobRequest(
  request: AttachDelegationGraphNodeJobRequest
): AttachDelegationGraphNodeJobWire {
  return {
    node_id: request.nodeId,
    scheduler_job_id: request.schedulerJobId
  }
}

export function toRpcListReadyDelegationGraphNodesRequest(
  request: ListReadyDelegationGraphNodesRequest
): ListReadyDelegationGraphNodesWire {
  return {
    graph_id: request.graphId,
    limit: request.limit ?? null
  }
}

export function toRpcMaterializeReadyDelegationGraphNodeRequest(
  request: MaterializeReadyDelegationGraphNodeRequest
): MaterializeReadyDelegationGraphNodeWire {
  return {
    graph_id: request.graphId,
    node_id: request.nodeId ?? null,
    worker_id: request.workerId,
    job_id: request.jobId ?? null,
    job_kind: request.jobKind,
    job_payload: toRpcJsonValue(request.jobPayload ?? null),
    scheduled_at: request.scheduledAt ?? null,
    not_before: request.notBefore ?? null,
    priority: request.priority ?? null,
    max_attempts: request.maxAttempts ?? null,
    retry_policy:
      request.retryPolicy === undefined
        ? null
        : {
            strategy: request.retryPolicy.strategy,
            initial_delay_ms: request.retryPolicy.initialDelayMs ?? null,
            max_delay_ms: request.retryPolicy.maxDelayMs ?? null
          },
    job_idempotency_key: request.jobIdempotencyKey ?? null,
    budget_grant_id: request.budgetGrantId ?? null
  }
}
