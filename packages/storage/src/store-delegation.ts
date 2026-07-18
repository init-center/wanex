import {
  type AttachDelegationGraphNodeJobRequest,
  type DelegationGraphDependencyRecord,
  type DelegationGraphNodeRecord,
  type DelegationGraphRecord,
  type GetDelegationGraphRequest,
  type GetDelegationGraphNodeRequest,
  type ListDelegationGraphDependenciesRequest,
  type ListDelegationGraphNodesRequest,
  type ListDelegationGraphsRequest,
  type ListReadyDelegationGraphNodesRequest,
  type MaterializeReadyDelegationGraphNodeRequest,
  type MaterializedDelegationGraphNode,
  type PutDelegationGraphDependencyRequest,
  type PutDelegationGraphNodeRequest,
  type PutDelegationGraphRequest,
  type UpdateDelegationGraphNodeStateRequest,
  type UpdateDelegationGraphStateRequest
} from "@wanex/protocol"

import {
  fromRpcDelegationGraphDependencyRecord,
  fromRpcDelegationGraphNodeRecord,
  fromRpcDelegationGraphRecord,
  fromRpcMaterializedDelegationGraphNode,
  toRpcAttachDelegationGraphNodeJobRequest,
  toRpcGetDelegationGraphNodeRequest,
  toRpcListDelegationGraphDependenciesRequest,
  toRpcListDelegationGraphNodesRequest,
  toRpcListDelegationGraphsRequest,
  toRpcListReadyDelegationGraphNodesRequest,
  toRpcMaterializeReadyDelegationGraphNodeRequest,
  toRpcPutDelegationGraphDependencyRequest,
  toRpcPutDelegationGraphNodeRequest,
  toRpcPutDelegationGraphRequest,
  toRpcUpdateDelegationGraphNodeStateRequest,
  toRpcUpdateDelegationGraphStateRequest
} from "./codec-delegation.js"
import { assertArray } from "./codec-helpers.js"
import { RpcStoreFacetBase } from "./rpc-store-base.js"
import type { DelegationStorageRpcCommand } from "./generated/storage-rpc.js"

export class DelegationStoreMethods extends RpcStoreFacetBase {
  async putDelegationGraph(
    request: PutDelegationGraphRequest
  ): Promise<DelegationGraphRecord> {
    const value = await this.callDelegation({
      command: "put-delegation-graph",
      request: toRpcPutDelegationGraphRequest(request)
    })
    return fromRpcDelegationGraphRecord(value)
  }

  async getDelegationGraph(
    request: GetDelegationGraphRequest
  ): Promise<DelegationGraphRecord | null> {
    const value = await this.callDelegation({
      command: "get-delegation-graph",
      graph_id: request.graphId
    })
    return value === null ? null : fromRpcDelegationGraphRecord(value)
  }

  async listDelegationGraphs(
    request: ListDelegationGraphsRequest
  ): Promise<DelegationGraphRecord[]> {
    const value = await this.callDelegation({
      command: "list-delegation-graphs",
      request: toRpcListDelegationGraphsRequest(request)
    })
    assertArray(value, "delegation graphs")
    return value.map(fromRpcDelegationGraphRecord)
  }

  async putDelegationGraphNode(
    request: PutDelegationGraphNodeRequest
  ): Promise<DelegationGraphNodeRecord> {
    const value = await this.callDelegation({
      command: "put-delegation-graph-node",
      request: toRpcPutDelegationGraphNodeRequest(request)
    })
    return fromRpcDelegationGraphNodeRecord(value)
  }

  async getDelegationGraphNode(
    request: GetDelegationGraphNodeRequest
  ): Promise<DelegationGraphNodeRecord | null> {
    const value = await this.callDelegation({
      command: "get-delegation-graph-node",
      request: toRpcGetDelegationGraphNodeRequest(request)
    })
    return value === null ? null : fromRpcDelegationGraphNodeRecord(value)
  }

  async listDelegationGraphNodes(
    request: ListDelegationGraphNodesRequest
  ): Promise<DelegationGraphNodeRecord[]> {
    const value = await this.callDelegation({
      command: "list-delegation-graph-nodes",
      request: toRpcListDelegationGraphNodesRequest(request)
    })
    assertArray(value, "delegation graph nodes")
    return value.map(fromRpcDelegationGraphNodeRecord)
  }

  async putDelegationGraphDependency(
    request: PutDelegationGraphDependencyRequest
  ): Promise<DelegationGraphDependencyRecord> {
    const value = await this.callDelegation({
      command: "put-delegation-graph-dependency",
      request: toRpcPutDelegationGraphDependencyRequest(request)
    })
    return fromRpcDelegationGraphDependencyRecord(value)
  }

  async listDelegationGraphDependencies(
    request: ListDelegationGraphDependenciesRequest
  ): Promise<DelegationGraphDependencyRecord[]> {
    const value = await this.callDelegation({
      command: "list-delegation-graph-dependencies",
      request: toRpcListDelegationGraphDependenciesRequest(request)
    })
    assertArray(value, "delegation graph dependencies")
    return value.map(fromRpcDelegationGraphDependencyRecord)
  }

  async updateDelegationGraphState(
    request: UpdateDelegationGraphStateRequest
  ): Promise<DelegationGraphRecord> {
    const value = await this.callDelegation({
      command: "update-delegation-graph-state",
      request: toRpcUpdateDelegationGraphStateRequest(request)
    })
    return fromRpcDelegationGraphRecord(value)
  }

  async updateDelegationGraphNodeState(
    request: UpdateDelegationGraphNodeStateRequest
  ): Promise<DelegationGraphNodeRecord> {
    const value = await this.callDelegation({
      command: "update-delegation-graph-node-state",
      request: toRpcUpdateDelegationGraphNodeStateRequest(request)
    })
    return fromRpcDelegationGraphNodeRecord(value)
  }

  async attachDelegationGraphNodeJob(
    request: AttachDelegationGraphNodeJobRequest
  ): Promise<DelegationGraphNodeRecord> {
    const value = await this.callDelegation({
      command: "attach-delegation-graph-node-job",
      request: toRpcAttachDelegationGraphNodeJobRequest(request)
    })
    return fromRpcDelegationGraphNodeRecord(value)
  }

  async listReadyDelegationGraphNodes(
    request: ListReadyDelegationGraphNodesRequest
  ): Promise<DelegationGraphNodeRecord[]> {
    const value = await this.callDelegation({
      command: "list-ready-delegation-graph-nodes",
      request: toRpcListReadyDelegationGraphNodesRequest(request)
    })
    assertArray(value, "ready delegation graph nodes")
    return value.map(fromRpcDelegationGraphNodeRecord)
  }

  async materializeReadyDelegationGraphNode(
    request: MaterializeReadyDelegationGraphNodeRequest
  ): Promise<MaterializedDelegationGraphNode | null> {
    const value = await this.callDelegation({
      command: "materialize-ready-delegation-graph-node",
      request: toRpcMaterializeReadyDelegationGraphNodeRequest(request)
    })
    return value === null ? null : fromRpcMaterializedDelegationGraphNode(value)
  }

  private callDelegation(request: DelegationStorageRpcCommand) {
    return this.call(request)
  }
}
