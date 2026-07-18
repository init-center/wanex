import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import type { ContextTokenEstimator } from "../src/context/memory/index.js"
import { WanexSessionCore } from "../src/sessions/index.js"
import { createStorageTestStore, type StorageTestStore } from "@wanex/storage/testing"
import type { WanexWorker } from "../src/jobs/index.js"
import {
  createMemoryCompactionWorker,
  planMemoryCompaction,
  submitMemoryCompactionJob,
  sweepMemoryCompaction
} from "../src/memory/index.js"

const serviceBin = join(
  import.meta.dirname,
  "../../../target/debug/wanex-system-service"
)

const tempDirs: string[] = []
const clients: StorageTestStore[] = []

afterEach(async () => {
  while (clients.length > 0) {
    await clients.pop()?.dispose()
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

describe("@wanex/runtime/memory", () => {
  it("runs a durable memory.compaction job and persists replacements", async () => {
    const { storage, session, worker } = await createHarness()
    await seedCompletedTurn({
      session,
      sessionId: "ses_memory_job",
      inputId: "inp_memory_job",
      assistantText: "assistant memory ".repeat(80)
    })
    const job = await submitMemoryCompactionJob(storage, {
      id: "job_memory_compaction",
      principalId: "memory_worker",
      sessionId: "ses_memory_job",
      policy: {
        version: "test-memory-v1",
        recentUserTurns: 0,
        snipTextOverChars: 20,
        placeholderTextOverChars: 60
      },
      metadata: { reason: "test" },
      idempotencyKey: "memory-compaction-job"
    })
    expect(job.kind).toBe("memory.compaction")

    const result = await worker.runOnce()

    expect(result.status).toBe("completed")
    if (result.status !== "completed") {
      throw new Error("expected completed result")
    }
    expect(result.job.result).toMatchObject({
      sessionId: "ses_memory_job",
      epochId: "ctxepoch_job_memory_compaction_attempt_1",
      policyVersion: "test-memory-v1",
      replacementCount: 1,
      metadata: { reason: "test" }
    })
    expect(result.job.result).toHaveProperty("replacementIds")
    const activeEpoch = await storage.getActiveContextEpoch({
      sessionId: "ses_memory_job",
      policyVersion: "test-memory-v1"
    })
    expect(activeEpoch).toMatchObject({
      id: "ctxepoch_job_memory_compaction_attempt_1",
      state: "active",
      replacementCount: 1
    })
    if (activeEpoch === null) {
      throw new Error("expected active epoch")
    }
    const replacements = await storage.listContextReplacements({
      sessionId: "ses_memory_job",
      policyVersion: "test-memory-v1",
      epochId: activeEpoch.id
    })
    const events = await storage.queryEvents({
      scope: { sessionId: "ses_memory_job" },
      limit: 20
    })
    expect(replacements).toHaveLength(1)
    expect(replacements[0]?.replacement).toMatchObject({
      type: "text",
      id: "assistant_memory_job",
      text: "[compacted 1360 chars]"
    })
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "context.compaction.planned",
        "context.epoch.created",
        "context.compaction.applied",
        "context.epoch.activated"
      ])
    )
    expect(
      events.find((event) => event.type === "context.compaction.applied")?.payload
    ).toMatchObject({
      jobId: "job_memory_compaction",
      attempt: 1,
      policyVersion: "test-memory-v1",
      detail: {
        sessionId: "ses_memory_job",
        epochId: "ctxepoch_job_memory_compaction_attempt_1",
        replacementCount: 1
      }
    })
  })

  it("prunes superseded epochs after repeated compaction when retention is configured", async () => {
    const { storage, session, worker } = await createHarness({
      retention: {
        keepLastSuperseded: 0
      }
    })
    await seedCompletedTurn({
      session,
      sessionId: "ses_memory_repeat",
      inputId: "inp_memory_repeat",
      assistantText: "repeat memory ".repeat(80)
    })
    await submitMemoryCompactionJob(storage, {
      id: "job_memory_repeat_1",
      principalId: "memory_worker",
      sessionId: "ses_memory_repeat",
      policy: {
        version: "test-memory-repeat",
        recentUserTurns: 0,
        snipTextOverChars: 20,
        placeholderTextOverChars: 60
      }
    })
    await submitMemoryCompactionJob(storage, {
      id: "job_memory_repeat_2",
      principalId: "memory_worker",
      sessionId: "ses_memory_repeat",
      policy: {
        version: "test-memory-repeat",
        recentUserTurns: 0,
        snipTextOverChars: 20,
        placeholderTextOverChars: 60
      }
    })

    const first = await worker.runOnce()
    const second = await worker.runOnce()

    expect(first.status).toBe("completed")
    expect(second.status).toBe("completed")
    if (first.status !== "completed" || second.status !== "completed") {
      throw new Error("expected completed results")
    }
    expect(first.job.result).toMatchObject({
      epochId: "ctxepoch_job_memory_repeat_1_attempt_1",
      replacementCount: 1
    })
    expect(second.job.result).toMatchObject({
      epochId: "ctxepoch_job_memory_repeat_2_attempt_1",
      replacementCount: 1,
      prune: {
        sessionId: "ses_memory_repeat",
        policyVersion: "test-memory-repeat",
        scannedCount: 1,
        deletedEpochIds: ["ctxepoch_job_memory_repeat_1_attempt_1"],
        deletedReplacementCount: 1,
        dryRun: false
      }
    })
    expect(second.job.result).not.toEqual(first.job.result)
    const activeEpoch = await storage.getActiveContextEpoch({
      sessionId: "ses_memory_repeat",
      policyVersion: "test-memory-repeat"
    })
    expect(activeEpoch).toMatchObject({
      id: "ctxepoch_job_memory_repeat_2_attempt_1",
      state: "active"
    })
    if (activeEpoch === null) {
      throw new Error("expected active epoch")
    }
    const epochs = await storage.listContextEpochs({
      sessionId: "ses_memory_repeat",
      policyVersion: "test-memory-repeat"
    })
    expect(epochs.map((epoch) => ({ id: epoch.id, state: epoch.state }))).toEqual([
      { id: "ctxepoch_job_memory_repeat_2_attempt_1", state: "active" }
    ])
    const activeReplacements = await storage.listContextReplacements({
      sessionId: "ses_memory_repeat",
      policyVersion: "test-memory-repeat",
      epochId: activeEpoch.id
    })
    const allReplacements = await storage.listContextReplacements({
      sessionId: "ses_memory_repeat",
      policyVersion: "test-memory-repeat"
    })
    expect(activeReplacements).toHaveLength(1)
    expect(allReplacements).toHaveLength(1)
  })

  it("fails invalid memory.compaction payloads deterministically", async () => {
    const { session, worker } = await createHarness()
    await session.enqueueJob({
      id: "job_memory_invalid",
      kind: "memory.compaction",
      principalId: "memory_worker",
      payload: { sessionId: "" }
    })

    const result = await worker.runOnce()

    expect(result.status).toBe("failed")
    if (result.status !== "failed") {
      throw new Error("expected failed result")
    }
    expect(result.job?.state).toBe("failed")
    expect(result.job?.lastError).toMatchObject({
      type: "worker.error"
    })
    expect(JSON.stringify(result.job?.lastError)).toContain(
      "memory.compaction.sessionId"
    )
  })

  it("sweeps agent sessions and submits only useful compaction jobs", async () => {
    const { storage, session } = await createHarness()
    await seedCompletedTurn({
      session,
      sessionId: "ses_memory_sweep_large",
      inputId: "inp_memory_sweep_large",
      assistantText: "sweep memory ".repeat(80)
    })
    await seedCompletedTurn({
      session,
      sessionId: "ses_memory_sweep_small",
      inputId: "inp_memory_sweep_small",
      assistantText: "short"
    })
    await seedCompletedTurn({
      session,
      sessionId: "ses_memory_sweep_chat",
      inputId: "inp_memory_sweep_chat",
      assistantText: "chat memory ".repeat(80),
      kind: "chat"
    })

    const first = await sweepMemoryCompaction({
      storage,
      principalId: "memory_sweeper",
      waterlineTokens: 1,
      policy: {
        version: "test-memory-sweep",
        recentUserTurns: 0,
        snipTextOverChars: 20,
        placeholderTextOverChars: 60
      },
      idempotencyKeyPrefix: "test-memory-sweep"
    })
    const second = await sweepMemoryCompaction({
      storage,
      principalId: "memory_sweeper",
      waterlineTokens: 1,
      policy: {
        version: "test-memory-sweep",
        recentUserTurns: 0,
        snipTextOverChars: 20,
        placeholderTextOverChars: 60
      },
      idempotencyKeyPrefix: "test-memory-sweep"
    })

    expect(first.scannedSessionIds).toEqual(
      expect.arrayContaining([
        "ses_memory_sweep_large",
        "ses_memory_sweep_small"
      ])
    )
    expect(first.scannedSessionIds).not.toContain("ses_memory_sweep_chat")
    expect(first.plans).toHaveLength(2)
    expect(first.submittedJobs).toHaveLength(1)
    expect(first.submittedJobs[0]).toMatchObject({
      kind: "memory.compaction",
      idempotencyKey: "test-memory-sweep:ses_memory_sweep_large:test-memory-sweep"
    })
    expect(first.skippedPlans).toEqual([
      expect.objectContaining({
        sessionId: "ses_memory_sweep_small",
        decision: "skip"
      })
    ])
    expect(second.submittedJobs[0]?.id).toBe(first.submittedJobs[0]?.id)
    await expect(
      storage.listJobs({ kind: "memory.compaction" })
    ).resolves.toHaveLength(1)
  })

  it("compacts an empty session to an empty durable result", async () => {
    const { storage, session, worker } = await createHarness()
    await session.create({ id: "ses_memory_empty", kind: "agent" })
    await submitMemoryCompactionJob(storage, {
      id: "job_memory_empty",
      principalId: "memory_worker",
      sessionId: "ses_memory_empty",
      policy: { version: "test-memory-empty" }
    })

    const result = await worker.runOnce()

    expect(result.status).toBe("completed")
    if (result.status !== "completed") {
      throw new Error("expected completed result")
    }
    expect(result.job.result).toMatchObject({
      sessionId: "ses_memory_empty",
      epochId: "ctxepoch_job_memory_empty_attempt_1",
      policyVersion: "test-memory-empty",
      tokenEstimateBefore: 0,
      tokenEstimateAfter: 0,
      replacementCount: 0,
      replacementIds: []
    })
    await expect(
      storage.getActiveContextEpoch({
        sessionId: "ses_memory_empty",
        policyVersion: "test-memory-empty"
      })
    ).resolves.toMatchObject({
      id: "ctxepoch_job_memory_empty_attempt_1",
      state: "active",
      replacementCount: 0
    })
    await expect(
      storage.listContextReplacements({
        sessionId: "ses_memory_empty",
        policyVersion: "test-memory-empty",
        epochId: "ctxepoch_job_memory_empty_attempt_1"
      })
    ).resolves.toHaveLength(0)
    await expect(
      storage.queryEvents({
        scope: { sessionId: "ses_memory_empty" },
        limit: 20
      })
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "context.compaction.planned",
          payload: expect.objectContaining({
            policyVersion: "test-memory-empty"
          })
        }),
        expect.objectContaining({
          type: "context.compaction.skipped",
          payload: expect.objectContaining({
            detail: expect.objectContaining({
              epochId: "ctxepoch_job_memory_empty_attempt_1",
              replacementCount: 0,
              skipReason: "no_replacements"
            })
          })
        }),
        expect.objectContaining({
          type: "context.epoch.activated",
          payload: expect.objectContaining({
            detail: expect.objectContaining({
              epochId: "ctxepoch_job_memory_empty_attempt_1"
            })
          })
        })
      ])
    )
  })

  it("plans compaction submission when history crosses the token waterline", async () => {
    const { storage, session } = await createHarness()
    await seedCompletedTurn({
      session,
      sessionId: "ses_memory_plan_submit",
      inputId: "inp_memory_plan_submit",
      assistantText: "plan submit memory ".repeat(80)
    })

    const plan = await planMemoryCompaction({
      storage,
      sessionId: "ses_memory_plan_submit",
      waterlineTokens: 10,
      policy: {
        version: "test-memory-plan-submit",
        recentUserTurns: 0,
        snipTextOverChars: 20,
        placeholderTextOverChars: 60
      }
    })

    expect(plan).toMatchObject({
      sessionId: "ses_memory_plan_submit",
      policyVersion: "test-memory-plan-submit",
      decision: "submit",
      reason: "above_waterline",
      waterlineTokens: 10,
      minimumTokenSavings: 1,
      replacementCount: 1
    })
    expect(plan.tokenEstimateBefore).toBeGreaterThanOrEqual(plan.waterlineTokens)
    expect(plan.tokenSavings).toBeGreaterThanOrEqual(plan.minimumTokenSavings)
    await expect(
      storage.listContextReplacements({
        sessionId: "ses_memory_plan_submit",
        policyVersion: "test-memory-plan-submit"
      })
    ).resolves.toHaveLength(0)
  })

  it("plans a skip when history is below the token waterline", async () => {
    const { storage, session } = await createHarness()
    await seedCompletedTurn({
      session,
      sessionId: "ses_memory_plan_below",
      inputId: "inp_memory_plan_below",
      assistantText: "short memory"
    })

    const plan = await planMemoryCompaction({
      storage,
      sessionId: "ses_memory_plan_below",
      waterlineTokens: 1_000,
      policy: {
        version: "test-memory-plan-below",
        recentUserTurns: 0,
        snipTextOverChars: 20,
        placeholderTextOverChars: 60
      }
    })

    expect(plan).toMatchObject({
      decision: "skip",
      reason: "below_waterline",
      replacementCount: 0
    })
    expect(plan.tokenEstimateBefore).toBeLessThan(plan.waterlineTokens)
  })

  it("plans a skip when projected savings are below the configured minimum", async () => {
    const { storage, session } = await createHarness()
    await seedCompletedTurn({
      session,
      sessionId: "ses_memory_plan_savings",
      inputId: "inp_memory_plan_savings",
      assistantText: "plan savings memory ".repeat(80)
    })

    const plan = await planMemoryCompaction({
      storage,
      sessionId: "ses_memory_plan_savings",
      waterlineTokens: 10,
      minimumTokenSavings: 10_000,
      policy: {
        version: "test-memory-plan-savings",
        recentUserTurns: 0,
        snipTextOverChars: 20,
        placeholderTextOverChars: 60
      }
    })

    expect(plan).toMatchObject({
      decision: "skip",
      reason: "insufficient_savings",
      replacementCount: 1,
      minimumTokenSavings: 10_000
    })
    expect(plan.tokenSavings).toBeLessThan(plan.minimumTokenSavings)
  })

  it("uses an injected token estimator for waterline planning", async () => {
    const { storage, session } = await createHarness()
    await seedCompletedTurn({
      session,
      sessionId: "ses_memory_plan_estimator",
      inputId: "inp_memory_plan_estimator",
      assistantText: "x".repeat(80)
    })

    const plan = await planMemoryCompaction({
      storage,
      sessionId: "ses_memory_plan_estimator",
      waterlineTokens: 90,
      tokenEstimator: characterTokenEstimator(),
      policy: {
        version: "test-memory-plan-estimator",
        recentUserTurns: 0,
        snipTextOverChars: 20,
        placeholderTextOverChars: 60
      }
    })

    expect(plan).toMatchObject({
      decision: "submit",
      reason: "above_waterline",
      tokenEstimateBefore: 95,
      tokenEstimateAfter: 35,
      tokenSavings: 60
    })
  })

  it("uses an injected token estimator while executing compaction jobs", async () => {
    const { storage, session, worker } = await createHarness({
      tokenEstimator: characterTokenEstimator()
    })
    await seedCompletedTurn({
      session,
      sessionId: "ses_memory_job_estimator",
      inputId: "inp_memory_job_estimator",
      assistantText: "x".repeat(80)
    })
    await submitMemoryCompactionJob(storage, {
      id: "job_memory_estimator",
      principalId: "memory_worker",
      sessionId: "ses_memory_job_estimator",
      policy: {
        version: "test-memory-job-estimator",
        recentUserTurns: 0,
        snipTextOverChars: 20,
        placeholderTextOverChars: 60
      }
    })

    const result = await worker.runOnce()

    expect(result.status).toBe("completed")
    if (result.status !== "completed") {
      throw new Error("expected completed result")
    }
    expect(result.job.result).toMatchObject({
      epochId: "ctxepoch_job_memory_estimator_attempt_1",
      tokenEstimateBefore: 95,
      tokenEstimateAfter: 35,
      replacementCount: 1
    })
    const activeEpoch = await storage.getActiveContextEpoch({
      sessionId: "ses_memory_job_estimator",
      policyVersion: "test-memory-job-estimator"
    })
    expect(activeEpoch?.id).toBe("ctxepoch_job_memory_estimator_attempt_1")
    if (activeEpoch === null) {
      throw new Error("expected active epoch")
    }
    await expect(
      storage.listContextReplacements({
        sessionId: "ses_memory_job_estimator",
        policyVersion: "test-memory-job-estimator",
        epochId: activeEpoch.id
      })
    ).resolves.toEqual([
      expect.objectContaining({
        originalTokenEstimate: 80,
        replacementTokenEstimate: 20
      })
    ])
  })
})

