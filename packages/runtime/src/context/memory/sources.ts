import type {
  ContextEpochRecord,
  SessionMessageRecord,
  SessionTurnRecord
} from "@wanex/protocol"
import { contextDigest, contextTextDigest } from "./digest.js"
import {
  resolveContextCompactionPolicy,
  resolveContextCompactionPolicyAtCeiling
} from "./policy.js"
import { serializeContextSource } from "./serialization.js"
import {
  DEFAULT_CONTEXT_TOKEN_ESTIMATOR,
  type ContextTokenEstimator
} from "./token-estimate.js"
import type {
  ContextCompactionEvidence,
  PrepareContextCompactionInput,
  PreparedContextCompaction,
  ReconstructContextCompactionInput,
  SerializedContextSource
} from "./types.js"

const TERMINAL_COMPACTABLE_TURN_STATES = new Set<SessionTurnRecord["state"]>([
  "succeeded",
  "failed",
  "cancelled",
  "interrupted"
])

export function prepareContextCompaction(
  input: PrepareContextCompactionInput
): PreparedContextCompaction {
  return prepareContextCompactionInternal(input, false)
}

export function prepareForcedContextCompaction(
  input: PrepareContextCompactionInput & {
    readonly inputTokenCeiling?: number
  }
): PreparedContextCompaction {
  return prepareContextCompactionInternal(input, true)
}

function prepareContextCompactionInternal(
  input: PrepareContextCompactionInput & {
    readonly inputTokenCeiling?: number
  },
  force: boolean
): PreparedContextCompaction {
  const estimator = input.tokenEstimator ?? DEFAULT_CONTEXT_TOKEN_ESTIMATOR
  const messages = orderedSessionMessages(input.messages, input.sessionId)
  const active = validateActiveEpoch(input.activeEpoch, messages, input.sessionId)
  const replayTail = messages.filter(
    (message) => message.sequence > (active?.cutSequence ?? 0)
  )
  const tokenEstimateBefore = replayTokenEstimate(active, replayTail, estimator)
  const policy = input.inputTokenCeiling === undefined
    ? resolveContextCompactionPolicy(input.modelEndpoint, input.policy)
    : resolveContextCompactionPolicyAtCeiling(
        input.modelEndpoint,
        input.inputTokenCeiling,
        input.policy
      )
  if (policy === null) {
    return skipped("model_limit_unknown", tokenEstimateBefore)
  }
  if (!force && tokenEstimateBefore < policy.waterlineTokens) {
    return skipped("below_waterline", tokenEstimateBefore, policy)
  }

  const groups = groupTailByTurn(replayTail, input.turns, input.sessionId)
  const retainedStart = retainedGroupStart(groups, policy, estimator)
  if (retainedStart <= 0) {
    return skipped("no_compactable_turns", tokenEstimateBefore, policy)
  }
  const compactedGroups = groups.slice(0, retainedStart)
  if (compactedGroups.some((group) => !group.compactable)) {
    return skipped("unsafe_turn_boundary", tokenEstimateBefore, policy)
  }
  const sourceMessages = compactedGroups.flatMap((group) => group.messages)
  const retainedMessages = groups.slice(retainedStart).flatMap((group) => group.messages)
  const cut = sourceMessages.at(-1)
  const retained = retainedMessages[0]
  const head = messages.at(-1)
  if (cut === undefined || retained === undefined || head === undefined) {
    return skipped("no_compactable_turns", tokenEstimateBefore, policy)
  }
  const serialized = serializeContextSource({
    previousEpoch: active,
    messages: sourceMessages,
    policy,
    tokenEstimator: estimator
  })
  if (serialized.tokenEstimate >= policy.waterlineTokens) {
    return skipped("summary_input_too_large", tokenEstimateBefore, policy)
  }
  const projectedTokenEstimateAfter =
    policy.maxSummaryOutputTokens + messagesTokenEstimate(retainedMessages, estimator)
  if (projectedTokenEstimateAfter >= policy.waterlineTokens) {
    return skipped("retained_tail_too_large", tokenEstimateBefore, policy)
  }
  const tokenSavings = tokenEstimateBefore - projectedTokenEstimateAfter
  if (!force && tokenSavings < policy.minimumTokenSavings) {
    return skipped(
      "insufficient_savings",
      tokenEstimateBefore,
      policy,
      projectedTokenEstimateAfter
    )
  }
  const evidence: ContextCompactionEvidence = {
    sessionId: input.sessionId,
    ...(active === null
      ? {}
      : {
          previousEpochId: active.id,
          previousSummaryDigest: requireSummaryDigest(active)
        }),
    sourceHeadSequence: head.sequence,
    sourceHeadMessageId: head.id,
    cutSequence: cut.sequence,
    cutMessageId: cut.id,
    retainedFromSequence: retained.sequence,
    retainedFromMessageId: retained.id,
    sourceDigest: serialized.sourceDigest,
    policy,
    policyDigest: contextDigest(policy),
    modelEndpoint: input.modelEndpoint,
    requestDigest: serialized.requestDigest,
    tokenEstimateBefore,
    projectedTokenEstimateAfter
  }
  return {
    decision: "submit",
    reason: "above_waterline",
    policy,
    tokenEstimateBefore,
    projectedTokenEstimateAfter,
    tokenSavings,
    evidence,
    providerMessages: serialized.providerMessages
  }
}

