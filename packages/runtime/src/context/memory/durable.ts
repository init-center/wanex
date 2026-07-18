import type {
  ContextReplacementRecord as DurableContextReplacementRecord
} from "@wanex/protocol"
import type { ContextReplacementRecord } from "./types.js"

export function fromDurableReplacement(
  record: DurableContextReplacementRecord
): ContextReplacementRecord {
  return {
    id: record.id,
    epochId: record.epochId,
    sessionId: record.sessionId,
    policyVersion: record.policyVersion,
    ...(record.messageId === undefined ? {} : { messageId: record.messageId }),
    partId: record.partId,
    tier: record.tier,
    originalTokenEstimate: record.originalTokenEstimate,
    replacementTokenEstimate: record.replacementTokenEstimate,
    replacement: record.replacement
  }
}
