import {
  createMemoryCompactionWorker,
  submitMemoryCompactionJob
} from "@wanex/runtime/memory"
import { WanexSessionCore } from "@wanex/runtime/sessions"
import { createEvalScenario } from "../runner.js"
import { assert } from "../scenario-utils.js"
import {
  contextCompactionEventTypes,
  MEMORY_PROJECTION_SESSION_ID,
  seedCompletedMemoryTurn
} from "./helpers.js"

export const memoryCompactionDurableProjectionScenario = createEvalScenario({
  id: "memory.compaction-durable-projection",
  title: "Memory compaction persists deterministic projections without mutating history",
  tags: ["memory", "context", "worker"],
  async run(context) {
    const session = new WanexSessionCore({ storage: context.storage })
    const worker = createMemoryCompactionWorker({
      storage: context.storage,
      workerId: "eval_memory_worker",
      leaseMs: 60_000
    })

    await seedCompletedMemoryTurn(session)
    await submitMemoryCompactionJob(context.storage, {
      id: "job_eval_memory_compaction",
      principalId: "principal_eval_memory",
      sessionId: MEMORY_PROJECTION_SESSION_ID,
      policy: {
        version: "eval-memory-v1",
        recentUserTurns: 0,
        snipTextOverChars: 20,
        placeholderTextOverChars: 60
      },
      metadata: {
        source: "eval"
      },
      idempotencyKey: "eval-memory-compaction"
    })

    const result = await worker.runOnce()

    assert(result.status === "completed", "memory compaction job should complete")
    const activeEpoch = await context.storage.getActiveContextEpoch({
      sessionId: MEMORY_PROJECTION_SESSION_ID,
      policyVersion: "eval-memory-v1"
    })
    assert(activeEpoch !== null, "memory compaction should activate an epoch")
    const replacements = await context.storage.listContextReplacements({
      sessionId: MEMORY_PROJECTION_SESSION_ID,
      policyVersion: "eval-memory-v1",
      epochId: activeEpoch.id
    })
    const events = await context.storage.queryEvents({
      scope: { sessionId: MEMORY_PROJECTION_SESSION_ID },
      limit: 20
    })
    const inputs = await session.listInputs({
      sessionId: MEMORY_PROJECTION_SESSION_ID
    })
    const messages = await session.listMessages({
      sessionId: MEMORY_PROJECTION_SESSION_ID
    })

    assert(replacements.length === 1, "one deterministic replacement is expected")
    assert(inputs.length === 1, "raw user input should remain durable")
    assert(messages.length === 1, "raw assistant message should remain durable")
    assert(
      messages[0]?.content[0]?.type === "text" &&
        messages[0].content[0].text.includes("durable context"),
      "raw assistant message text should not be replaced"
    )
    assert(
      replacements[0]?.replacement.type === "text" &&
        replacements[0].replacement.text === "[compacted 1920 chars]",
      "replacement should be the deterministic compacted projection"
    )
    assert(
      events.some((event) => event.type === "context.compaction.planned"),
      "memory compaction should emit a planned event"
    )
    assert(
      events.some((event) => event.type === "context.compaction.applied"),
      "memory compaction should emit an applied event"
    )

    return {
      jobStatus: result.status,
      replacementCount: replacements.length,
      activeEpochId: activeEpoch.id,
      inputCount: inputs.length,
      messageCount: messages.length,
      eventTypes: contextCompactionEventTypes(events.map((event) => event.type)),
      replacementText:
        replacements[0]?.replacement.type === "text"
          ? replacements[0].replacement.text
          : null
    }
  }
})