export function reconstructContextCompaction(
  input: ReconstructContextCompactionInput
): SerializedContextSource {
  const estimator = input.tokenEstimator ?? DEFAULT_CONTEXT_TOKEN_ESTIMATOR
  const messages = orderedSessionMessages(
    input.messages,
    input.evidence.sessionId
  )
  const active = validateActiveEpoch(
    input.activeEpoch,
    messages,
    input.evidence.sessionId
  )
  if (
    active?.id !== input.evidence.previousEpochId ||
    (active === null ? undefined : requireSummaryDigest(active)) !==
      input.evidence.previousSummaryDigest
  ) {
    throw new Error("context compaction active predecessor changed")
  }
  if (contextDigest(input.evidence.policy) !== input.evidence.policyDigest) {
    throw new Error("context compaction policy digest is invalid")
  }
  const sourceMessages = messages.filter(
    (message) =>
      message.sequence > (active?.cutSequence ?? 0) &&
      message.sequence <= input.evidence.cutSequence
  )
  const cut = sourceMessages.at(-1)
  const retained = messages.find(
    (message) => message.sequence > input.evidence.cutSequence
  )
  const head = messages.find(
    (message) => message.sequence === input.evidence.sourceHeadSequence
  )
  if (
    cut?.id !== input.evidence.cutMessageId ||
    retained?.id !== input.evidence.retainedFromMessageId ||
    retained.sequence !== input.evidence.retainedFromSequence ||
    head?.id !== input.evidence.sourceHeadMessageId
  ) {
    throw new Error("context compaction canonical boundary evidence changed")
  }
  const serialized = serializeContextSource({
    previousEpoch: active,
    messages: sourceMessages,
    policy: input.evidence.policy,
    tokenEstimator: estimator
  })
  if (
    serialized.sourceDigest !== input.evidence.sourceDigest ||
    serialized.requestDigest !== input.evidence.requestDigest
  ) {
    throw new Error("context compaction source or request digest changed")
  }
  return serialized
}

export function validateActiveEpoch(
  epoch: ContextEpochRecord | null,
  messages: readonly SessionMessageRecord[],
  sessionId: string
): ContextEpochRecord | null {
  if (epoch === null) return null
  if (
    epoch.sessionId !== sessionId ||
    epoch.state !== "active" ||
    epoch.generationState !== "succeeded" ||
    epoch.summary === undefined ||
    epoch.summary.trim().length === 0 ||
    epoch.summaryDigest !== contextTextDigest(epoch.summary)
  ) {
    throw new Error("active context epoch evidence is invalid")
  }
  const cut = messages.find((message) => message.sequence === epoch.cutSequence)
  if (cut?.id !== epoch.cutMessageId) {
    throw new Error("active context epoch cut no longer matches canonical history")
  }
  return epoch
}

