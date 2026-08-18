import { planMemoryCompaction } from "./planner.js"
import { submitMemoryCompactionJob } from "./submit.js"
import type { SchedulerJobRecord } from "@wanex/protocol"
import type {
  MemoryCompactionPlan,
  MemoryCompactionSweepReceipt,
  SweepMemoryCompactionRequest
} from "./types.js"

const DEFAULT_SWEEP_IDEMPOTENCY_PREFIX = "memory.compaction.sweep"

export async function sweepMemoryCompaction(
  request: SweepMemoryCompactionRequest
): Promise<MemoryCompactionSweepReceipt> {
  if (request.principalId.length === 0) {
    throw new Error("memory compaction sweep principalId must not be empty")
  }
  const idempotencyKeyPrefix =
    request.idempotencyKeyPrefix ?? DEFAULT_SWEEP_IDEMPOTENCY_PREFIX
  if (idempotencyKeyPrefix.length === 0) {
    throw new Error(
      "memory compaction sweep idempotencyKeyPrefix must not be empty"
    )
  }

  const sessions = await request.storage.listSessions({
    kind: request.sessions?.kind ?? "agent",
    status: request.sessions?.status ?? "active",
    ...(request.sessions?.updatedBefore === undefined
      ? {}
      : { updatedBefore: request.sessions.updatedBefore }),
    ...(request.sessions?.updatedAfter === undefined
      ? {}
      : { updatedAfter: request.sessions.updatedAfter }),
    ...(request.sessions?.limit === undefined
      ? {}
      : { limit: request.sessions.limit })
  })
  const plans: MemoryCompactionPlan[] = []
  const skippedPlans: MemoryCompactionPlan[] = []
  const submittedJobs: SchedulerJobRecord[] = []

  for (const session of sessions) {
    const modelEndpoint = await request.resolveModelEndpoint(session.id)
    if (modelEndpoint === null) {
      const plan: MemoryCompactionPlan = {
        sessionId: session.id,
        decision: "skip",
        reason: "model_limit_unknown",
        tokenEstimateBefore: 0,
        projectedTokenEstimateAfter: 0,
        tokenSavings: 0
      }
      plans.push(plan)
      skippedPlans.push(plan)
      continue
    }
    const plan = await planMemoryCompaction({
      storage: request.storage,
      sessionId: session.id,
      modelEndpoint,
      ...(request.policy === undefined ? {} : { policy: request.policy }),
      ...(request.tokenEstimator === undefined
        ? {}
        : { tokenEstimator: request.tokenEstimator })
    })
    plans.push(plan)
    if (plan.decision !== "submit") {
      skippedPlans.push(plan)
      continue
    }
    if (plan.evidence === undefined) {
      throw new Error("submitted memory compaction plan is missing frozen evidence")
    }
    submittedJobs.push(
      await submitMemoryCompactionJob(request.storage, {
        principalId: request.principalId,
        evidence: plan.evidence,
        ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
        ...(request.priority === undefined ? {} : { priority: request.priority }),
        ...(request.budgetGrantId === undefined
          ? {}
          : { budgetGrantId: request.budgetGrantId }),
        idempotencyKey: `${idempotencyKeyPrefix}:${session.id}:${plan.evidence.sourceDigest}:${plan.evidence.policyDigest}`
      })
    )
  }

  return {
    scannedSessionIds: sessions.map((session) => session.id),
    plans,
    submittedJobs,
    skippedPlans,
    idempotencyKeyPrefix
  }
}
