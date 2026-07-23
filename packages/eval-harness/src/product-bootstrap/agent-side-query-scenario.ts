import { WanexAgentRuntime } from "@wanex/runtime/host"
import { bootstrapWanexStorage } from "@wanex/runtime/bootstrap"
import { createEvalScenario } from "../runner.js"
import { assert } from "../scenario-utils.js"
import {
  expectNumber,
  expectRecord,
  mktemp,
  textFromParts
} from "./helpers.js"
import { rm } from "node:fs/promises"

export const agentSideQueryContractScenario = createEvalScenario({
  id: "agent.side-query-contract",
  title: "Ephemeral side query reads context without durable writes",
  tags: ["agent", "side-query", "product-path"],
  async run(context) {
    const storeDir = await mktemp("wanex-eval-agent-side-query-")
    const runtime = await bootstrapWanexStorage({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: {
        explicitPath: context.serviceBin
      }
    })
    try {
      const agent = new WanexAgentRuntime({
        storage: runtime.storage,
        fakeResponseText: "eval side query response"
      })
      await agent.submitAndRunUserTurn({
        content: [{ type: "text", text: "durable side-query context" }],
        sessionId: "ses_eval_agent_side_query",
        principalId: "eval-agent-side-query-user"
      })
      const [inputsBefore, messagesBefore, jobsBefore] = await Promise.all([
        runtime.storage.listSessionInputs({
          sessionId: "ses_eval_agent_side_query"
        }),
        runtime.storage.listSessionMessages({
          sessionId: "ses_eval_agent_side_query"
        }),
        runtime.storage.listJobs({ kind: "session.turn", limit: 20 })
      ])
      const result = await agent.runEphemeralQuery({
        sessionId: "ses_eval_agent_side_query",
        question: [{ type: "text", id: "part_side", text: "eval side question" }]
      })
      await agent.stop()
      const [inputsAfter, messagesAfter, jobsAfter] = await Promise.all([
        runtime.storage.listSessionInputs({
          sessionId: "ses_eval_agent_side_query"
        }),
        runtime.storage.listSessionMessages({
          sessionId: "ses_eval_agent_side_query"
        }),
        runtime.storage.listJobs({ kind: "session.turn", limit: 20 })
      ])

      assert(
        textFromParts(result.output) === "eval side query response",
        "side query should return transient provider output"
      )
      assert(
        JSON.stringify(inputsAfter) === JSON.stringify(inputsBefore),
        "side query should not persist session inputs"
      )
      assert(
        JSON.stringify(messagesAfter) === JSON.stringify(messagesBefore),
        "side query should not persist session messages"
      )
      assert(
        JSON.stringify(jobsAfter.map((job) => job.id)) ===
          JSON.stringify(jobsBefore.map((job) => job.id)),
        "side query should not enqueue jobs"
      )
      return {
        sessionId: "ses_eval_agent_side_query",
        outputText: textFromParts(result.output),
        inputCount: inputsAfter.length,
        messageCount: messagesAfter.length,
        jobCount: jobsAfter.length,
        replayMessageCount: expectNumber(
          expectRecord(result.telemetry).replayMessageCount
        )
      }
    } finally {
      await runtime.dispose()
      await rm(storeDir, { recursive: true, force: true })
    }
  }
})
