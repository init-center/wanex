import {
  prepareForcedContextCompaction
} from "../memory/sources.js"
import type {
  ModelEndpointExecutionBinding,
  SchedulerJobRecord
} from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"
import {
  contextEpochIdForJob,
  executeContextEpoch
} from "../../memory/executor.js"
import type { ProviderAdapter } from "../../provider/index.js"
import type {
  ContextCapacityCompactor,
  ContextCapacityEstimate
} from "./types.js"

export function createInlineContextCapacityCompactor(options: {
  readonly storage: CoreStore
  readonly job: SchedulerJobRecord
  readonly modelEndpoint: ModelEndpointExecutionBinding
  readonly provider: ProviderAdapter
}): ContextCapacityCompactor {
  return async ({ sessionId, estimate, signal, heartbeat }) => {
    await heartbeat()
    if (signal?.aborted) {
      throw new Error("inline context compaction aborted before planning")
    }
    const replayCeiling = availableReplayCeiling(estimate)
    if (replayCeiling !== undefined && replayCeiling <= 0) {
      return { status: "skipped", reason: "request overhead exhausts input capacity" }
    }
    const [messages, turns, activeEpoch] = await Promise.all([
      options.storage.listSessionMessages({ sessionId }),
      options.storage.listSessionTurns({ sessionId }),
      options.storage.getActiveContextEpoch({ sessionId })
    ])
    const summaryOutputLimit = Math.min(
      4_096,
      Math.max(1, Math.floor((replayCeiling ?? 16_384) / 4))
    )
    const prepared = prepareForcedContextCompaction({
      sessionId,
      messages,
      turns,
      activeEpoch,
      modelEndpoint: options.modelEndpoint,
      ...(replayCeiling === undefined
        ? {}
        : { inputTokenCeiling: replayCeiling }),
      policy: {
        keepRecentTokens: 0,
        minimumRecentTurns: 0,
        maxSummaryOutputTokens: summaryOutputLimit,
        minimumTokenSavings: 0
      }
    })
    if (prepared.decision !== "submit" || prepared.evidence === undefined) {
      return { status: "skipped", reason: prepared.reason }
    }
    if (signal === undefined) {
      throw new Error("inline context compaction requires the active Turn signal")
    }
    await executeContextEpoch({
      storage: options.storage,
      job: options.job,
      epochId: contextEpochIdForJob(options.job.id),
      evidence: prepared.evidence,
      provider: options.provider,
      signal,
      heartbeat
    })
    return { status: "compacted" }
  }
}

function availableReplayCeiling(
  estimate: ContextCapacityEstimate
): number | undefined {
  return estimate.inputTokenCeiling === undefined
    ? undefined
    : estimate.inputTokenCeiling - estimate.toolDefinitionTokens
}
