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
    evidence: request.evidence,
    ...(request.metadata === undefined ? {} : { metadata: request.metadata })
  }
  return await storage.enqueueJob({
    ...(request.id === undefined ? {} : { id: request.id }),
    kind: "memory.compaction",
    principalId: request.principalId,
    payload: memoryCompactionPayloadToJson(payload),
    concurrencyKey: `memory.compaction:${request.evidence.sessionId}`,
    ...(request.scheduledAt === undefined
      ? {}
      : { scheduledAt: request.scheduledAt }),
    ...(request.notBefore === undefined ? {} : { notBefore: request.notBefore }),
    ...(request.priority === undefined ? {} : { priority: request.priority }),
    maxAttempts: 1,
    ...(request.idempotencyKey === undefined
      ? {}
      : { idempotencyKey: request.idempotencyKey }),
    ...(request.budgetGrantId === undefined
      ? {}
      : { budgetGrantId: request.budgetGrantId })
  })
}
