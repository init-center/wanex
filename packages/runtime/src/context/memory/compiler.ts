import { contextTextDigest } from "./digest.js"
import { validateActiveEpoch } from "./sources.js"
import {
  DEFAULT_CONTEXT_TOKEN_ESTIMATOR,
  type ContextTokenEstimator
} from "./token-estimate.js"
import type {
  CompileContextInput,
  CompiledContext,
  ContextCompiler,
  SemanticContextCompilerOptions
} from "./types.js"

export class SemanticContextCompiler implements ContextCompiler {
  private readonly epochStore: SemanticContextCompilerOptions["epochStore"]
  private readonly tokenEstimator: ContextTokenEstimator

  constructor(options: SemanticContextCompilerOptions) {
    this.epochStore = options.epochStore
    this.tokenEstimator = options.tokenEstimator ?? DEFAULT_CONTEXT_TOKEN_ESTIMATOR
  }

  async compile(input: CompileContextInput): Promise<CompiledContext> {
    const estimator = input.tokenEstimator ?? this.tokenEstimator
    const messages = [...input.messages].sort(
      (left, right) => left.sequence - right.sequence
    )
    const active = validateActiveEpoch(
      await this.epochStore.getActiveContextEpoch({ sessionId: input.sessionId }),
      messages,
      input.sessionId
    )
    const inputMessages: CompiledContext["messages"] = input.inputs.map((record) => ({
      role: record.inputType === "system" ? "system" : "user",
      content: record.content
    }))
    const rawMessages: CompiledContext["messages"] = [
      ...inputMessages,
      ...messages.map((message) => ({
        role: message.role,
        content: message.content
      }))
    ]
    if (active === null) {
      const tokens = estimator.estimateMessagesTokens(rawMessages)
      return {
        sessionId: input.sessionId,
        messages: rawMessages,
        stats: {
          tokenEstimateBefore: tokens,
          tokenEstimateAfter: tokens
        }
      }
    }
    const summary = active.summary
    if (summary === undefined || contextTextDigest(summary) !== active.summaryDigest) {
      throw new Error("active context summary digest is invalid")
    }
    const compiledMessages: CompiledContext["messages"] = [
      ...inputMessages,
      {
        role: "assistant",
        content: [
          {
            type: "text",
            id: `context_summary_${active.id}`,
            text: `[Semantic checkpoint through message sequence ${active.cutSequence}]\n${summary}`,
            providerMetadata: {
              wanexContextEpochId: active.id,
              wanexContextCutSequence: active.cutSequence
            }
          }
        ]
      },
      ...messages
        .filter((message) => message.sequence > active.cutSequence)
        .map((message) => ({ role: message.role, content: message.content }))
    ]
    return {
      sessionId: input.sessionId,
      epochId: active.id,
      messages: compiledMessages,
      stats: {
        tokenEstimateBefore: estimator.estimateMessagesTokens(rawMessages),
        tokenEstimateAfter: estimator.estimateMessagesTokens(compiledMessages),
        summarizedThroughSequence: active.cutSequence
      }
    }
  }
}
