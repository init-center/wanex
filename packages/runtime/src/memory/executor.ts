import {
  contextTextDigest,
  DEFAULT_CONTEXT_TOKEN_ESTIMATOR,
  reconstructContextCompaction,
  type ContextCompactionEvidence,
  type ContextTokenEstimator
} from "../context/memory/index.js"
import type {
  ContextEpochRecord,
  JsonValue,
  RuntimeAbortSignal,
  SchedulerJobRecord
} from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"
import {
  consumeProviderStream,
  ProviderStreamError,
  type ProviderAdapter,
  type ProviderTurnResult
} from "../provider/index.js"
import { appendMemoryCompactionEvent } from "./events.js"
import { memoryCompactionJobResultToJson } from "./result-codec.js"
import type {
  MemoryCompactionJobResult,
  MemoryCompactionRetentionPolicy
} from "./types.js"

export interface ExecuteContextEpochRequest {
  readonly storage: CoreStore
  readonly job: SchedulerJobRecord
  readonly epochId: string
  readonly evidence: ContextCompactionEvidence
  readonly provider: ProviderAdapter
  readonly signal: RuntimeAbortSignal
  readonly heartbeat: () => Promise<void>
  readonly tokenEstimator?: ContextTokenEstimator
  readonly retention?: MemoryCompactionRetentionPolicy
  readonly metadata?: JsonValue
  readonly now?: () => number
}

export class ContextEpochRecoveryRequiredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ContextEpochRecoveryRequiredError"
  }
}

