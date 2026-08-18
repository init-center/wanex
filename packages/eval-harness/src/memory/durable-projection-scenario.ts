import {
  createMemoryCompactionWorker,
  planMemoryCompaction,
  submitMemoryCompactionJob
} from "@wanex/runtime/memory"
import { WanexSessionCore } from "@wanex/runtime/sessions"
import { createEvalScenario } from "../runner.js"
import { assert } from "../scenario-utils.js"
import {
  contextCompactionEventTypes,
  memoryCompactionPolicy,
  MemorySemanticProvider,
  MEMORY_PROJECTION_SESSION_ID,
  seedCompletedMemoryTurns
} from "./helpers.js"

export const memoryCompactionDurableProjectionScenario = createEvalScenario({
  id: "memory.compaction-durable-projection",
  title: "Memory compaction persists a semantic checkpoint without mutating history",
  tags: ["memory", "context", "worker"],
  async run(context) {
    const session = new WanexSessionCore({ storage: context.storage })
    const provider = new MemorySemanticProvider()
    const worker = createMemoryCompactionWorker({
      storage: context.storage,
      workerId: "eval_memory_worker",
      leaseMs: 60_000,
      directProvider: provider
    })

    await seedCompletedMemoryTurns(session)
    const canonicalBefore = await session.listMessages({
      sessionId: MEMORY_PROJECTION_SESSION_ID
    })
    const turns = await context.storage.listSessionTurns({
      sessionId: MEMORY_PROJECTION_SESSION_ID
    })
    const modelEndpoint = turns[0]?.executionBinding.modelEndpoint
    assert(modelEndpoint !== undefined, "seeded memory turn must freeze a model endpoint")
    const plan = await planMemoryCompaction({
      storage: context.storage,
      sessionId: MEMORY_PROJECTION_SESSION_ID,
      modelEndpoint,
      policy: memoryCompactionPolicy()
    })
    assert(plan.decision === "submit", `semantic memory plan should submit: ${plan.reason}`)
    assert(plan.evidence !== undefined, "semantic memory plan must freeze evidence")
    await submitMemoryCompactionJob(context.storage, {
      id: "job_eval_memory_compaction",
      principalId: "principal_eval_memory",
      evidence: plan.evidence,
      metadata: { source: "eval" },
      idempotencyKey: "eval-memory-compaction"
    })

    const result = await worker.runOnce()

    assert(result.status === "completed", "memory compaction job should complete")
    const activeEpoch = await context.storage.getActiveContextEpoch({
      sessionId: MEMORY_PROJECTION_SESSION_ID
    })
    assert(activeEpoch !== null, "memory compaction should activate an epoch")
    const events = await context.storage.queryEvents({
      scope: { sessionId: MEMORY_PROJECTION_SESSION_ID },
      limit: 100
    })
    const canonicalAfter = await session.listMessages({
      sessionId: MEMORY_PROJECTION_SESSION_ID
    })
    const exactTail = canonicalBefore.filter(
      (message) => message.sequence > activeEpoch.cutSequence
    )

    assert(
      JSON.stringify(canonicalAfter) === JSON.stringify(canonicalBefore),
      "canonical conversation history must remain unchanged"
    )
    assert(
      activeEpoch.summary?.includes("Preserve durable eval context") === true,
      "active epoch should contain the model-generated semantic summary"
    )
    assert(exactTail.length === 2, "the most recent complete Turn should remain exact")
    assert(provider.summaryRequests.length === 1, "one summary Provider call is expected")
    assert(
      provider.summaryRequests[0]?.tools === undefined,
      "semantic summary Provider request must be tool-free"
    )
    assert(
      events.some((event) => event.type === "context.compaction.applied"),
      "memory compaction should emit an applied event"
    )

    return {
      jobStatus: result.status,
      activeEpochId: activeEpoch.id,
      generationState: activeEpoch.generationState,
      cutSequence: activeEpoch.cutSequence,
      summaryDigest: activeEpoch.summaryDigest ?? null,
      exactTailMessageIds: exactTail.map((message) => message.id),
      canonicalMessageCount: canonicalAfter.length,
      eventTypes: contextCompactionEventTypes(events.map((event) => event.type))
    }
  }
})
