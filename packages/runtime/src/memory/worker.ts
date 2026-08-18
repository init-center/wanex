import { WanexSessionCore } from "../sessions/index.js"
import { WanexWorker } from "../jobs/index.js"
import { registerMemoryCompactionJobHandler } from "./handler.js"
import type { CreateMemoryCompactionWorkerOptions } from "./types.js"

const DEFAULT_LEASE_MS = 60_000

export function createMemoryCompactionWorker(
  options: CreateMemoryCompactionWorkerOptions
): WanexWorker {
  const worker = new WanexWorker({
    session: new WanexSessionCore({ storage: options.storage }),
    workerId: options.workerId,
    leaseMs: options.leaseMs ?? DEFAULT_LEASE_MS,
    kinds: ["memory.compaction"],
    ...(options.heartbeatIntervalMs === undefined
      ? {}
      : { heartbeatIntervalMs: options.heartbeatIntervalMs }),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs })
  })
  registerMemoryCompactionJobHandler(worker, {
    storage: options.storage,
    ...(options.directProvider === undefined
      ? {}
      : { directProvider: options.directProvider }),
    ...(options.secretResolver === undefined
      ? {}
      : { secretResolver: options.secretResolver }),
    ...(options.tokenEstimator === undefined
      ? {}
      : { tokenEstimator: options.tokenEstimator }),
    ...(options.retention === undefined ? {} : { retention: options.retention }),
    ...(options.now === undefined ? {} : { now: options.now })
  })
  return worker
}
