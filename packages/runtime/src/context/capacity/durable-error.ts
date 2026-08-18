import {
  SESSION_TURN_CONTEXT_CAPACITY_ERROR_KIND,
  type SessionTurnContextCapacityError
} from "@wanex/protocol"
import type { ContextCapacityFailureDetail } from "./types.js"

const MAX_MESSAGE_CHARS = 512
const MAX_COMPACTION_REASON_CHARS = 1_024

export function durableContextCapacityError(
  detail: ContextCapacityFailureDetail
): SessionTurnContextCapacityError {
  const reasons = [...new Set(detail.estimate.reasons)]
  const message = boundedText(
    `Provider request exceeds known model capacity: ${reasons.join(", ")}`,
    MAX_MESSAGE_CHARS
  )
  return {
    kind: SESSION_TURN_CONTEXT_CAPACITY_ERROR_KIND,
    message,
    capacity: {
      reasons,
      inputTokens: detail.estimate.inputTokens,
      ...(detail.estimate.inputTokenCeiling === undefined
        ? {}
        : { inputTokenCeiling: detail.estimate.inputTokenCeiling }),
      inputResources: detail.estimate.inputResources,
      ...(detail.estimate.maxInputResources === undefined
        ? {}
        : { maxInputResources: detail.estimate.maxInputResources }),
      requestedOutputTokens: detail.estimate.requestedOutputTokens,
      compactionAttempted: detail.compactionAttempted,
      ...(detail.compactionReason === undefined
        ? {}
        : {
            compactionReason: boundedText(
              detail.compactionReason,
              MAX_COMPACTION_REASON_CHARS
            )
          })
    }
  }
}

function boundedText(value: string, maxChars: number): string {
  return value.length <= maxChars ? value : value.slice(0, maxChars)
}
