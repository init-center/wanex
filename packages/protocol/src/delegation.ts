import type { PrincipalId } from "./ids.js"
import type { JsonValue } from "./json.js"
import type { RetryPolicy, SchedulerJobKind, SchedulerJobRecord } from "./scheduler.js"

export type DelegationGraphState =
  | "open"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"

export type DelegationNodeKind =
  | "agent_task"
  | "workspace_task"
  | "tool_task"
  | "aggregation"

export type DelegationNodeState =
  | "pending"
  | "ready"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "skipped"

export type DelegationDependencyKind =
  | "after_success"
  | "after_terminal"

export interface DelegationGraphRecord {
  readonly id: string
  readonly principalId: PrincipalId
  readonly title?: string
  readonly state: DelegationGraphState
  readonly metadata?: JsonValue
  readonly createdAt: number
  readonly updatedAt: number
  readonly closedAt?: number
}

export interface DelegationGraphNodeRecord {
  readonly id: string
  readonly graphId: string
  readonly kind: DelegationNodeKind
  readonly principalId: PrincipalId
  readonly state: DelegationNodeState
  readonly payload: JsonValue
  readonly schedulerJobId?: string
  readonly metadata?: JsonValue
  readonly createdAt: number
  readonly updatedAt: number
  readonly startedAt?: number
  readonly finishedAt?: number
}

export interface DelegationGraphDependencyRecord {
  readonly id: string
  readonly graphId: string
  readonly fromNodeId: string
  readonly toNodeId: string
  readonly kind: DelegationDependencyKind
  readonly createdAt: number
}

export interface PutDelegationGraphRequest {
  readonly id?: string
  readonly principalId: PrincipalId
  readonly title?: string
  readonly metadata?: JsonValue
  readonly idempotencyKey?: string
}

export interface GetDelegationGraphRequest {
  readonly graphId: string
}

export interface ListDelegationGraphsRequest {
  readonly principalId?: PrincipalId
  readonly state?: DelegationGraphState
  readonly limit?: number
}

export interface PutDelegationGraphNodeRequest {
  readonly id?: string
  readonly graphId: string
  readonly kind: DelegationNodeKind
  readonly principalId: PrincipalId
  readonly payload: JsonValue
  readonly metadata?: JsonValue
  readonly idempotencyKey?: string
}

export interface GetDelegationGraphNodeRequest {
  readonly nodeId: string
}

export interface ListDelegationGraphNodesRequest {
  readonly graphId: string
  readonly state?: DelegationNodeState
}

export interface PutDelegationGraphDependencyRequest {
  readonly id?: string
  readonly graphId: string
  readonly fromNodeId: string
  readonly toNodeId: string
  readonly kind?: DelegationDependencyKind
}

export interface ListDelegationGraphDependenciesRequest {
  readonly graphId: string
}

export interface UpdateDelegationGraphStateRequest {
  readonly graphId: string
  readonly state: DelegationGraphState
}

export interface UpdateDelegationGraphNodeStateRequest {
  readonly nodeId: string
  readonly state: DelegationNodeState
  readonly schedulerJobId?: string
  readonly metadata?: JsonValue
}

export interface AttachDelegationGraphNodeJobRequest {
  readonly nodeId: string
  readonly schedulerJobId: string
}

export interface ListReadyDelegationGraphNodesRequest {
  readonly graphId: string
  readonly limit?: number
}

export interface MaterializeReadyDelegationGraphNodeRequest {
  readonly graphId: string
  readonly nodeId?: string
  readonly workerId: string
  readonly jobId?: string
  readonly jobKind: SchedulerJobKind
  readonly jobPayload?: JsonValue
  readonly scheduledAt?: number
  readonly notBefore?: number
  readonly priority?: number
  readonly maxAttempts?: number
  readonly retryPolicy?: RetryPolicy
  readonly jobIdempotencyKey?: string
  readonly budgetGrantId?: string
}

export interface MaterializedDelegationGraphNode {
  readonly node: DelegationGraphNodeRecord
  readonly job: SchedulerJobRecord
}
