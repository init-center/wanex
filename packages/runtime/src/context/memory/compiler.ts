import type { MessagePart, SessionId } from "@wanex/protocol"
import { fromDurableReplacement } from "./durable.js"
import { DEFAULT_POLICY, mergePolicy } from "./policy.js"
import {
  buildReplacementPart,
  replacementKey,
  stableId,
  tierForPart
} from "./replacements.js"
import {
  protectedRecentUserInputIds,
  shouldProtectPart,
  sourcesForInput
} from "./sources.js"
import { DEFAULT_CONTEXT_TOKEN_ESTIMATOR } from "./token-estimate.js"
import type { ContextTokenEstimator } from "./token-estimate.js"
import type {
  CompileContextInput,
  CompiledContext,
  ContextCompiler,
  ContextMemoryPolicy,
  ContextReplacementRecord,
  ContextReplacementStore,
  DeterministicContextCompilerOptions,
  ReplaySource
} from "./types.js"

export class DeterministicContextCompiler implements ContextCompiler {
  private readonly defaultPolicy: ContextMemoryPolicy
  private readonly replacementStore: ContextReplacementStore | undefined
  private readonly defaultTokenEstimator: ContextTokenEstimator

  constructor(options: DeterministicContextCompilerOptions = {}) {
    this.defaultPolicy = mergePolicy(options.policy)
    this.replacementStore = options.replacementStore
    this.defaultTokenEstimator =
      options.tokenEstimator ?? DEFAULT_CONTEXT_TOKEN_ESTIMATOR
  }

  async compile(input: CompileContextInput): Promise<CompiledContext> {
    const policy = mergePolicy(input.policy, this.defaultPolicy)
    const tokenEstimator = input.tokenEstimator ?? this.defaultTokenEstimator
    const replacements = new Map<string, ContextReplacementRecord>()
    const epochId = await this.loadDurableReplacements({
      sessionId: input.sessionId,
      policyVersion: policy.version,
      requestedEpochId: input.epochId,
      replacements
    })
    const persistNewReplacements =
      this.replacementStore !== undefined && input.epochId !== undefined
    const createMissingReplacements =
      this.replacementStore === undefined || input.epochId !== undefined
    const sources = sourcesForInput(input)
    const protectedInputIds = protectedRecentUserInputIds(sources, policy)
    const compiledMessages: CompiledContext["messages"][number][] = []
    const usedReplacements: ContextReplacementRecord[] = []
    const pendingStores: Promise<void>[] = []
    let tokenEstimateBefore = 0
    let tokenEstimateAfter = 0

    for (const source of sources) {
      tokenEstimateBefore += tokenEstimator.estimatePartsTokens(source.content)
      const content = source.content.map((part) => {
        if (shouldProtectPart(source, part, protectedInputIds)) {
          return part
        }
        const replacement = this.replacementForPart({
          replacements,
          epochId,
          sessionId: input.sessionId,
          policy,
          source,
          part,
          tokenEstimator,
          createMissingReplacements
        })
        if (replacement === null) {
          return part
        }
        usedReplacements.push(replacement.record)
        if (replacement.created && persistNewReplacements) {
          pendingStores.push(this.persistReplacement(replacement.record))
        }
        return replacement.record.replacement
      })
      tokenEstimateAfter += tokenEstimator.estimatePartsTokens(content)
      compiledMessages.push({
        role: source.role,
        content
      })
    }

    await Promise.all(pendingStores)
    return {
      sessionId: input.sessionId,
      ...(epochId === undefined ? {} : { epochId }),
      policy,
      messages: compiledMessages,
      replacements: usedReplacements,
      stats: {
        tokenEstimateBefore,
        tokenEstimateAfter,
        replacementCount: usedReplacements.length
      }
    }
  }

  private replacementForPart(request: {
    readonly replacements: Map<string, ContextReplacementRecord>
    readonly epochId: string | undefined
    readonly sessionId: SessionId
    readonly policy: ContextMemoryPolicy
    readonly source: ReplaySource
    readonly part: MessagePart
    readonly tokenEstimator: ContextTokenEstimator
    readonly createMissingReplacements: boolean
  }): { readonly record: ContextReplacementRecord; readonly created: boolean } | null {
    const tier = tierForPart(request.part, request.policy)
    if (tier === null) {
      return null
    }
    const key = replacementKey({
      sessionId: request.sessionId,
      policyVersion: request.policy.version,
      ...(request.source.messageId === undefined
        ? {}
        : { messageId: request.source.messageId }),
      partId: request.part.id
    })
    const existing = request.replacements.get(key)
    if (existing !== undefined) {
      return { record: existing, created: false }
    }
    if (!request.createMissingReplacements) {
      return null
    }
    const replacement = buildReplacementPart(request.part, tier, request.policy)
    const idSeed =
      request.epochId === undefined ? key : `${request.epochId}:${key}`
    const record: ContextReplacementRecord = {
      id: `ctxrep_${stableId(idSeed)}`,
      ...(request.epochId === undefined ? {} : { epochId: request.epochId }),
      sessionId: request.sessionId,
      policyVersion: request.policy.version,
      ...(request.source.messageId === undefined
        ? {}
        : { messageId: request.source.messageId }),
      partId: request.part.id,
      tier,
      originalTokenEstimate: request.tokenEstimator.estimatePartTokens(request.part),
      replacementTokenEstimate:
        request.tokenEstimator.estimatePartTokens(replacement),
      replacement
    }
    request.replacements.set(key, record)
    return { record, created: true }
  }

  private async loadDurableReplacements(request: {
    readonly sessionId: SessionId
    readonly policyVersion: string
    readonly requestedEpochId: string | undefined
    readonly replacements: Map<string, ContextReplacementRecord>
  }): Promise<string | undefined> {
    if (request.requestedEpochId === "") {
      throw new Error("context epoch id must not be empty")
    }
    if (this.replacementStore === undefined) {
      return request.requestedEpochId
    }
    const epochId =
      request.requestedEpochId ??
      (
        await this.replacementStore.getActiveContextEpoch({
          sessionId: request.sessionId,
          policyVersion: request.policyVersion
        })
      )?.id
    if (epochId === undefined) {
      return undefined
    }
    const durable = await this.replacementStore.listContextReplacements({
      sessionId: request.sessionId,
      policyVersion: request.policyVersion,
      epochId
    })
    for (const record of durable) {
      request.replacements.set(
        replacementKey({
          sessionId: record.sessionId,
          policyVersion: record.policyVersion,
          ...(record.messageId === undefined ? {} : { messageId: record.messageId }),
          partId: record.partId
        }),
        fromDurableReplacement(record)
      )
    }
    return epochId
  }

  private async persistReplacement(record: ContextReplacementRecord): Promise<void> {
    if (this.replacementStore === undefined) {
      return
    }
    if (record.epochId === undefined) {
      throw new Error("context replacement epoch id must be resolved before persist")
    }
    await this.replacementStore.putContextReplacement({
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
    })
  }
}
