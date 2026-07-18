import type { JsonValue } from "@wanex/protocol"
import type { MemoryCompactionJobResult } from "./types.js"

export function memoryCompactionJobResultToJson(
  result: MemoryCompactionJobResult
): JsonValue {
  return {
    sessionId: result.sessionId,
    epochId: result.epochId,
    policyVersion: result.policyVersion,
    tokenEstimateBefore: result.tokenEstimateBefore,
    tokenEstimateAfter: result.tokenEstimateAfter,
    replacementCount: result.replacementCount,
    replacementIds: [...result.replacementIds],
    ...(result.metadata === undefined ? {} : { metadata: result.metadata }),
    ...(result.prune === undefined
      ? {}
      : {
          prune: {
            sessionId: result.prune.sessionId,
            policyVersion: result.prune.policyVersion,
            scannedCount: result.prune.scannedCount,
            deletedEpochIds: [...result.prune.deletedEpochIds],
            deletedReplacementCount: result.prune.deletedReplacementCount,
            dryRun: result.prune.dryRun
          }
        })
  }
}
