import type { TextMessagePart } from "@wanex/protocol"
import { WanexRuntimeHost } from "@wanex/runtime/host"
import {
  createMemoryCompactionWorker,
  planMemoryCompaction,
  submitMemoryCompactionJob
} from "@wanex/runtime/memory"
import { WanexSessionCore } from "@wanex/runtime/sessions"
import { createEvalScenario } from "../runner.js"
import { assert } from "../scenario-utils.js"
import {
  memoryCompactionPolicy,
  MemorySemanticProvider,
  MEMORY_REPLAY_SESSION_ID,
  seedReplaySession
} from "./helpers.js"

export const memoryReplayProductPathScenario = createEvalScenario({
  id: "memory.compaction-agent-replay",
  title: "Agent runtime replay consumes a semantic checkpoint and exact recent tail",
  tags: ["memory", "context", "agent", "product-path"],
  async run(context) {
    const session = new WanexSessionCore({ storage: context.storage })
    const provider = new MemorySemanticProvider()
    const compactionWorker = createMemoryCompactionWorker({
      storage: context.storage,
      workerId: "eval_memory_replay_worker",
      leaseMs: 60_000,
      directProvider: provider
    })
    await seedReplaySession(session)
    const seededTurns = await context.storage.listSessionTurns({
      sessionId: MEMORY_REPLAY_SESSION_ID
    })
    const modelEndpoint = seededTurns[0]?.executionBinding.modelEndpoint
    assert(modelEndpoint !== undefined, "seeded replay turn must freeze a model endpoint")
    const plan = await planMemoryCompaction({
      storage: context.storage,
      sessionId: MEMORY_REPLAY_SESSION_ID,
      modelEndpoint,
      policy: memoryCompactionPolicy()
    })
    assert(plan.decision === "submit", `semantic replay plan should submit: ${plan.reason}`)
    assert(plan.evidence !== undefined, "semantic replay plan must freeze evidence")
    await submitMemoryCompactionJob(context.storage, {
      id: "job_eval_memory_replay_compaction",
      principalId: "principal_eval_memory",
      evidence: plan.evidence,
      idempotencyKey: "eval-memory-replay-compaction"
    })

    const compactionResult = await compactionWorker.runOnce()
    assert(
      compactionResult.status === "completed",
      "memory replay compaction job should complete"
    )
    const activeEpoch = await context.storage.getActiveContextEpoch({
      sessionId: MEMORY_REPLAY_SESSION_ID
    })
    assert(activeEpoch !== null, "memory replay compaction should activate an epoch")

    const host = new WanexRuntimeHost({
      storage: context.storage,
      workerCount: 1,
      provider
    })
    try {
      await host.submitUserTurn({
        content: [{ type: "text", text: "new replay request" }],
        sessionId: MEMORY_REPLAY_SESSION_ID,
        inputId: "inp_eval_memory_replay_new",
        principalId: "principal_eval_memory",
        idempotencyKey: "idem_eval_memory_replay_new",
        jobId: "job_eval_memory_replay_agent"
      })
      const runResult = await host.runOnce()

      assert(
        runResult.results[0]?.worker.status === "completed",
        "agent run should complete through runtime host"
      )
      const replayText = provider.lastMessages
        .flatMap((message) => message.content)
        .filter((part): part is TextMessagePart => part.type === "text")
        .map((part) => part.text)
        .join("\n")
      const messages = await session.listMessages({
        sessionId: MEMORY_REPLAY_SESSION_ID
      })

      assert(
        replayText.includes("Preserve durable eval context"),
        "agent replay should include the durable semantic checkpoint"
      )
      assert(
        replayText.includes("latest replay turn stays exact"),
        "agent replay should preserve the exact recent tail"
      )
      assert(
        replayText.includes("new replay request"),
        "agent replay should include the new user request"
      )
      assert(
        !replayText.includes("old replay durable context old replay durable context"),
        "agent replay should not resend compacted raw history"
      )
      assert(
        messages.some(
          (message) =>
            message.content[0]?.type === "text" &&
            message.content[0].text.includes("old replay durable context")
        ),
        "canonical old assistant message should remain durable"
      )

      return {
        compactionStatus: compactionResult.status,
        agentStatus: runResult.results[0]?.worker.status,
        activeEpochId: activeEpoch.id,
        cutSequence: activeEpoch.cutSequence,
        summaryDigest: activeEpoch.summaryDigest ?? null,
        replayIncludedSummary: replayText.includes("Preserve durable eval context"),
        replayIncludedExactTail: replayText.includes("latest replay turn stays exact"),
        rawMessageCount: messages.length
      }
    } finally {
      await host.dispose()
    }
  }
})
