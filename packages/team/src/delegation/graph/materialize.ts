import type { MaterializedDelegationGraphNode } from "@wanex/protocol"
import type { DelegationGraphStorage } from "./storage.js"
import type { MaterializeReadyDelegationGraphNodeRequest } from "./types.js"

export async function materializeReadyNode(
  storage: DelegationGraphStorage,
  request: MaterializeReadyDelegationGraphNodeRequest
): Promise<MaterializedDelegationGraphNode | null> {
  return await storage.materializeReadyDelegationGraphNode({
    graphId: request.graphId,
    workerId: request.workerId,
    jobKind: request.jobKind,
    ...(request.nodeId === undefined ? {} : { nodeId: request.nodeId }),
    ...(request.jobId === undefined ? {} : { jobId: request.jobId }),
    ...(request.jobPayload === undefined ? {} : { jobPayload: request.jobPayload }),
    ...(request.scheduledAt === undefined
      ? {}
      : { scheduledAt: request.scheduledAt }),
    ...(request.notBefore === undefined ? {} : { notBefore: request.notBefore }),
    ...(request.priority === undefined ? {} : { priority: request.priority }),
    ...(request.maxAttempts === undefined
      ? {}
      : { maxAttempts: request.maxAttempts }),
    ...(request.retryPolicy === undefined
      ? {}
      : { retryPolicy: request.retryPolicy }),
    ...(request.jobIdempotencyKey === undefined
      ? {}
      : { jobIdempotencyKey: request.jobIdempotencyKey }),
    ...(request.budgetGrantId === undefined
      ? {}
      : { budgetGrantId: request.budgetGrantId })
  })
}
