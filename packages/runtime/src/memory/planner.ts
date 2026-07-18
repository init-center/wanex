import { DEFAULT_POLICY, DeterministicContextCompiler } from "../context/memory/index.js"
import type { MemoryCompactionPlan, PlanMemoryCompactionRequest } from "./types.js"

export async function planMemoryCompaction(
  request: PlanMemoryCompactionRequest
): Promise<MemoryCompactionPlan> {
  const policy = {
    ...DEFAULT_POLICY,
    ...request.policy
  }
  const waterlineTokens = request.waterlineTokens ?? policy.maxInputTokens
  const minimumTokenSavings = request.minimumTokenSavings ?? 1
  const [inputs, messages] = await Promise.all([
    request.storage.listSessionInputs({ sessionId: request.sessionId }),
    request.storage.listSessionMessages({ sessionId: request.sessionId })
  ])
  const compiler = new DeterministicContextCompiler({
    policy,
    ...(request.tokenEstimator === undefined
      ? {}
      : { tokenEstimator: request.tokenEstimator })
  })
  const compiled = await compiler.compile({
    sessionId: request.sessionId,
    inputs,
    messages,
    policy
  })
  const tokenSavings =
    compiled.stats.tokenEstimateBefore - compiled.stats.tokenEstimateAfter
  const reason = planReason({
    tokenEstimateBefore: compiled.stats.tokenEstimateBefore,
    waterlineTokens,
    replacementCount: compiled.stats.replacementCount,
    tokenSavings,
    minimumTokenSavings
  })
  return {
    sessionId: request.sessionId,
    policyVersion: compiled.policy.version,
    decision: reason === "above_waterline" ? "submit" : "skip",
    reason,
    waterlineTokens,
    minimumTokenSavings,
    tokenEstimateBefore: compiled.stats.tokenEstimateBefore,
    tokenEstimateAfter: compiled.stats.tokenEstimateAfter,
    tokenSavings,
    replacementCount: compiled.stats.replacementCount
  }
}

function planReason(request: {
  readonly tokenEstimateBefore: number
  readonly waterlineTokens: number
  readonly replacementCount: number
  readonly tokenSavings: number
  readonly minimumTokenSavings: number
}): MemoryCompactionPlan["reason"] {
  if (request.tokenEstimateBefore < request.waterlineTokens) {
    return "below_waterline"
  }
  if (request.replacementCount === 0) {
    return "no_replacements"
  }
  if (request.tokenSavings < request.minimumTokenSavings) {
    return "insufficient_savings"
  }
  return "above_waterline"
}
