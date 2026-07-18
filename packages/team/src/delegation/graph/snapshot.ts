import type { DelegationGraphStorage } from "./storage.js"
import type { DelegationGraphSnapshot } from "./types.js"

export async function getGraphSnapshot(
  storage: DelegationGraphStorage,
  graphId: string
): Promise<DelegationGraphSnapshot | null> {
  const graph = await storage.getDelegationGraph({ graphId })
  if (graph === null) {
    return null
  }
  const [nodes, dependencies] = await Promise.all([
    storage.listDelegationGraphNodes({ graphId }),
    storage.listDelegationGraphDependencies({ graphId })
  ])
  return { graph, nodes, dependencies }
}
