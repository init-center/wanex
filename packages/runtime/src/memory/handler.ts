import type { ContextEpochRecord } from "@wanex/protocol"
import type { WanexWorker, WorkerHandler } from "../jobs/index.js"
import {
  modelEndpointFromExecutionBinding,
  providerFromModelEndpoint,
  sameModelDescriptor,
  type ProviderAdapter
} from "../provider/index.js"
import {
  contextEpochIdForJob,
  executeContextEpoch
} from "./executor.js"
import { memoryCompactionPayloadFromJson } from "./payload-codec.js"
import type { MemoryCompactionHandlerOptions } from "./types.js"

export function createMemoryCompactionJobHandler(
  options: MemoryCompactionHandlerOptions
): WorkerHandler {
  return async ({ job, signal, heartbeat }) => {
    const payload = memoryCompactionPayloadFromJson(job.payload)
    const provider = await resolveSummaryProvider(
      options,
      payload.evidence.modelEndpoint
    )
    return await executeContextEpoch({
      storage: options.storage,
      job,
      epochId: contextEpochIdForJob(job.id),
      evidence: payload.evidence,
      provider,
      signal,
      heartbeat,
      ...(options.tokenEstimator === undefined
        ? {}
        : { tokenEstimator: options.tokenEstimator }),
      ...(options.retention === undefined ? {} : { retention: options.retention }),
      ...(payload.metadata === undefined ? {} : { metadata: payload.metadata }),
      ...(options.now === undefined ? {} : { now: options.now })
    })
  }
}

export function registerMemoryCompactionJobHandler(
  worker: WanexWorker,
  options: MemoryCompactionHandlerOptions
): void {
  worker.register("memory.compaction", createMemoryCompactionJobHandler(options))
}

async function resolveSummaryProvider(
  options: MemoryCompactionHandlerOptions,
  binding: ContextEpochRecord["modelEndpoint"]
): Promise<ProviderAdapter> {
  const direct = options.directProvider
  if (
    direct !== undefined &&
    direct.protocol.id === binding.protocol.id &&
    direct.providerId === binding.connection.providerId &&
    sameModelDescriptor(direct.model, binding.model)
  ) {
    return direct
  }
  return await providerFromModelEndpoint(
    modelEndpointFromExecutionBinding(binding),
    options.secretResolver
  )
}