export async function executeContextEpoch(
  request: ExecuteContextEpochRequest
): Promise<JsonValue> {
  const { evidence, job } = request
  if (request.signal.aborted) {
    throw new Error(`context epoch execution aborted before start: ${job.id}`)
  }
  const identity = jobIdentity(job)
  await appendEvent(request, "context.compaction.planned", {
    sessionId: evidence.sessionId,
    epochId: request.epochId,
    policyDigest: evidence.policyDigest,
    cutSequence: evidence.cutSequence
  })
  const [messages, activeEpoch] = await Promise.all([
    request.storage.listSessionMessages({ sessionId: evidence.sessionId }),
    request.storage.getActiveContextEpoch({ sessionId: evidence.sessionId })
  ])
  const reconstructed = reconstructContextCompaction({
    evidence,
    messages,
    activeEpoch,
    ...(request.tokenEstimator === undefined
      ? {}
      : { tokenEstimator: request.tokenEstimator })
  })
  let epoch = await request.storage.beginContextEpoch({
    id: request.epochId,
    sessionId: evidence.sessionId,
    ...identity,
    maxProviderAttempts: evidence.policy.maxProviderAttempts,
    ...(evidence.previousEpochId === undefined
      ? {}
      : {
          previousEpochId: evidence.previousEpochId,
          previousSummaryDigest: evidence.previousSummaryDigest
        }),
    sourceHeadSequence: evidence.sourceHeadSequence,
    sourceHeadMessageId: evidence.sourceHeadMessageId,
    cutSequence: evidence.cutSequence,
    cutMessageId: evidence.cutMessageId,
    retainedFromSequence: evidence.retainedFromSequence,
    retainedFromMessageId: evidence.retainedFromMessageId,
    sourceDigest: evidence.sourceDigest,
    policy: evidence.policy as unknown as JsonValue,
    policyDigest: evidence.policyDigest,
    modelEndpoint: evidence.modelEndpoint,
    requestDigest: evidence.requestDigest,
    tokenEstimateBefore: evidence.tokenEstimateBefore
  })
  await appendEvent(request, "context.epoch.created", {
    sessionId: evidence.sessionId,
    epochId: request.epochId,
    generationState: epoch.generationState
  })

  if (epoch.state === "active") return await finishResult(request, epoch)
  if (epoch.generationState === "succeeded") {
    epoch = await activateEpoch(request, epoch, identity)
    return await finishResult(request, epoch)
  }
  if (
    epoch.generationState === "dispatched" ||
    epoch.generationState === "output_observed"
  ) {
    await failAmbiguousOwnerLoss(request, epoch, identity)
    throw new ContextEpochRecoveryRequiredError(
      "context summary dispatch outcome is ambiguous after owner loss"
    )
  }
  if (epoch.state === "failed") {
    throw new Error(`context summary generation is terminal: ${epoch.generationState}`)
  }

  while (epoch.state === "building") {
    await request.heartbeat()
    if (request.signal.aborted) {
      throw new Error("context epoch execution aborted before Provider dispatch")
    }
    epoch = await request.storage.markContextEpochDispatched({
      epochId: request.epochId,
      ...identity
    })
    let outputObserved = false
    try {
      const response = await consumeProviderStream({
        provider: request.provider,
        request: {
          messages: reconstructed.providerMessages,
          signal: request.signal,
          maxOutputTokens: evidence.policy.maxSummaryOutputTokens
        },
        checkpoint: async (event) => {
          if (!outputObserved && isProviderOutput(event.type)) {
            outputObserved = true
            epoch = await request.storage.markContextEpochOutputObserved({
              epochId: request.epochId,
              ...identity,
              generationAttempt: epoch.generationAttempt
            })
          }
        }
      })
      const summary = validatedSummary(response)
      const summaryDigest = contextTextDigest(summary)
      const tokenEstimateAfter = actualTokenEstimateAfter(
        evidence,
        summary,
        request.tokenEstimator ?? DEFAULT_CONTEXT_TOKEN_ESTIMATOR
      )
      epoch = await request.storage.finishContextEpochGeneration({
        epochId: request.epochId,
        ...identity,
        generationAttempt: epoch.generationAttempt,
        outcome: "succeeded",
        summary,
        summaryDigest,
        ...(response.usage === undefined ? {} : { usage: response.usage }),
        tokenEstimateAfter,
        tokenSavings: Math.max(0, evidence.tokenEstimateBefore - tokenEstimateAfter)
      })
    } catch (error) {
      const ambiguous =
        outputObserved ||
        (error instanceof ProviderStreamError && error.detail.outputObserved) ||
        !(error instanceof ProviderStreamError)
      epoch = ambiguous
        ? await request.storage.finishContextEpochGeneration({
            epochId: request.epochId,
            ...identity,
            generationAttempt: epoch.generationAttempt,
            outcome: "ambiguous",
            error: providerFailure(error, true)
          })
        : await request.storage.finishContextEpochGeneration({
            epochId: request.epochId,
            ...identity,
            generationAttempt: epoch.generationAttempt,
            outcome: "failed_before_output",
            retryable: error.detail.retryable,
            error: providerFailure(error, false)
          })
      if (epoch.state === "building") continue
      await appendEvent(request, "context.compaction.failed", {
        sessionId: evidence.sessionId,
        epochId: request.epochId,
        generationState: epoch.generationState
      })
      if (ambiguous) {
        throw new ContextEpochRecoveryRequiredError(
          error instanceof Error ? error.message : String(error)
        )
      }
      throw error
    }
    break
  }
  epoch = await activateEpoch(request, epoch, identity)
  return await finishResult(request, epoch)
}

export function contextEpochIdForJob(jobId: string): string {
  const safeJobId = jobId.replace(/[^a-zA-Z0-9_]+/g, "_")
  return `ctxepoch_${safeJobId}`
}

async function activateEpoch(
  request: ExecuteContextEpochRequest,
  epoch: ContextEpochRecord,
  identity: ReturnType<typeof jobIdentity>
): Promise<ContextEpochRecord> {
  const activated = await request.storage.activateContextEpoch({
    epochId: epoch.id,
    ...identity,
    ...(epoch.previousEpochId === undefined
      ? {}
      : { expectedPreviousEpochId: epoch.previousEpochId })
  })
  if (epoch.previousEpochId !== undefined) {
    await appendEvent(request, "context.epoch.superseded", {
      sessionId: epoch.sessionId,
      epochId: epoch.previousEpochId,
      supersededByEpochId: activated.id
    })
  }
  await appendEvent(request, "context.epoch.activated", {
    sessionId: epoch.sessionId,
    epochId: activated.id,
    cutSequence: activated.cutSequence
  })
  return activated
}

