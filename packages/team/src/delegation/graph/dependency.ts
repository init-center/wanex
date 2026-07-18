import type { DelegationGraphDependencyRecord } from "@wanex/protocol"
import type { DelegationGraphStorage } from "./storage.js"
import type { AddDelegationGraphDependencyRequest } from "./types.js"

export async function addDependency(
  storage: DelegationGraphStorage,
  request: AddDelegationGraphDependencyRequest
): Promise<DelegationGraphDependencyRecord> {
  return await storage.putDelegationGraphDependency({
    ...(request.id === undefined ? {} : { id: request.id }),
    graphId: request.graphId,
    fromNodeId: request.fromNodeId,
    toNodeId: request.toNodeId,
    ...(request.kind === undefined ? {} : { kind: request.kind })
  })
}

export async function listDependencies(
  storage: DelegationGraphStorage,
  graphId: string
): Promise<DelegationGraphDependencyRecord[]> {
  return await storage.listDelegationGraphDependencies({ graphId })
}
