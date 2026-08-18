import type {
  DelegationGraphNodeRecord,
  DelegationNodeState,
  JsonValue,
  SchedulerJobRecord,
  SchedulerJobState
} from "@wanex/protocol"
import type { DelegationGraphRuntimeStorage } from "./storage.js"
import type { DelegationGraphJobSyncResult } from "./types.js"

const TERMINAL_NODE_STATES = new Set<DelegationNodeState>([
  "succeeded",
  "failed",
  "cancelled",
  "skipped"
])

export async function syncMaterializedNodeJob(input: {
  readonly storage: DelegationGraphRuntimeStorage
  readonly nodeId: string
}): Promise<DelegationGraphJobSyncResult> {
  const node = await input.storage.getDelegationGraphNode({
    nodeId: input.nodeId
  })
  if (node === null) {
    return { status: "noop", reason: "missing_node" }
  }
  if (TERMINAL_NODE_STATES.has(node.state)) {
    return { status: "noop", reason: "already_terminal", node }
  }
  if (node.schedulerJobId === undefined) {
    return { status: "noop", reason: "no_scheduler_job", node }
  }
  const job = await input.storage.getJob({ jobId: node.schedulerJobId })
  if (job === null) {
    return { status: "noop", reason: "missing_job", node }
  }
  const terminalNodeState = terminalNodeStateForJob(job.state)
  if (terminalNodeState === null) {
    return { status: "noop", reason: "non_terminal_job", node, job }
  }
  const updated = await input.storage.updateDelegationGraphNodeState({
    nodeId: node.id,
    state: terminalNodeState,
    metadata: metadataForJob(job)
  })
  return {
    status: "synced",
    node: updated,
    job
  }
}

function terminalNodeStateForJob(
  state: SchedulerJobState
): DelegationNodeState | null {
  switch (state) {
    case "succeeded":
      return "succeeded"
    case "failed":
      return "failed"
    case "cancelled":
      return "cancelled"
    case "pending":
    case "ready":
    case "running":
    case "waiting":
    case "retry_scheduled":
      return null
    default: {
      const exhaustive: never = state
      throw new Error(`unknown scheduler job state: ${exhaustive}`)
    }
  }
}

function metadataForJob(job: SchedulerJobRecord): JsonValue {
  return {
    schedulerJob: {
      id: job.id,
      kind: job.kind,
      state: job.state,
      attempt: job.attempt,
      ...(job.result === undefined ? {} : { result: job.result }),
      ...(job.lastError === undefined ? {} : { lastError: job.lastError }),
      ...(job.finishedAt === undefined ? {} : { finishedAt: job.finishedAt })
    }
  }
}
