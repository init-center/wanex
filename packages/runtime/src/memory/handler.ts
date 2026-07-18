import {
  DeterministicContextCompiler,
  mergePolicy
} from "../context/memory/index.js"
import type { WanexWorker, WorkerHandler } from "../jobs/index.js"
import { appendMemoryCompactionEvent } from "./events.js"
import { memoryCompactionPayloadFromJson } from "./payload-codec.js"
import { memoryCompactionJobResultToJson } from "./result-codec.js"
import type { MemoryCompactionHandlerOptions } from "./types.js"

export function createMemoryCompactionJobHandler(
  options: MemoryCompactionHandlerOptions
): WorkerHandler {
  return async ({ job, signal }) => {
    if (signal.aborted) {
      throw new Error(`memory compaction job aborted before start: ${job.id}`)
    }
    const payload = memoryCompactionPayloadFromJson(job.payload)
    const policy = mergePolicy(payload.policy, mergePolicy(options.policy))
    const epochId = contextEpochIdForJob(job.id, job.attempt)
    await appendMemoryCompactionEvent({
      storage: options.storage,
      type: "context.compaction.planned",
      job,
      sessionId: payload.sessionId,
      policyVersion: policy.version,
      payload: {
        sessionId: payload.sessionId,
        epochId
      },
      ...(options.now === undefined ? {} : { now: options.now })
    })
    const previousActiveEpoch = await options.storage.getActiveContextEpoch({
      sessionId: payload.sessionId,
      policyVersion: policy.version
    })
    await options.storage.putContextEpoch({
      id: epochId,
      sessionId: payload.sessionId,
      policyVersion: policy.version,
      state: "building",
      metadata: {
        jobId: job.id,
        attempt: job.attempt,
        kind: job.kind
      }
    })
    await appendMemoryCompactionEvent({
      storage: options.storage,
      type: "context.epoch.created",
      job,
      sessionId: payload.sessionId,
      policyVersion: policy.version,
      payload: {
        sessionId: payload.sessionId,
        epochId
      },
      ...(options.now === undefined ? {} : { now: options.now })
    })
    const [inputs, messages] = await Promise.all([
      options.storage.listSessionInputs({ sessionId: payload.sessionId }),
      options.storage.listSessionMessages({ sessionId: payload.sessionId })
    ])
    const compiler = new DeterministicContextCompiler({
      replacementStore: options.storage,
      ...(options.policy === undefined ? {} : { policy: options.policy }),
      ...(options.tokenEstimator === undefined
        ? {}
        : { tokenEstimator: options.tokenEstimator })
    })
    const compiled = await compiler.compile({
      sessionId: payload.sessionId,
      epochId,
      inputs,
      messages,
      policy
    })
    const tokenSavings =
      compiled.stats.tokenEstimateBefore - compiled.stats.tokenEstimateAfter
    await options.storage.putContextEpoch({
      id: epochId,
      sessionId: payload.sessionId,
      policyVersion: compiled.policy.version,
      state: "building",
      tokenEstimateBefore: compiled.stats.tokenEstimateBefore,
      tokenEstimateAfter: compiled.stats.tokenEstimateAfter,
      tokenSavings,
      replacementCount: compiled.stats.replacementCount,
      metadata: {
        jobId: job.id,
        attempt: job.attempt,
        kind: job.kind
      }
    })
    await appendMemoryCompactionEvent({
      storage: options.storage,
      type:
        compiled.stats.replacementCount === 0
          ? "context.compaction.skipped"
          : "context.compaction.applied",
      job,
      sessionId: payload.sessionId,
      policyVersion: compiled.policy.version,
      payload: {
        sessionId: payload.sessionId,
        epochId,
        tokenEstimateBefore: compiled.stats.tokenEstimateBefore,
        tokenEstimateAfter: compiled.stats.tokenEstimateAfter,
        replacementCount: compiled.stats.replacementCount,
        replacementIds: compiled.replacements.map((replacement) => replacement.id),
        ...(compiled.stats.replacementCount === 0
          ? { skipReason: "no_replacements" }
          : {})
      },
      ...(options.now === undefined ? {} : { now: options.now })
    })
    const activatedEpoch = await options.storage.activateContextEpoch({ epochId })
    if (
      previousActiveEpoch !== null &&
      previousActiveEpoch.id !== activatedEpoch.id
    ) {
      await appendMemoryCompactionEvent({
        storage: options.storage,
        type: "context.epoch.superseded",
        job,
        sessionId: payload.sessionId,
        policyVersion: compiled.policy.version,
        payload: {
          sessionId: payload.sessionId,
          epochId: previousActiveEpoch.id,
          supersededByEpochId: activatedEpoch.id
        },
        ...(options.now === undefined ? {} : { now: options.now })
      })
    }
    await appendMemoryCompactionEvent({
      storage: options.storage,
      type: "context.epoch.activated",
      job,
      sessionId: payload.sessionId,
      policyVersion: compiled.policy.version,
      payload: {
        sessionId: payload.sessionId,
        epochId: activatedEpoch.id
      },
      ...(options.now === undefined ? {} : { now: options.now })
    })
    const prune =
      options.retention === undefined
        ? undefined
        : await options.storage.pruneContextEpochs({
            sessionId: payload.sessionId,
            policyVersion: compiled.policy.version,
            ...(options.retention.keepLastSuperseded === undefined
              ? {}
              : {
                  keepLastSuperseded: options.retention.keepLastSuperseded
                }),
            ...(options.retention.olderThanUpdatedAt === undefined
              ? {}
              : {
                  olderThanUpdatedAt: options.retention.olderThanUpdatedAt
                }),
            ...(options.retention.dryRun === undefined
              ? {}
              : { dryRun: options.retention.dryRun })
          })
    return memoryCompactionJobResultToJson({
      sessionId: payload.sessionId,
      epochId,
      policyVersion: compiled.policy.version,
      tokenEstimateBefore: compiled.stats.tokenEstimateBefore,
      tokenEstimateAfter: compiled.stats.tokenEstimateAfter,
      replacementCount: compiled.stats.replacementCount,
      replacementIds: compiled.replacements.map((replacement) => replacement.id),
      ...(payload.metadata === undefined ? {} : { metadata: payload.metadata }),
      ...(prune === undefined ? {} : { prune })
    })
  }
}

export function registerMemoryCompactionJobHandler(
  worker: WanexWorker,
  options: MemoryCompactionHandlerOptions
): void {
  worker.register("memory.compaction", createMemoryCompactionJobHandler(options))
}

function contextEpochIdForJob(jobId: string, attempt: number): string {
  const safeJobId = jobId.replace(/[^a-zA-Z0-9_]+/g, "_")
  return `ctxepoch_${safeJobId}_attempt_${attempt}`
}
