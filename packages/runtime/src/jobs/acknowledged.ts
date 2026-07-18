import type { SchedulerJobRecord } from "@wanex/protocol"
import type { WorkerAcknowledgedResult } from "./types.js"

export function workerAcknowledged(
  job: SchedulerJobRecord,
  error?: Error
): WorkerAcknowledgedResult {
  return {
    acknowledged: true,
    job,
    ...(error === undefined ? {} : { error })
  }
}

export function isWorkerAcknowledgedResult(
  value: unknown
): value is WorkerAcknowledgedResult {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as WorkerAcknowledgedResult).acknowledged === true &&
    (value as WorkerAcknowledgedResult).job !== undefined
  )
}
