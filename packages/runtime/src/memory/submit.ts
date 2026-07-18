import type { SchedulerJobRecord } from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"
import { memoryCompactionPayloadToJson } from "./payload-codec.js"
import type {
  MemoryCompactionJobPayload,
  SubmitMemoryCompactionJobRequest
} from "./types.js"

export async function submitMemoryCompactionJob(
  storage: CoreStore,
  request: SubmitMemoryCompactionJobRequest
): Promise<SchedulerJobRecord> {
  const payload: MemoryCompactionJobPayload = {
    sessionId: request.sessionId,
    ...(request.policy === undefined ? {} : { policy: request.policy }),
    ...(request.metadata === undefined ? {} : { metadata: request.metadata })
  }
  return await storage.enqueueJob({
    ...(request.id === undefined ? {} : { id: request.id }),
    kind: "memory.compaction",
    principalId: request.principalId,
    payload: memoryCompactionPayloadToJson(payload),
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
    ...(request.idempotencyKey === undefined
      ? {}
      : { idempotencyKey: request.idempotencyKey }),
    ...(request.budgetGrantId === undefined
      ? {}
      : { budgetGrantId: request.budgetGrantId })
  })
}
