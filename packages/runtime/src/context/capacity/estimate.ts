import {
  DEFAULT_CONTEXT_TOKEN_ESTIMATOR
} from "../memory/index.js"
import type {
  ContextCapacityEstimate,
  EstimateContextCapacityRequest
} from "./types.js"

export function estimateContextCapacity(
  request: EstimateContextCapacityRequest
): ContextCapacityEstimate {
  const estimator = request.tokenEstimator ?? DEFAULT_CONTEXT_TOKEN_ESTIMATOR
  const replayTokens = estimator.estimateMessagesTokens(request.messages)
  const toolDefinitionTokens = request.tools.reduce(
    (total, tool, index) =>
      total + 4 + estimator.estimatePartsTokens([{
        type: "text",
        id: `capacity_tool_${index}`,
        text: JSON.stringify(tool)
      }]),
    0
  )
  const inputTokens = replayTokens + toolDefinitionTokens
  const inputResources = countInputResources(request.messages)
  const limits = request.model.limits
  const contextWindowTokens = limits?.contextWindowTokens
  const maxInputTokens = limits?.maxInputTokens
  const maxInputResources = limits?.maxInputResources
  const contextInputCeiling =
    contextWindowTokens === undefined
      ? undefined
      : Math.max(0, contextWindowTokens - request.maxOutputTokens)
  const tokenCeilings = [contextInputCeiling, maxInputTokens].filter(
    (value): value is number => value !== undefined
  )
  const inputTokenCeiling =
    tokenCeilings.length === 0 ? undefined : Math.min(...tokenCeilings)
  const tokenStatus =
    inputTokenCeiling === undefined
      ? "unknown"
      : inputTokens <= inputTokenCeiling ? "fits" : "exceeds"
  const resourceStatus =
    maxInputResources === undefined
      ? "unknown"
      : inputResources <= maxInputResources ? "fits" : "exceeds"
  const reasons = [
    ...(tokenStatus === "exceeds" ? ["input_tokens_exceeded" as const] : []),
    ...(resourceStatus === "exceeds"
      ? ["input_resources_exceeded" as const]
      : [])
  ]
  return {
    replayTokens,
    toolDefinitionTokens,
    inputTokens,
    inputResources,
    requestedOutputTokens: request.maxOutputTokens,
    ...(contextWindowTokens === undefined ? {} : { contextWindowTokens }),
    ...(maxInputTokens === undefined ? {} : { maxInputTokens }),
    ...(maxInputResources === undefined ? {} : { maxInputResources }),
    ...(inputTokenCeiling === undefined ? {} : { inputTokenCeiling }),
    tokenStatus,
    resourceStatus,
    decision: reasons.length === 0 ? "dispatch" : "compact",
    reasons
  }
}

function countInputResources(
  messages: EstimateContextCapacityRequest["messages"]
): number {
  let count = 0
  for (const message of messages) {
    for (const part of message.content) {
      if (part.type === "resource") {
        count += 1
      } else if (part.type === "tool_result") {
        count += part.content.filter((item) => item.type === "resource").length
      }
    }
  }
  return count
}
