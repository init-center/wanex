import {
  type DelegationGraphDependencyRecord,
  type DelegationGraphNodeRecord,
  type DelegationGraphRecord,
  type JsonValue,
  type MaterializedDelegationGraphNode
} from "@wanex/protocol"

import {
  expectJsonField,
  expectNumber,
  expectString,
  isRecord,
  optionalNumber,
  optionalString,
  withOptionalFields
} from "./codec-helpers.js"
import {
  expectDelegationDependencyKind,
  expectDelegationGraphState,
  expectDelegationNodeKind,
  expectDelegationNodeState
} from "./codec-delegation-enums.js"
import { fromRpcSchedulerJobRecord } from "./codec-scheduler.js"

export function fromRpcMaterializedDelegationGraphNode(
  value: JsonValue
): MaterializedDelegationGraphNode {
  if (!isRecord(value)) {
    throw new Error("materialized delegation graph node must be an object")
  }
  return {
    node: fromRpcDelegationGraphNodeRecord(
      expectJsonField(value, "node", "materialized_delegation_node.node")
    ),
    job: fromRpcSchedulerJobRecord(
      expectJsonField(value, "job", "materialized_delegation_node.job")
    )
  }
}

export function fromRpcDelegationGraphRecord(
  value: JsonValue
): DelegationGraphRecord {
  if (!isRecord(value)) {
    throw new Error("delegation graph must be an object")
  }
  return withOptionalFields(
    {
      id: expectString(value.id, "delegation_graph.id"),
      principalId: expectString(
        value.principal_id,
        "delegation_graph.principal_id"
      ),
      state: expectDelegationGraphState(value.state),
      createdAt: expectNumber(value.created_at, "delegation_graph.created_at"),
      updatedAt: expectNumber(value.updated_at, "delegation_graph.updated_at")
    },
    {
      title: optionalString(value.title, "delegation_graph.title"),
      metadata: value.metadata ?? undefined,
      closedAt: optionalNumber(value.closed_at, "delegation_graph.closed_at")
    }
  )
}

export function fromRpcDelegationGraphNodeRecord(
  value: JsonValue
): DelegationGraphNodeRecord {
  if (!isRecord(value)) {
    throw new Error("delegation graph node must be an object")
  }
  return withOptionalFields(
    {
      id: expectString(value.id, "delegation_graph_node.id"),
      graphId: expectString(value.graph_id, "delegation_graph_node.graph_id"),
      kind: expectDelegationNodeKind(value.kind),
      principalId: expectString(
        value.principal_id,
        "delegation_graph_node.principal_id"
      ),
      state: expectDelegationNodeState(value.state),
      payload: expectJsonField(value, "payload", "delegation_graph_node.payload"),
      createdAt: expectNumber(
        value.created_at,
        "delegation_graph_node.created_at"
      ),
      updatedAt: expectNumber(
        value.updated_at,
        "delegation_graph_node.updated_at"
      )
    },
    {
      schedulerJobId: optionalString(
        value.scheduler_job_id,
        "delegation_graph_node.scheduler_job_id"
      ),
      metadata: value.metadata ?? undefined,
      startedAt: optionalNumber(
        value.started_at,
        "delegation_graph_node.started_at"
      ),
      finishedAt: optionalNumber(
        value.finished_at,
        "delegation_graph_node.finished_at"
      )
    }
  )
}

export function fromRpcDelegationGraphDependencyRecord(
  value: JsonValue
): DelegationGraphDependencyRecord {
  if (!isRecord(value)) {
    throw new Error("delegation graph dependency must be an object")
  }
  return {
    id: expectString(value.id, "delegation_graph_dependency.id"),
    graphId: expectString(
      value.graph_id,
      "delegation_graph_dependency.graph_id"
    ),
    fromNodeId: expectString(
      value.from_node_id,
      "delegation_graph_dependency.from_node_id"
    ),
    toNodeId: expectString(
      value.to_node_id,
      "delegation_graph_dependency.to_node_id"
    ),
    kind: expectDelegationDependencyKind(value.kind),
    createdAt: expectNumber(
      value.created_at,
      "delegation_graph_dependency.created_at"
    )
  }
}