async function finishResult(
  request: ExecuteContextEpochRequest,
  epoch: ContextEpochRecord
): Promise<JsonValue> {
  await appendEvent(request, "context.compaction.applied", {
    sessionId: epoch.sessionId,
    epochId: epoch.id,
    cutSequence: epoch.cutSequence,
    tokenEstimateBefore: epoch.tokenEstimateBefore,
    tokenEstimateAfter: epoch.tokenEstimateAfter
  })
  const prune =
    request.retention === undefined
      ? undefined
      : await request.storage.pruneContextEpochs({
          sessionId: epoch.sessionId,
          ...(request.retention.keepLastSuperseded === undefined
            ? {}
            : { keepLastSuperseded: request.retention.keepLastSuperseded }),
          ...(request.retention.olderThanUpdatedAt === undefined
            ? {}
            : { olderThanUpdatedAt: request.retention.olderThanUpdatedAt }),
          ...(request.retention.dryRun === undefined
            ? {}
            : { dryRun: request.retention.dryRun })
        })
  return memoryCompactionJobResultToJson({
    ...resultForEpoch(epoch, request.metadata),
    ...(prune === undefined ? {} : { prune })
  })
}

function resultForEpoch(
  epoch: ContextEpochRecord,
  metadata: JsonValue | undefined
): MemoryCompactionJobResult {
  if (epoch.summaryDigest === undefined) {
    throw new Error("completed context epoch is missing its summary digest")
  }
  return {
    sessionId: epoch.sessionId,
    epochId: epoch.id,
    cutSequence: epoch.cutSequence,
    summaryDigest: epoch.summaryDigest,
    tokenEstimateBefore: epoch.tokenEstimateBefore,
    tokenEstimateAfter: epoch.tokenEstimateAfter,
    ...(metadata === undefined ? {} : { metadata })
  }
}

async function failAmbiguousOwnerLoss(
  request: ExecuteContextEpochRequest,
  epoch: ContextEpochRecord,
  identity: ReturnType<typeof jobIdentity>
): Promise<void> {
  const failed = await request.storage.finishContextEpochGeneration({
    epochId: epoch.id,
    ...identity,
    generationAttempt: epoch.generationAttempt,
    outcome: "ambiguous",
    error: {
      name: "ContextSummaryOwnerLoss",
      message: "summary Provider dispatch was not durably completed before owner loss"
    }
  })
  await appendEvent(request, "context.compaction.failed", {
    sessionId: failed.sessionId,
    epochId: failed.id,
    generationState: failed.generationState
  })
}

function validatedSummary(response: ProviderTurnResult): string {
  if (response.finish.reason !== "stop") {
    throw new Error(`context summary finished with ${response.finish.reason}`)
  }
  if (response.parts.some((part) => part.type === "tool_call")) {
    throw new Error("context summary Provider emitted a Tool call")
  }
  const text = response.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim()
  if (text.length === 0) throw new Error("context summary Provider returned empty text")
  return text
}

function actualTokenEstimateAfter(
  evidence: ContextCompactionEvidence,
  summary: string,
  estimator: ContextTokenEstimator
): number {
  const retainedTokens = Math.max(
    0,
    evidence.projectedTokenEstimateAfter - evidence.policy.maxSummaryOutputTokens
  )
  return retainedTokens + estimator.estimatePartsTokens([
    { type: "text", id: "context_summary_actual", text: summary }
  ])
}

function providerFailure(error: unknown, ambiguous: boolean): JsonValue {
  if (error instanceof ProviderStreamError) {
    return {
      name: error.name,
      message: error.message,
      ambiguous,
      provider: error.detail
    } as unknown as JsonValue
  }
  return {
    name: error instanceof Error ? error.name : "Error",
    message: error instanceof Error ? error.message : String(error),
    ambiguous
  }
}

function jobIdentity(job: SchedulerJobRecord) {
  if (job.leaseOwner === undefined || job.leaseToken === undefined) {
    throw new Error("claimed context epoch job is missing its lease identity")
  }
  return {
    jobId: job.id,
    workerId: job.leaseOwner,
    leaseToken: job.leaseToken
  }
}

function isProviderOutput(type: string): boolean {
  return type === "text_delta" ||
    type === "reasoning_delta" ||
    type === "tool_call_start"
}

async function appendEvent(
  request: ExecuteContextEpochRequest,
  type: Parameters<typeof appendMemoryCompactionEvent>[0]["type"],
  payload: JsonValue
): Promise<void> {
  await appendMemoryCompactionEvent({
    storage: request.storage,
    type,
    job: request.job,
    sessionId: request.evidence.sessionId,
    payload,
    ...(request.now === undefined ? {} : { now: request.now })
  })
}
