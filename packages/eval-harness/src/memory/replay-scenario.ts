import { DeterministicContextCompiler } from "@wanex/runtime/context"
import type {
  ProviderAdapter,
  ProviderEvent,
  ProviderRequest,
  ProviderReplayMessage
} from "@wanex/runtime/provider"
import {
  createMemoryCompactionWorker,
  submitMemoryCompactionJob
} from "@wanex/runtime/memory"
import type { JsonValue, TextMessagePart } from "@wanex/protocol"
import { WanexRuntimeHost } from "@wanex/runtime/host"
import { WanexSessionCore } from "@wanex/runtime/sessions"
import { createEvalScenario } from "../runner.js"
import { assert } from "../scenario-utils.js"
import {
  MEMORY_REPLAY_SESSION_ID,
  replayPolicy,
  seedReplaySession
} from "./helpers.js"

export const memoryReplayProductPathScenario = createEvalScenario({
  id: "memory.compaction-agent-replay",
  title: "Agent runtime replay consumes durable memory projections",
  tags: ["memory", "context", "agent", "product-path"],
  async run(context) {
    const session = new WanexSessionCore({ storage: context.storage })
    const compactionWorker = createMemoryCompactionWorker({
      storage: context.storage,
      workerId: "eval_memory_replay_worker",
      leaseMs: 60_000
    })
    await seedReplaySession(session)
    await submitMemoryCompactionJob(context.storage, {
      id: "job_eval_memory_replay_compaction",
      principalId: "principal_eval_memory",
      sessionId: MEMORY_REPLAY_SESSION_ID,
      policy: replayPolicy(),
      idempotencyKey: "eval-memory-replay-compaction"
    })

    const compactionResult = await compactionWorker.runOnce()
    assert(
      compactionResult.status === "completed",
      "memory replay compaction job should complete"
    )

    const provider = new ReplayRecordingProvider()
    const host = new WanexRuntimeHost({
      storage: context.storage,
      workerCount: 1,
      provider,
      contextCompiler: new DeterministicContextCompiler({
        replacementStore: context.storage,
        policy: replayPolicy()
      })
    })
    await host.submitUserTurn({
      content: [{ type: "text", text: "new replay request" }],
      sessionId: MEMORY_REPLAY_SESSION_ID,
      inputId: "inp_eval_memory_replay_new",
      principalId: "principal_eval_memory",
      idempotencyKey: "idem_eval_memory_replay_new",
      jobId: "job_eval_memory_replay_agent"
    })

    const runResult = await host.runOnce()
    await host.stop()

    assert(
      runResult.results[0]?.worker.status === "completed",
      "agent run should complete through runtime host"
    )
    const replayText = provider.lastMessages
      .flatMap((message) => message.content)
      .filter((part): part is TextMessagePart => part.type === "text")
      .map((part) => part.text)
      .join("\n")
    const activeEpoch = await context.storage.getActiveContextEpoch({
      sessionId: MEMORY_REPLAY_SESSION_ID,
      policyVersion: "eval-memory-replay-v1"
    })
    assert(activeEpoch !== null, "memory replay compaction should activate an epoch")
    const replacements = await context.storage.listContextReplacements({
      sessionId: MEMORY_REPLAY_SESSION_ID,
      policyVersion: "eval-memory-replay-v1",
      epochId: activeEpoch.id
    })
    const messages = await session.listMessages({
      sessionId: MEMORY_REPLAY_SESSION_ID
    })

    assert(
      replayText.includes("[compacted 1840 chars]"),
      "agent replay should include the durable compacted projection"
    )
    assert(
      replayText.includes("new replay request"),
      "agent replay should include the new user request"
    )
    assert(replacements.length === 1, "one replay replacement is expected")
    assert(
      messages.some(
        (message) =>
          message.content[0]?.type === "text" &&
          message.content[0].text.includes("replay durable context")
      ),
      "raw old assistant message should remain durable"
    )

    return {
      compactionStatus: compactionResult.status,
      agentStatus: runResult.results[0]?.worker.status,
      activeEpochId: activeEpoch.id,
      replacementCount: replacements.length,
      replayIncludedCompaction: replayText.includes("[compacted 1840 chars]"),
      rawMessageCount: messages.length
    }
  }
})

class ReplayRecordingProvider implements ProviderAdapter {
  readonly kind = "fake" as const
  readonly providerId = "eval-replay-provider"
  readonly modelId = "eval-replay-model"
  readonly capabilities = { input: ["text"], output: ["text"] } as const
  lastMessages: readonly ProviderReplayMessage[] = []

  async *stream(request: ProviderRequest): AsyncIterable<ProviderEvent> {
    this.lastMessages = request.messages
    yield {
      type: "text_delta",
      partId: "assistant_eval_memory_replay_new",
      delta: "replay ok"
    }
    yield { type: "finish", reason: "stop" }
  }

  buildReplayMessages(messages: readonly ProviderReplayMessage[]): JsonValue[] {
    return messages.map((message) => ({
      role: message.role,
      content: message.content as unknown as JsonValue
    }))
  }
}
