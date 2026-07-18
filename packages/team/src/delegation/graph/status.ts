import type {
  DelegationGraphDependencyRecord,
  DelegationGraphNodeRecord,
  DelegationNodeState
} from "@wanex/protocol"
import type { DelegationGraphStorage } from "./storage.js"
import { getGraphSnapshot } from "./snapshot.js"
import type {
  DelegationGraphBlockedNode,
  DelegationGraphNodeStateCounts,
  DelegationGraphProgressState,
  DelegationGraphSnapshot,
  DelegationGraphStatus
} from "./types.js"

const TERMINAL_NODE_STATES = new Set<DelegationNodeState>([
  "succeeded",
  "failed",
  "cancelled",
  "skipped"
])

export async function getGraphStatus(
  storage: DelegationGraphStorage,
  graphId: string
): Promise<DelegationGraphStatus | null> {
  const snapshot = await getGraphSnapshot(storage, graphId)
  return snapshot === null ? null : buildGraphStatus(snapshot)
}

export function buildGraphStatus(
  snapshot: DelegationGraphSnapshot
): DelegationGraphStatus {
  const counts = countNodeStates(snapshot.nodes)
  const blockedNodes = blockedPendingNodes(snapshot)
  const blockedNodeIds = new Set(blockedNodes.map((item) => item.node.id))
  const readyNodes = snapshot.nodes.filter(
    (node) => isReadyCandidate(node) && !blockedNodeIds.has(node.id)
  )
  const runningNodes = snapshot.nodes.filter((node) => node.state === "running")
  const failedNodes = snapshot.nodes.filter((node) => node.state === "failed")
  const cancelledNodes = snapshot.nodes.filter((node) => node.state === "cancelled")
  const completedNodeCount =
    counts.succeeded + counts.failed + counts.cancelled + counts.skipped
  const activeNodeCount = readyNodes.length + runningNodes.length
  const nodeCount = snapshot.nodes.length

  return {
    graph: snapshot.graph,
    progressState: graphProgressState({
      nodeCount,
      counts,
      activeNodeCount,
      blockedNodeCount: blockedNodes.length
    }),
    nodeCount,
    dependencyCount: snapshot.dependencies.length,
    completedNodeCount,
    activeNodeCount,
    blockedNodeCount: blockedNodes.length,
    progressRatio: nodeCount === 0 ? 1 : completedNodeCount / nodeCount,
    counts,
    readyNodes,
    runningNodes,
    blockedNodes,
    failedNodes,
    cancelledNodes
  }
}

function countNodeStates(
  nodes: readonly DelegationGraphNodeRecord[]
): DelegationGraphNodeStateCounts {
  const counts: Record<DelegationNodeState, number> = {
    pending: 0,
    ready: 0,
    running: 0,
    succeeded: 0,
    failed: 0,
    cancelled: 0,
    skipped: 0
  }
  for (const node of nodes) {
    counts[node.state] += 1
  }
  return counts
}

function graphProgressState(input: {
  readonly nodeCount: number
  readonly counts: DelegationGraphNodeStateCounts
  readonly activeNodeCount: number
  readonly blockedNodeCount: number
}): DelegationGraphProgressState {
  if (input.nodeCount === 0) {
    return "empty"
  }
  if (input.counts.failed > 0) {
    return "failed"
  }
  if (input.counts.cancelled > 0) {
    return "cancelled"
  }
  if (input.counts.succeeded + input.counts.skipped === input.nodeCount) {
    return "succeeded"
  }
  if (input.activeNodeCount > 0) {
    return "active"
  }
  if (input.blockedNodeCount > 0) {
    return "blocked"
  }
  return "not_started"
}

function blockedPendingNodes(
  snapshot: DelegationGraphSnapshot
): DelegationGraphBlockedNode[] {
  const nodesById = new Map(snapshot.nodes.map((node) => [node.id, node]))
  const blocked: DelegationGraphBlockedNode[] = []
  for (const node of snapshot.nodes) {
    if (!isReadyCandidate(node)) {
      continue
    }
    const blockers = snapshot.dependencies.filter((dependency) => {
      if (dependency.toNodeId !== node.id) {
        return false
      }
      const source = nodesById.get(dependency.fromNodeId)
      return source === undefined || !dependencySatisfied(dependency, source)
    })
    if (blockers.length > 0) {
      blocked.push({
        node,
        blockedBy: blockers
      })
    }
  }
  return blocked
}

function isReadyCandidate(node: DelegationGraphNodeRecord): boolean {
  return (
    (node.state === "pending" || node.state === "ready") &&
    node.schedulerJobId === undefined
  )
}

function dependencySatisfied(
  dependency: DelegationGraphDependencyRecord,
  source: DelegationGraphNodeRecord
): boolean {
  if (dependency.kind === "after_success") {
    return source.state === "succeeded"
  }
  if (dependency.kind === "after_terminal") {
    return TERMINAL_NODE_STATES.has(source.state)
  }
  const exhaustive: never = dependency.kind
  throw new Error(`unknown delegation dependency kind: ${exhaustive}`)
}