function orderedSessionMessages(
  input: readonly SessionMessageRecord[],
  sessionId: string
): SessionMessageRecord[] {
  const messages = [...input].sort((left, right) => left.sequence - right.sequence)
  const seen = new Set<number>()
  for (const message of messages) {
    if (message.sessionId !== sessionId) {
      throw new Error("context source contains a message from another session")
    }
    if (!Number.isSafeInteger(message.sequence) || message.sequence <= 0) {
      throw new Error("context source message sequence must be positive")
    }
    if (seen.has(message.sequence)) {
      throw new Error("context source contains duplicate message sequences")
    }
    seen.add(message.sequence)
  }
  return messages
}

interface TurnMessageGroup {
  readonly turnId: string
  readonly messages: SessionMessageRecord[]
  readonly compactable: boolean
}

function groupTailByTurn(
  messages: readonly SessionMessageRecord[],
  turns: readonly SessionTurnRecord[],
  sessionId: string
): TurnMessageGroup[] {
  const turnById = new Map(
    turns
      .filter((turn) => turn.sessionId === sessionId)
      .map((turn) => [turn.id, turn] as const)
  )
  const groups: TurnMessageGroup[] = []
  for (const message of messages) {
    const previous = groups.at(-1)
    if (previous?.turnId === message.turnId) {
      previous.messages.push(message)
      continue
    }
    const turn = turnById.get(message.turnId)
    groups.push({
      turnId: message.turnId,
      messages: [message],
      compactable:
        turn !== undefined && TERMINAL_COMPACTABLE_TURN_STATES.has(turn.state)
    })
  }
  return groups
}

function retainedGroupStart(
  groups: readonly TurnMessageGroup[],
  policy: NonNullable<ReturnType<typeof resolveContextCompactionPolicy>>,
  estimator: ContextTokenEstimator
): number {
  let start = groups.length
  let tokens = 0
  let completeTurns = 0
  for (let index = groups.length - 1; index >= 0; index -= 1) {
    const group = groups[index]
    if (group === undefined) continue
    start = index
    tokens += messagesTokenEstimate(group.messages, estimator)
    if (group.compactable) completeTurns += 1
    if (
      completeTurns >= policy.minimumRecentTurns &&
      tokens >= policy.keepRecentTokens
    ) {
      break
    }
  }
  return start
}

function replayTokenEstimate(
  active: ContextEpochRecord | null,
  messages: readonly SessionMessageRecord[],
  estimator: ContextTokenEstimator
): number {
  return (
    (active?.summary === undefined
      ? 0
      : estimator.estimatePartsTokens([
          { type: "text", id: `context_summary_${active.id}`, text: active.summary }
        ])) + messagesTokenEstimate(messages, estimator)
  )
}

function messagesTokenEstimate(
  messages: readonly SessionMessageRecord[],
  estimator: ContextTokenEstimator
): number {
  return messages.reduce(
    (sum, message) => sum + 4 + estimator.estimatePartsTokens(message.content),
    0
  )
}

function skipped(
  reason: PreparedContextCompaction["reason"],
  tokenEstimateBefore: number,
  policy?: PreparedContextCompaction["policy"],
  projectedTokenEstimateAfter = tokenEstimateBefore
): PreparedContextCompaction {
  return {
    decision: "skip",
    reason,
    ...(policy === undefined ? {} : { policy }),
    tokenEstimateBefore,
    projectedTokenEstimateAfter,
    tokenSavings: tokenEstimateBefore - projectedTokenEstimateAfter
  }
}

function requireSummaryDigest(epoch: ContextEpochRecord): string {
  if (epoch.summaryDigest === undefined) {
    throw new Error("active context epoch summary digest is missing")
  }
  return epoch.summaryDigest
}
