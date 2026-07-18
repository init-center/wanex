import type {
  AttachDelegationGraphNodeJobRequest,
  DelegationGraphDependencyRecord,
  DelegationGraphNodeRecord,
  DelegationGraphRecord,
  GetDelegationGraphNodeRequest,
  GetDelegationGraphRequest,
  ListDelegationGraphDependenciesRequest,
  ListDelegationGraphNodesRequest,
  ListDelegationGraphsRequest,
  ListReadyDelegationGraphNodesRequest,
  MaterializeReadyDelegationGraphNodeRequest,
  MaterializedDelegationGraphNode,
  PutDelegationGraphDependencyRequest,
  PutDelegationGraphNodeRequest,
  PutDelegationGraphRequest,
  UpdateDelegationGraphNodeStateRequest,
  UpdateDelegationGraphStateRequest
} from "@wanex/protocol"

export interface DelegationStore {
  putDelegationGraph(
    request: PutDelegationGraphRequest
  ): Promise<DelegationGraphRecord>
  getDelegationGraph(
    request: GetDelegationGraphRequest
  ): Promise<DelegationGraphRecord | null>
  listDelegationGraphs(
    request: ListDelegationGraphsRequest
  ): Promise<DelegationGraphRecord[]>
  putDelegationGraphNode(
    request: PutDelegationGraphNodeRequest
  ): Promise<DelegationGraphNodeRecord>
  getDelegationGraphNode(
    request: GetDelegationGraphNodeRequest
  ): Promise<DelegationGraphNodeRecord | null>
  listDelegationGraphNodes(
    request: ListDelegationGraphNodesRequest
  ): Promise<DelegationGraphNodeRecord[]>
  putDelegationGraphDependency(
    request: PutDelegationGraphDependencyRequest
  ): Promise<DelegationGraphDependencyRecord>
  listDelegationGraphDependencies(
    request: ListDelegationGraphDependenciesRequest
  ): Promise<DelegationGraphDependencyRecord[]>
  updateDelegationGraphState(
    request: UpdateDelegationGraphStateRequest
  ): Promise<DelegationGraphRecord>
  updateDelegationGraphNodeState(
    request: UpdateDelegationGraphNodeStateRequest
  ): Promise<DelegationGraphNodeRecord>
  attachDelegationGraphNodeJob(
    request: AttachDelegationGraphNodeJobRequest
  ): Promise<DelegationGraphNodeRecord>
  listReadyDelegationGraphNodes(
    request: ListReadyDelegationGraphNodesRequest
  ): Promise<DelegationGraphNodeRecord[]>
  materializeReadyDelegationGraphNode(
    request: MaterializeReadyDelegationGraphNodeRequest
  ): Promise<MaterializedDelegationGraphNode | null>
}