async function createHarness(options: {
  readonly tokenEstimator?: ContextTokenEstimator
  readonly retention?: Parameters<typeof createMemoryCompactionWorker>[0]["retention"]
} = {}): Promise<{
  readonly storage: StorageTestStore
  readonly session: WanexSessionCore
  readonly worker: WanexWorker
}> {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-memory-runtime-"))
  tempDirs.push(storeDir)
  const storage = createStorageTestStore({ kind: "local-system-service", mode: "persistent",
    storeDir,
    serviceBin
  })
  clients.push(storage)
  const session = new WanexSessionCore({ storage })
  const worker = createMemoryCompactionWorker({
    storage,
    workerId: "memory_worker",
    leaseMs: 60_000,
    ...(options.tokenEstimator === undefined
      ? {}
      : { tokenEstimator: options.tokenEstimator }),
    ...(options.retention === undefined ? {} : { retention: options.retention })
  })
  return { storage, session, worker }
}

async function seedCompletedTurn(request: {
  readonly session: WanexSessionCore
  readonly sessionId: string
  readonly inputId: string
  readonly assistantText: string
  readonly kind?: "agent" | "chat"
}): Promise<void> {
  await request.session.create({
    id: request.sessionId,
    kind: request.kind ?? "agent"
  })
  await request.session.admit({
    id: request.inputId,
    sessionId: request.sessionId,
    principalId: "user_memory",
    idempotencyKey: `idem_${request.inputId}`,
    content: [
      {
        type: "text",
        id: `user_${request.inputId}`,
        text: "please remember"
      }
    ]
  })
  const claim = await request.session.claimRunner({
    sessionId: request.sessionId,
    runnerId: `runner_${request.inputId}`,
    leaseMs: 60_000
  })
  if (claim === null) {
    throw new Error(`expected runner claim for ${request.sessionId}`)
  }
  await request.session.completeRun({
    sessionId: request.sessionId,
    runId: claim.runId,
    inputId: claim.inputId,
    runnerId: claim.runnerId,
    leaseToken: claim.leaseToken,
    assistantMessage: [
      {
        type: "text",
        id: request.inputId.replace("inp_", "assistant_"),
        text: request.assistantText
      }
    ]
  })
}

function characterTokenEstimator(): ContextTokenEstimator {
  const estimatePartTokens: ContextTokenEstimator["estimatePartTokens"] = (part) =>
    part.type === "text" || part.type === "reasoning"
      ? (part.text?.length ?? 0)
      : 8
  return {
    estimatePartTokens,
    estimatePartsTokens(parts) {
      return parts.reduce((sum, part) => sum + estimatePartTokens(part), 0)
    }
  }
}
