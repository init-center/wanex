import type {
  DelegationGraphNodeRecord,
  MaterializedDelegationGraphNode
} from "@wanex/protocol"
import { syncMaterializedNodeJob } from "./job-sync.js"
import type { DelegationGraphRuntimeStorage } from "./storage.js"
import type {
  DelegationGraphJobSyncNoop,
  DelegationGraphJobSynced,
  DelegationGraphStepResult,
  DelegationGraphStepSkippedReadyNode,
  RunDelegationGraphStepRequest
} from "./types.js"

export async function runDelegationGraphStep(input: {
  readonly storage: DelegationGraphRuntimeStorage
  readonly request: RunDelegationGraphStepRequest
}): Promise<DelegationGraphStepResult> {
  const materializeLimit = input.request.materializeLimit ?? 1
  if (!Number.isInteger(materializeLimit) || materializeLimit < 0) {
    throw new Error("delegation graph materializeLimit must be a non-negative integer")
  }
  if (
    input.request.readyScanLimit !== undefined &&
    (!Number.isInteger(input.request.readyScanLimit) ||
      input.request.readyScanLimit < 0)
  ) {
    throw new Error("delegation graph readyScanLimit must be a non-negative integer")
  }

  const { synced, syncNoops } = await syncRunningNodes({
    storage: input.storage,
    graphId: input.request.graphId
  })
  const { materialized, skippedReadyNodes } =
    materializeLimit === 0
      ? { materialized: [], skippedReadyNodes: [] }
      : await materializeReadyNodes({
          storage: input.storage,
          request: input.request,
          materializeLimit
        })

  return {
    graphId: input.request.graphId,
    synced,
    syncNoops,
    materialized,
    skippedReadyNodes
  }
}

async function syncRunningNodes(input: {
  readonly storage: DelegationGraphRuntimeStorage
  readonly graphId: string
}): Promise<{
  readonly synced: DelegationGraphJobSynced[]
  readonly syncNoops: DelegationGraphJobSyncNoop[]
}> {
  const runningNodes = await input.storage.listDelegationGraphNodes({
    graphId: input.graphId,
    state: "running"
  })
  const synced: DelegationGraphJobSynced[] = []
  const syncNoops: DelegationGraphJobSyncNoop[] = []
  for (const node of runningNodes) {
    if (node.schedulerJobId === undefined) {
      continue
    }
    const result = await syncMaterializedNodeJob({
      storage: input.storage,
      nodeId: node.id
    })
    if (result.status === "synced") {
      synced.push(result)
    } else {
      syncNoops.push(result)
    }
  }
  return { synced, syncNoops }
}

async function materializeReadyNodes(input: {
  readonly storage: DelegationGraphRuntimeStorage
  readonly request: RunDelegationGraphStepRequest
  readonly materializeLimit: number
}): Promise<{
  readonly materialized: MaterializedDelegationGraphNode[]
  readonly skippedReadyNodes: DelegationGraphStepSkippedReadyNode[]
}> {
  const readyNodes = await input.storage.listReadyDelegationGraphNodes({
    graphId: input.request.graphId,
    limit: input.request.readyScanLimit ?? Math.max(input.materializeLimit, 1)
  })
  const materialized: MaterializedDelegationGraphNode[] = []
  const skippedReadyNodes: DelegationGraphStepSkippedReadyNode[] = []
  for (const node of readyNodes) {
    if (materialized.length >= input.materializeLimit) {
      break
    }
    const jobKind = input.request.jobKindsByNodeKind[node.kind]
    if (jobKind === undefined) {
      skippedReadyNodes.push({ node, reason: "unsupported_node_kind" })
      continue
    }
    const result = await input.storage.materializeReadyDelegationGraphNode({
      graphId: input.request.graphId,
      nodeId: node.id,
      workerId: input.request.workerId,
      jobKind
    })
    if (result === null) {
      skippedReadyNodes.push({ node, reason: "not_ready" })
      continue
    }
    materialized.push(result)
  }
  return { materialized, skippedReadyNodes }
}
