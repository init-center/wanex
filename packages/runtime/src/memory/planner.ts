import { prepareContextCompaction } from "../context/memory/index.js"
import type { MemoryCompactionPlan, PlanMemoryCompactionRequest } from "./types.js"

export async function planMemoryCompaction(
  request: PlanMemoryCompactionRequest
): Promise<MemoryCompactionPlan> {
  const [messages, turns, activeEpoch] = await Promise.all([
    request.storage.listSessionMessages({ sessionId: request.sessionId }),
    request.storage.listSessionTurns({ sessionId: request.sessionId }),
    request.storage.getActiveContextEpoch({ sessionId: request.sessionId })
  ])
  const prepared = prepareContextCompaction({
    sessionId: request.sessionId,
    messages,
    turns,
    activeEpoch,
    modelEndpoint: request.modelEndpoint,
    ...(request.policy === undefined ? {} : { policy: request.policy }),
    ...(request.tokenEstimator === undefined
      ? {}
      : { tokenEstimator: request.tokenEstimator })
  })
  return {
    sessionId: request.sessionId,
    decision: prepared.decision,
    reason: prepared.reason,
    tokenEstimateBefore: prepared.tokenEstimateBefore,
    projectedTokenEstimateAfter: prepared.projectedTokenEstimateAfter,
    tokenSavings: prepared.tokenSavings,
    ...(prepared.evidence === undefined ? {} : { evidence: prepared.evidence })
  }
}
