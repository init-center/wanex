import type {
  DelegationDependencyKind,
  DelegationGraphDependencyRecord,
  DelegationGraphNodeRecord,
  DelegationGraphRecord,
  DelegationGraphState,
  DelegationNodeKind,
  DelegationNodeState,
  JsonValue,
  MaterializedDelegationGraphNode,
  PrincipalId,
  RetryPolicy,
  SchedulerJobRecord,
  SchedulerJobKind
} from "@wanex/protocol"
import type { DelegationGraphRuntimeStorage } from "./storage.js"

export interface DelegationGraphRuntimeOptions {
  readonly storage: DelegationGraphRuntimeStorage
  readonly principalId?: PrincipalId
}

export interface CreateDelegationGraphRequest {
  readonly id?: string
  readonly principalId?: PrincipalId
  readonly title?: string
  readonly metadata?: JsonValue
  readonly idempotencyKey?: string
}

export interface AddDelegationGraphNodeRequest {
  readonly id?: string
  readonly graphId: string
  readonly kind: DelegationNodeKind
  readonly principalId?: PrincipalId
  readonly payload: JsonValue
  readonly metadata?: JsonValue
  readonly idempotencyKey?: string
}

export interface AddDelegationGraphDependencyRequest {
  readonly id?: string
  readonly graphId: string
  readonly fromNodeId: string
  readonly toNodeId: string
  readonly kind?: DelegationDependencyKind
}

export interface UpdateDelegationGraphNodeStateRequest {
  readonly nodeId: string
  readonly state: DelegationNodeState
  readonly schedulerJobId?: string
  readonly metadata?: JsonValue
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

export interface DelegationGraphSnapshot {
  readonly graph: DelegationGraphRecord
  readonly nodes: readonly DelegationGraphNodeRecord[]
  readonly dependencies: readonly DelegationGraphDependencyRecord[]
}

export type DelegationGraphProgressState =
  | "empty"
  | "not_started"
  | "active"
  | "blocked"
  | "succeeded"
  | "failed"
  | "cancelled"

export interface DelegationGraphNodeStateCounts {
  readonly pending: number
  readonly ready: number
  readonly running: number
  readonly succeeded: number
  readonly failed: number
  readonly cancelled: number
  readonly skipped: number
}

export interface DelegationGraphBlockedNode {
  readonly node: DelegationGraphNodeRecord
  readonly blockedBy: readonly DelegationGraphDependencyRecord[]
}

export interface DelegationGraphStatus {
  readonly graph: DelegationGraphRecord
  readonly progressState: DelegationGraphProgressState
  readonly nodeCount: number
  readonly dependencyCount: number
  readonly completedNodeCount: number
  readonly activeNodeCount: number
  readonly blockedNodeCount: number
  readonly progressRatio: number
  readonly counts: DelegationGraphNodeStateCounts
  readonly readyNodes: readonly DelegationGraphNodeRecord[]
  readonly runningNodes: readonly DelegationGraphNodeRecord[]
  readonly blockedNodes: readonly DelegationGraphBlockedNode[]
  readonly failedNodes: readonly DelegationGraphNodeRecord[]
  readonly cancelledNodes: readonly DelegationGraphNodeRecord[]
}

export interface ListDelegationGraphsRuntimeRequest {
  readonly principalId?: PrincipalId
  readonly state?: DelegationGraphState
  readonly limit?: number
}

export type DelegationGraphJobSyncReason =
  | "missing_node"
  | "no_scheduler_job"
  | "missing_job"
  | "non_terminal_job"
  | "already_terminal"

export interface DelegationGraphJobSyncNoop {
  readonly status: "noop"
  readonly reason: DelegationGraphJobSyncReason
  readonly node?: DelegationGraphNodeRecord
  readonly job?: SchedulerJobRecord
}

export interface DelegationGraphJobSynced {
  readonly status: "synced"
  readonly node: DelegationGraphNodeRecord
  readonly job: SchedulerJobRecord
}

export type DelegationGraphJobSyncResult =
  | DelegationGraphJobSyncNoop
  | DelegationGraphJobSynced

export type DelegationGraphStepSkippedReadyReason =
  | "unsupported_node_kind"
  | "not_ready"

export interface DelegationGraphStepSkippedReadyNode {
  readonly node: DelegationGraphNodeRecord
  readonly reason: DelegationGraphStepSkippedReadyReason
}

export interface RunDelegationGraphStepRequest {
  readonly graphId: string
  readonly workerId: string
  readonly jobKindsByNodeKind: Partial<
    Readonly<Record<DelegationNodeKind, SchedulerJobKind>>
  >
  readonly materializeLimit?: number
  readonly readyScanLimit?: number
}

export interface DelegationGraphStepResult {
  readonly graphId: string
  readonly synced: readonly DelegationGraphJobSynced[]
  readonly syncNoops: readonly DelegationGraphJobSyncNoop[]
  readonly materialized: readonly MaterializedDelegationGraphNode[]
  readonly skippedReadyNodes: readonly DelegationGraphStepSkippedReadyNode[]
}
