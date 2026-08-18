import type { JsonValue } from "@wanex/protocol"
import type { MemoryCompactionJobResult } from "./types.js"

export function memoryCompactionJobResultToJson(
  result: MemoryCompactionJobResult
): JsonValue {
  return {
    sessionId: result.sessionId,
    epochId: result.epochId,
    cutSequence: result.cutSequence,
    summaryDigest: result.summaryDigest,
    tokenEstimateBefore: result.tokenEstimateBefore,
    tokenEstimateAfter: result.tokenEstimateAfter,
    ...(result.metadata === undefined ? {} : { metadata: result.metadata }),
    ...(result.prune === undefined
      ? {}
      : {
          prune: {
            sessionId: result.prune.sessionId,
            scannedCount: result.prune.scannedCount,
            deletedEpochIds: [...result.prune.deletedEpochIds],
            dryRun: result.prune.dryRun
          }
        })
  }
}
