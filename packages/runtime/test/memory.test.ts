import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { afterEach, describe, expect, it } from "vitest"
import type {
  ContextCompactionEvidence,
  ContextTokenEstimator
} from "../src/context/memory/index.js"
import { contextTextDigest } from "../src/context/memory/index.js"
import { WanexSessionCore } from "../src/sessions/index.js"
import {
  createStorageTestStore,
  type StorageTestStore
} from "@wanex/storage/testing"
import type {
  ContextEpochRecord,
  JsonValue,
  ModelEndpointExecutionBinding,
  SchedulerJobRecord
} from "@wanex/protocol"
import type { WanexWorker } from "../src/jobs/index.js"
import { createTurnExecutionBinding } from "../src/execution/turn-binding.js"
import type {
  ProviderAdapter,
  ProviderEvent,
  ProviderRequest
} from "../src/provider/index.js"
import { fakeModelEndpoint } from "./model-endpoint-fixture.js"
import {
  createMemoryCompactionWorker,
  planMemoryCompaction,
  submitMemoryCompactionJob,
  sweepMemoryCompaction
} from "../src/memory/index.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)

const tempDirs: string[] = []
const clients: StorageTestStore[] = []

afterEach(async () => {
  while (clients.length > 0) {
    await clients.pop()?.dispose()
  }
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

describe("@wanex/runtime/memory semantic compaction", () => {
  it("runs a tool-free durable summary and leaves canonical history unchanged", async () => {
    const endpoint = summaryEndpoint("success")
    const provider = new SummaryProvider(endpoint, [
      { kind: "success", text: "## Goal\nDurable semantic summary" }
    ])
    const { storage, session, worker } = await createHarness({ provider })
    await seedConversation(session, "ses_memory_success", endpoint, 3)
    const canonicalBefore = await storage.listSessionMessages({
      sessionId: "ses_memory_success"
    })
    const plan = await usefulPlan(storage, "ses_memory_success", endpoint)
    const job = await submitMemoryCompactionJob(storage, {
      id: "job_memory_success",
      principalId: "memory_worker",
      evidence: plan,
      metadata: { reason: "test" },
      idempotencyKey: "memory-success"
    })
    expect(job.maxAttempts).toBe(1)

    const result = await worker.runOnce()

    expect(result.status).toBe("completed")
    if (result.status !== "completed") throw new Error("expected completed job")
    expect(result.job.result).toMatchObject({
      sessionId: "ses_memory_success",
      epochId: "ctxepoch_job_memory_success",
      cutSequence: plan.cutSequence,
      summaryDigest: contextTextDigest("## Goal\nDurable semantic summary"),
      metadata: { reason: "test" }
    })
    const active = await storage.getActiveContextEpoch({
      sessionId: "ses_memory_success"
    })
    expect(active).toMatchObject({
      id: "ctxepoch_job_memory_success",
      state: "active",
      generationState: "succeeded",
      generationAttempt: 1,
      summary: "## Goal\nDurable semantic summary"
    })
    expect(provider.requests).toHaveLength(1)
    expect(provider.requests[0]).toMatchObject({ maxOutputTokens: 100 })
    expect(provider.requests[0]?.tools).toBeUndefined()
    expect(provider.requests[0]?.messages.map((item) => item.role)).toEqual([
      "system",
      "user"
    ])
    await expect(
      storage.listSessionMessages({ sessionId: "ses_memory_success" })
    ).resolves.toEqual(canonicalBefore)
  })

  it("retries only a known pre-output failure within the frozen bound", async () => {
    const endpoint = summaryEndpoint("retry")
    const provider = new SummaryProvider(endpoint, [
      { kind: "pre_output_error", retryable: true },
      { kind: "success", text: "## Goal\nRecovered summary" }
    ])
    const { storage, session, worker } = await createHarness({ provider })
    await seedConversation(session, "ses_memory_retry", endpoint, 3)
    const evidence = await usefulPlan(storage, "ses_memory_retry", endpoint)
    await submitMemoryCompactionJob(storage, {
      id: "job_memory_retry",
      principalId: "memory_worker",
      evidence
    })

    const result = await worker.runOnce()

    expect(result.status).toBe("completed")
    expect(provider.requests).toHaveLength(2)
    await expect(
      storage.getActiveContextEpoch({ sessionId: "ses_memory_retry" })
    ).resolves.toMatchObject({
      id: "ctxepoch_job_memory_retry",
      generationState: "succeeded",
      generationAttempt: 2,
      maxProviderAttempts: 2
    })
  })

  it("terminates a non-retryable pre-output failure without another Provider call", async () => {
    const endpoint = summaryEndpoint("non-retryable")
    const provider = new SummaryProvider(endpoint, [
      { kind: "pre_output_error", retryable: false }
    ])
    const { storage, session, worker } = await createHarness({ provider })
    await seedConversation(session, "ses_memory_non_retryable", endpoint, 3)
    const evidence = await usefulPlan(
      storage,
      "ses_memory_non_retryable",
      endpoint
    )
    await submitMemoryCompactionJob(storage, {
      id: "job_memory_non_retryable",
      principalId: "memory_worker",
      evidence
    })

    const result = await worker.runOnce()

    expect(result.status).toBe("failed")
    expect(provider.requests).toHaveLength(1)
    await expect(
      storage.listContextEpochs({
        sessionId: "ses_memory_non_retryable",
        state: "failed"
      })
    ).resolves.toEqual([
      expect.objectContaining({
        id: "ctxepoch_job_memory_non_retryable",
        generationState: "failed_before_output",
        generationAttempt: 1,
        maxProviderAttempts: 2,
        error: expect.objectContaining({
          provider: expect.objectContaining({ retryable: false })
        })
      })
    ])
  })

  it("marks partial output ambiguous and preserves the previous active summary", async () => {
    const endpoint = summaryEndpoint("partial")
    const provider = new SummaryProvider(endpoint, [
      { kind: "success", text: "## Goal\nStable first summary" }
    ])
    const { storage, session, worker } = await createHarness({ provider })
    await seedConversation(session, "ses_memory_partial", endpoint, 3)
    const firstEvidence = await usefulPlan(storage, "ses_memory_partial", endpoint)
    await submitMemoryCompactionJob(storage, {
      id: "job_memory_partial_first",
      principalId: "memory_worker",
      evidence: firstEvidence
    })
    expect((await worker.runOnce()).status).toBe("completed")
    const firstActive = await requireActive(storage, "ses_memory_partial")

    await appendCompletedTurns(session, "ses_memory_partial", endpoint, 4, 2)
    provider.setOutcomes([{ kind: "partial_error" }])
    const secondEvidence = await usefulPlan(storage, "ses_memory_partial", endpoint)
    await submitMemoryCompactionJob(storage, {
      id: "job_memory_partial_failed",
      principalId: "memory_worker",
      evidence: secondEvidence
    })

    const failed = await worker.runOnce()

    expect(failed.status).toBe("failed")
    expect(provider.requests).toHaveLength(2)
    expect(await requireActive(storage, "ses_memory_partial")).toMatchObject({
      id: firstActive.id,
      summaryDigest: firstActive.summaryDigest
    })
    await expect(
      storage.listContextEpochs({
        sessionId: "ses_memory_partial",
        state: "failed"
      })
    ).resolves.toEqual([
      expect.objectContaining({
        id: "ctxepoch_job_memory_partial_failed",
        generationState: "ambiguous",
        generationAttempt: 1
      })
    ])
    expect((await worker.runOnce()).status).toBe("idle")
    expect(provider.requests).toHaveLength(2)
  })

  it("never replays a Provider after owner loss following durable dispatch", async () => {
    const endpoint = summaryEndpoint("owner-loss")
    const provider = new SummaryProvider(endpoint, [
      { kind: "success", text: "must not run" }
    ])
    const { storage, session } = await createHarness({ provider })
    await seedConversation(session, "ses_memory_owner_loss", endpoint, 3)
    const evidence = await usefulPlan(storage, "ses_memory_owner_loss", endpoint)
    await submitMemoryCompactionJob(storage, {
      id: "job_memory_owner_loss",
      principalId: "memory_worker",
      evidence
    })
    const abandoned = await claimMemoryJob(
      storage,
      "worker_memory_abandoned",
      60_000
    )
    const prepared = await beginEpoch(storage, abandoned, evidence)
    await storage.markContextEpochDispatched({
      epochId: prepared.id,
      ...leaseIdentity(abandoned)
    })
    expireJobLease(storage, abandoned.id)
    const recoveryWorker = createMemoryCompactionWorker({
      storage,
      workerId: "worker_memory_recovery",
      leaseMs: 60_000,
      directProvider: provider,
      tokenEstimator: characterTokenEstimator()
    })

    const recovered = await recoveryWorker.runOnce()

    expect(recovered.status).toBe("failed")
    expect(provider.requests).toHaveLength(0)
    await expect(
      storage.listContextEpochs({
        sessionId: "ses_memory_owner_loss",
        state: "failed"
      })
    ).resolves.toEqual([
      expect.objectContaining({
        id: "ctxepoch_job_memory_owner_loss",
        generationState: "ambiguous"
      })
    ])
  })

  it("activates a persisted summary after restart without another Provider call", async () => {
    const endpoint = summaryEndpoint("persisted")
    const provider = new SummaryProvider(endpoint, [
      { kind: "success", text: "must not run" }
    ])
    const { storage, session } = await createHarness({ provider })
    await seedConversation(session, "ses_memory_persisted", endpoint, 3)
    const evidence = await usefulPlan(storage, "ses_memory_persisted", endpoint)
    await submitMemoryCompactionJob(storage, {
      id: "job_memory_persisted",
      principalId: "memory_worker",
      evidence
    })
    const abandoned = await claimMemoryJob(
      storage,
      "worker_memory_persisted_abandoned",
      60_000
    )
    let epoch = await beginEpoch(storage, abandoned, evidence)
    epoch = await storage.markContextEpochDispatched({
      epochId: epoch.id,
      ...leaseIdentity(abandoned)
    })
    await storage.markContextEpochOutputObserved({
      epochId: epoch.id,
      ...leaseIdentity(abandoned),
      generationAttempt: epoch.generationAttempt
    })
    const summary = "## Goal\nPersisted before activation"
    await storage.finishContextEpochGeneration({
      epochId: epoch.id,
      ...leaseIdentity(abandoned),
      generationAttempt: epoch.generationAttempt,
      outcome: "succeeded",
      summary,
      summaryDigest: contextTextDigest(summary),
      tokenEstimateAfter: 500,
      tokenSavings: evidence.tokenEstimateBefore - 500
    })
    expireJobLease(storage, abandoned.id)
    const recoveryWorker = createMemoryCompactionWorker({
      storage,
      workerId: "worker_memory_persisted_recovery",
      leaseMs: 60_000,
      directProvider: provider,
      tokenEstimator: characterTokenEstimator()
    })

    const recovered = await recoveryWorker.runOnce()

    expect(recovered.status).toBe("completed")
    expect(provider.requests).toHaveLength(0)
    await expect(
      storage.getActiveContextEpoch({ sessionId: "ses_memory_persisted" })
    ).resolves.toMatchObject({
      id: "ctxepoch_job_memory_persisted",
      state: "active",
      summary
    })
  })

  it("merges repeated compaction incrementally and prunes superseded epochs", async () => {
    const endpoint = summaryEndpoint("incremental")
    const provider = new SummaryProvider(endpoint, [
      { kind: "success", text: "## Goal\nFirst checkpoint marker" },
      { kind: "success", text: "## Goal\nMerged checkpoint marker" }
    ])
    const { storage, session, worker } = await createHarness({
      provider,
      retention: { keepLastSuperseded: 0 }
    })
    await seedConversation(session, "ses_memory_incremental", endpoint, 3)
    const firstEvidence = await usefulPlan(storage, "ses_memory_incremental", endpoint)
    await submitMemoryCompactionJob(storage, {
      id: "job_memory_incremental_first",
      principalId: "memory_worker",
      evidence: firstEvidence
    })
    expect((await worker.runOnce()).status).toBe("completed")
    const first = await requireActive(storage, "ses_memory_incremental")

    await appendCompletedTurns(session, "ses_memory_incremental", endpoint, 4, 2)
    const secondEvidence = await usefulPlan(storage, "ses_memory_incremental", endpoint)
    expect(secondEvidence.previousEpochId).toBe(first.id)
    expect(secondEvidence.cutSequence).toBeGreaterThan(first.cutSequence)
    await submitMemoryCompactionJob(storage, {
      id: "job_memory_incremental_second",
      principalId: "memory_worker",
      evidence: secondEvidence
    })
    expect((await worker.runOnce()).status).toBe("completed")

    const secondSource = provider.sourceText(1)
    expect(secondSource).toContain("First checkpoint marker")
    expect(secondSource).toContain("turn-marker-3")
    expect(secondSource).not.toContain("turn-marker-1")
    const active = await requireActive(storage, "ses_memory_incremental")
    expect(active).toMatchObject({
      id: "ctxepoch_job_memory_incremental_second",
      previousEpochId: first.id,
      summary: "## Goal\nMerged checkpoint marker"
    })
    await expect(
      storage.listContextEpochs({ sessionId: "ses_memory_incremental" })
    ).resolves.toEqual([expect.objectContaining({ id: active.id, state: "active" })])
  })

  it("sweeps only useful sessions and reuses source-evidence idempotency", async () => {
    const endpoint = summaryEndpoint("sweep")
    const provider = new SummaryProvider(endpoint, [])
    const { storage, session } = await createHarness({ provider })
    await seedConversation(session, "ses_memory_sweep_large", endpoint, 3)
    await seedConversation(session, "ses_memory_sweep_small", endpoint, 1)

    const request = {
      storage,
      principalId: "memory_sweeper",
      resolveModelEndpoint: async (): Promise<ModelEndpointExecutionBinding> =>
        createTurnExecutionBinding({ modelEndpoint: endpoint, createdAt: 1 })
          .modelEndpoint,
      policy: compactionPolicy(),
      tokenEstimator: characterTokenEstimator(),
      idempotencyKeyPrefix: "memory-sweep"
    }
    const first = await sweepMemoryCompaction(request)
    const second = await sweepMemoryCompaction(request)

    expect(first.scannedSessionIds).toEqual(expect.arrayContaining([
      "ses_memory_sweep_large",
      "ses_memory_sweep_small"
    ]))
    expect(first.submittedJobs).toHaveLength(1)
    expect(first.skippedPlans).toEqual([
      expect.objectContaining({
        sessionId: "ses_memory_sweep_small",
        reason: "below_waterline"
      })
    ])
    expect(second.submittedJobs[0]?.id).toBe(first.submittedJobs[0]?.id)
    await expect(
      storage.listJobs({ kind: "memory.compaction" })
    ).resolves.toHaveLength(1)
  })

  it("rejects invalid payloads and skips models with unknown input limits", async () => {
    const endpoint = summaryEndpoint("invalid")
    const provider = new SummaryProvider(endpoint, [])
    const { storage, session, worker } = await createHarness({ provider })
    await session.create({ id: "ses_memory_invalid", kind: "agent" })
    await session.enqueueJob({
      id: "job_memory_invalid",
      kind: "memory.compaction",
      principalId: "memory_worker",
      payload: { sessionId: "" }
    })

    const result = await worker.runOnce()

    expect(result.status).toBe("failed")
    expect(JSON.stringify(result.status === "failed" ? result.job?.lastError : null))
      .toContain("payload evidence")
    const unknown = fakeModelEndpoint("unknown-memory")
    await expect(planMemoryCompaction({
      storage,
      sessionId: "ses_memory_invalid",
      modelEndpoint: createTurnExecutionBinding({
        modelEndpoint: unknown,
        createdAt: 1
      }).modelEndpoint
    })).resolves.toMatchObject({
      decision: "skip",
      reason: "model_limit_unknown"
    })
  })
})

async function createHarness(options: {
  readonly provider: SummaryProvider
  readonly retention?: Parameters<typeof createMemoryCompactionWorker>[0]["retention"]
}): Promise<{
  readonly storage: StorageTestStore
  readonly session: WanexSessionCore
  readonly worker: WanexWorker
}> {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-memory-runtime-"))
  tempDirs.push(storeDir)
  const storage = createStorageTestStore({
    kind: "local-system-service",
    mode: "persistent",
    storeDir,
    serviceBin
  })
  clients.push(storage)
  const session = new WanexSessionCore({ storage })
  const worker = createMemoryCompactionWorker({
    storage,
    workerId: "memory_worker",
    leaseMs: 60_000,
    directProvider: options.provider,
    tokenEstimator: characterTokenEstimator(),
    ...(options.retention === undefined ? {} : { retention: options.retention })
  })
  return { storage, session, worker }
}

async function seedConversation(
  session: WanexSessionCore,
  sessionId: string,
  endpoint: ReturnType<typeof summaryEndpoint>,
  count: number
): Promise<void> {
  await session.create({ id: sessionId, kind: "agent" })
  await appendCompletedTurns(session, sessionId, endpoint, 1, count)
}

async function appendCompletedTurns(
  session: WanexSessionCore,
  sessionId: string,
  endpoint: ReturnType<typeof summaryEndpoint>,
  firstIndex: number,
  count: number
): Promise<void> {
  for (let offset = 0; offset < count; offset += 1) {
    const index = firstIndex + offset
    const suffix = `${sessionId}_${index}`
    const submitted = await session.submitTurn({
      id: `inp_${suffix}`,
      turnId: `turn_${suffix}`,
      sessionId,
      principalId: "user_memory",
      idempotencyKey: `idem_${suffix}`,
      content: [{
        type: "text",
        id: `user_${suffix}`,
        text: `request turn-marker-${index}`
      }],
      jobId: `job_turn_${suffix}`,
      executionBinding: createTurnExecutionBinding({
        modelEndpoint: endpoint,
        createdAt: index
      })
    })
    const workerId = `worker_turn_${suffix}`
    const job = await session.claimJob({
      workerId,
      leaseMs: 60_000,
      kinds: ["session.turn"]
    })
    if (job?.leaseToken === undefined) {
      throw new Error(`expected turn job claim for ${suffix}`)
    }
    const started = await session.startTurnAttempt({
      sessionId,
      turnId: submitted.turn.id,
      inputId: submitted.admission.inputId,
      jobId: job.id,
      workerId,
      leaseToken: job.leaseToken
    })
    const invocation = await session.beginProviderInvocation({
      sessionId,
      turnId: submitted.turn.id,
      attemptId: started.attempt.id,
      inputId: submitted.admission.inputId,
      jobId: job.id,
      workerId,
      leaseToken: job.leaseToken,
      step: 1,
      invocationNumber: 1,
      requestDigest: `seed-request-${index}`
    })
    await session.settleTurn({
      sessionId,
      turnId: submitted.turn.id,
      attemptId: started.attempt.id,
      inputId: submitted.admission.inputId,
      jobId: job.id,
      workerId,
      leaseToken: job.leaseToken,
      outcome: "succeeded",
      providerInvocationId: invocation.id,
      assistantMessage: [{
        type: "text",
        id: `assistant_${suffix}`,
        text: `turn-marker-${index} ${"x".repeat(1_250)}`
      }]
    })
  }
}

async function usefulPlan(
  storage: StorageTestStore,
  sessionId: string,
  endpoint: ReturnType<typeof summaryEndpoint>
): Promise<ContextCompactionEvidence> {
  const plan = await planMemoryCompaction({
    storage,
    sessionId,
    modelEndpoint: createTurnExecutionBinding({
      modelEndpoint: endpoint,
      createdAt: 1
    }).modelEndpoint,
    policy: compactionPolicy(),
    tokenEstimator: characterTokenEstimator()
  })
  if (plan.decision !== "submit" || plan.evidence === undefined) {
    throw new Error(`expected useful memory plan, received ${plan.reason}`)
  }
  return plan.evidence
}

function compactionPolicy() {
  return {
    reserveInputTokens: 1_500,
    keepRecentTokens: 100,
    minimumRecentTurns: 1,
    maxSummaryOutputTokens: 100,
    maxSerializedToolResultChars: 100,
    minimumTokenSavings: 1,
    maxProviderAttempts: 2
  } as const
}

function summaryEndpoint(label: string) {
  const endpoint = fakeModelEndpoint(`summary_${label}`)
  return {
    ...endpoint,
    model: {
      ...endpoint.model,
      limits: {
        contextWindowTokens: 5_300,
        maxOutputTokens: 500
      }
    }
  }
}

async function claimMemoryJob(
  storage: StorageTestStore,
  workerId: string,
  leaseMs: number
): Promise<SchedulerJobRecord> {
  const job = await storage.claimJob({
    workerId,
    leaseMs,
    kinds: ["memory.compaction"]
  })
  if (job?.leaseToken === undefined) {
    throw new Error("expected memory job claim")
  }
  return job
}

function expireJobLease(storage: StorageTestStore, jobId: string): void {
  const database = new DatabaseSync(join(storage.storeDir, "state.db"))
  try {
    const result = database
      .prepare("UPDATE scheduler_job SET lease_expires_at = 0 WHERE id = ?")
      .run(jobId)
    if (result.changes !== 1) {
      throw new Error(`expected one memory job lease to expire: ${jobId}`)
    }
  } finally {
    database.close()
  }
}

async function beginEpoch(
  storage: StorageTestStore,
  job: SchedulerJobRecord,
  evidence: ContextCompactionEvidence
): Promise<ContextEpochRecord> {
  return await storage.beginContextEpoch({
    id: `ctxepoch_${job.id.replace(/[^a-zA-Z0-9_]+/g, "_")}`,
    sessionId: evidence.sessionId,
    ...leaseIdentity(job),
    maxProviderAttempts: evidence.policy.maxProviderAttempts,
    ...(evidence.previousEpochId === undefined
      ? {}
      : {
          previousEpochId: evidence.previousEpochId,
          previousSummaryDigest: evidence.previousSummaryDigest!
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
}

function leaseIdentity(job: SchedulerJobRecord) {
  if (job.leaseOwner === undefined || job.leaseToken === undefined) {
    throw new Error("claimed memory job is missing lease identity")
  }
  return {
    jobId: job.id,
    workerId: job.leaseOwner,
    leaseToken: job.leaseToken
  }
}

async function requireActive(
  storage: StorageTestStore,
  sessionId: string
): Promise<ContextEpochRecord> {
  const active = await storage.getActiveContextEpoch({ sessionId })
  if (active === null) throw new Error(`missing active epoch for ${sessionId}`)
  return active
}

function characterTokenEstimator(): ContextTokenEstimator {
  const estimatePartTokens: ContextTokenEstimator["estimatePartTokens"] = (part) => {
    if (part.type === "text" || part.type === "reasoning") {
      return part.text?.length ?? 0
    }
    if (part.type === "tool_result") {
      return part.content.reduce((total, item) => {
        if (item.type === "text") return total + item.text.length
        if (item.type === "json") return total + JSON.stringify(item.value).length
        return total + 16
      }, 0)
    }
    return 16
  }
  const estimatePartsTokens: ContextTokenEstimator["estimatePartsTokens"] =
    (parts) => parts.reduce((total, part) => total + estimatePartTokens(part), 0)
  return {
    estimatePartTokens,
    estimatePartsTokens,
    estimateMessagesTokens(messages) {
      return messages.reduce(
        (total, message) => total + 4 + estimatePartsTokens(message.content),
        0
      )
    }
  }
}

type SummaryOutcome =
  | { readonly kind: "success"; readonly text: string }
  | { readonly kind: "pre_output_error"; readonly retryable: boolean }
  | { readonly kind: "partial_error" }

class SummaryProvider implements ProviderAdapter {
  readonly protocol = { id: "fake" } as const
  readonly providerId = "fake"
  readonly model: ReturnType<typeof summaryEndpoint>["model"]
  readonly requests: ProviderRequest[] = []
  private outcomes: SummaryOutcome[]

  constructor(
    endpoint: ReturnType<typeof summaryEndpoint>,
    outcomes: readonly SummaryOutcome[]
  ) {
    this.model = endpoint.model
    this.outcomes = [...outcomes]
  }

  setOutcomes(outcomes: readonly SummaryOutcome[]): void {
    this.outcomes = [...outcomes]
  }

  async *stream(request: ProviderRequest): AsyncIterable<ProviderEvent> {
    this.requests.push(request)
    const outcome = this.outcomes.shift()
    if (outcome === undefined) {
      throw new Error("summary Provider has no configured outcome")
    }
    if (outcome.kind === "pre_output_error") {
      yield {
        type: "error",
        error: {
          category: "network",
          message: "summary request failed before output",
          retryable: outcome.retryable,
          providerId: this.providerId,
          modelId: this.model.id,
          phase: "request"
        }
      }
      return
    }
    if (outcome.kind === "partial_error") {
      yield { type: "text_delta", partId: "summary", delta: "partial" }
      yield {
        type: "error",
        error: {
          category: "network",
          message: "summary stream failed after output",
          retryable: true,
          providerId: this.providerId,
          modelId: this.model.id,
          phase: "stream"
        }
      }
      return
    }
    yield { type: "text_delta", partId: "summary", delta: outcome.text }
    yield { type: "finish", reason: "stop" }
  }

  buildReplayMessages(): JsonValue[] {
    return []
  }

  sourceText(index: number): string {
    const source = this.requests[index]?.messages[1]?.content[0]
    return source?.type === "text" ? source.text : ""
  }
}
