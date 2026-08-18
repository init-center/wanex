import {
  createRuntimeEvent,
  type JsonValue,
  type RuntimeEventType,
  type SchedulerJobRecord,
  type SessionId
} from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"

export type MemoryCompactionEventType =
  | "context.compaction.planned"
  | "context.compaction.applied"
  | "context.compaction.skipped"
  | "context.compaction.failed"
  | "context.epoch.created"
  | "context.epoch.activated"
  | "context.epoch.superseded"

export interface AppendMemoryCompactionEventOptions {
  readonly storage: CoreStore
  readonly type: MemoryCompactionEventType
  readonly job: SchedulerJobRecord
  readonly sessionId: SessionId
  readonly payload?: JsonValue
  readonly now?: () => number
}

export async function appendMemoryCompactionEvent(
  options: AppendMemoryCompactionEventOptions
): Promise<void> {
  await options.storage.appendEvent(
    createRuntimeEvent({
      id: memoryCompactionEventId(options.job, options.type),
      type: options.type as RuntimeEventType,
      scope: {
        sessionId: options.sessionId
      },
      payload: {
        jobId: options.job.id,
        attempt: options.job.attempt,
        ...(options.payload === undefined ? {} : { detail: options.payload })
      },
      occurredAt: (options.now ?? Date.now)()
    })
  )
}

function memoryCompactionEventId(
  job: SchedulerJobRecord,
  type: MemoryCompactionEventType
): string {
  return `evt_${job.id}_attempt_${job.attempt}_${type.replaceAll(".", "_")}`
}
