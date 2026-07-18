import type {
  DelegationGraphDependencyRecord,
  DelegationGraphNodeRecord,
  DelegationGraphRecord,
  DelegationGraphState,
  DelegationNodeState,
  JsonValue,
  MaterializedDelegationGraphNode,
  PrincipalId
} from "@wanex/protocol"
import { addDependency, listDependencies } from "./dependency.js"
import {
  createGraph,
  getGraph,
  listGraphs,
  updateGraphState
} from "./graph.js"
import { materializeReadyNode } from "./materialize.js"
import {
  addNode,
  attachNodeJob,
  listNodes,
  listReadyNodes,
  markNodeState,
  updateNodeState
} from "./node.js"
import { getGraphSnapshot } from "./snapshot.js"
import { syncMaterializedNodeJob } from "./job-sync.js"
import { runDelegationGraphStep } from "./step.js"
import { getGraphStatus } from "./status.js"
import type { DelegationGraphRuntimeStorage } from "./storage.js"
import type {
  AddDelegationGraphDependencyRequest,
  AddDelegationGraphNodeRequest,
  CreateDelegationGraphRequest,
  DelegationGraphSnapshot,
  DelegationGraphStatus,
  DelegationGraphJobSyncResult,
  DelegationGraphStepResult,
  ListDelegationGraphsRuntimeRequest,
  MaterializeReadyDelegationGraphNodeRequest,
  RunDelegationGraphStepRequest,
  UpdateDelegationGraphNodeStateRequest,
  DelegationGraphRuntimeOptions
} from "./types.js"

export const WANEX_TEAM_DELEGATION_GRAPH =
  "wanex-team-delegation-graph" as const

const DEFAULT_PRINCIPAL_ID = "team-delegation-graph"

export class DelegationGraphRuntime {
  private readonly storage: DelegationGraphRuntimeStorage
  private readonly principalId: PrincipalId

  constructor(options: DelegationGraphRuntimeOptions) {
    this.storage = options.storage
    this.principalId = options.principalId ?? DEFAULT_PRINCIPAL_ID
  }

  async createGraph(
    request: CreateDelegationGraphRequest = {}
  ): Promise<DelegationGraphRecord> {
    return await createGraph({
      storage: this.storage,
      request,
      defaultPrincipalId: this.principalId
    })
  }

  async getGraph(graphId: string): Promise<DelegationGraphRecord | null> {
    return await getGraph(this.storage, graphId)
  }

  async listGraphs(
    request: ListDelegationGraphsRuntimeRequest = {}
  ): Promise<DelegationGraphRecord[]> {
    return await listGraphs(this.storage, request)
  }

  async updateGraphState(
    graphId: string,
    state: DelegationGraphState
  ): Promise<DelegationGraphRecord> {
    return await updateGraphState(this.storage, graphId, state)
  }

  async addNode(
    request: AddDelegationGraphNodeRequest
  ): Promise<DelegationGraphNodeRecord> {
    return await addNode({
      storage: this.storage,
      request,
      defaultPrincipalId: this.principalId
    })
  }

  async listNodes(
    graphId: string,
    state?: DelegationNodeState
  ): Promise<DelegationGraphNodeRecord[]> {
    return await listNodes(this.storage, graphId, state)
  }

  async addDependency(
    request: AddDelegationGraphDependencyRequest
  ): Promise<DelegationGraphDependencyRecord> {
    return await addDependency(this.storage, request)
  }

  async listDependencies(
    graphId: string
  ): Promise<DelegationGraphDependencyRecord[]> {
    return await listDependencies(this.storage, graphId)
  }

  async listReadyNodes(
    graphId: string,
    limit?: number
  ): Promise<DelegationGraphNodeRecord[]> {
    return await listReadyNodes(this.storage, graphId, limit)
  }

  async attachNodeJob(
    nodeId: string,
    schedulerJobId: string
  ): Promise<DelegationGraphNodeRecord> {
    return await attachNodeJob(this.storage, nodeId, schedulerJobId)
  }

  async materializeReadyNode(
    request: MaterializeReadyDelegationGraphNodeRequest
  ): Promise<MaterializedDelegationGraphNode | null> {
    return await materializeReadyNode(this.storage, request)
  }

  async updateNodeState(
    request: UpdateDelegationGraphNodeStateRequest
  ): Promise<DelegationGraphNodeRecord> {
    return await updateNodeState(this.storage, request)
  }

  async markNodeReady(nodeId: string): Promise<DelegationGraphNodeRecord> {
    return await markNodeState({ storage: this.storage, nodeId, state: "ready" })
  }

  async markNodeRunning(
    nodeId: string,
    schedulerJobId?: string
  ): Promise<DelegationGraphNodeRecord> {
    return await markNodeState({
      storage: this.storage,
      nodeId,
      state: "running",
      ...(schedulerJobId === undefined ? {} : { schedulerJobId })
    })
  }

  async markNodeSucceeded(
    nodeId: string,
    metadata?: JsonValue
  ): Promise<DelegationGraphNodeRecord> {
    return await markNodeState({
      storage: this.storage,
      nodeId,
      state: "succeeded",
      ...(metadata === undefined ? {} : { metadata })
    })
  }

  async markNodeFailed(
    nodeId: string,
    metadata?: JsonValue
  ): Promise<DelegationGraphNodeRecord> {
    return await markNodeState({
      storage: this.storage,
      nodeId,
      state: "failed",
      ...(metadata === undefined ? {} : { metadata })
    })
  }

  async markNodeCancelled(
    nodeId: string,
    metadata?: JsonValue
  ): Promise<DelegationGraphNodeRecord> {
    return await markNodeState({
      storage: this.storage,
      nodeId,
      state: "cancelled",
      ...(metadata === undefined ? {} : { metadata })
    })
  }

  async markNodeSkipped(
    nodeId: string,
    metadata?: JsonValue
  ): Promise<DelegationGraphNodeRecord> {
    return await markNodeState({
      storage: this.storage,
      nodeId,
      state: "skipped",
      ...(metadata === undefined ? {} : { metadata })
    })
  }

  async getGraphSnapshot(
    graphId: string
  ): Promise<DelegationGraphSnapshot | null> {
    return await getGraphSnapshot(this.storage, graphId)
  }

  async getGraphStatus(
    graphId: string
  ): Promise<DelegationGraphStatus | null> {
    return await getGraphStatus(this.storage, graphId)
  }

  async syncMaterializedNodeJob(
    nodeId: string
  ): Promise<DelegationGraphJobSyncResult> {
    return await syncMaterializedNodeJob({
      storage: this.storage,
      nodeId
    })
  }

  async runGraphStep(
    request: RunDelegationGraphStepRequest
  ): Promise<DelegationGraphStepResult> {
    return await runDelegationGraphStep({
      storage: this.storage,
      request
    })
  }
}
