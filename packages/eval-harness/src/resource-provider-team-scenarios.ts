import {
  DeepSeekThinkingAdapter,
  MissingRequiredProviderStateError,
  consumeProviderStream,
  type ProviderFetch
} from "@wanex/runtime/provider"
import { TeamConversationRuntime } from "@wanex/team/conversation"
import { createEvalScenario } from "./runner.js"
import {
  assert,
  isRecord
} from "./scenario-utils.js"

export const resourceTicketExpiryCleanupScenario = createEvalScenario({
  id: "resource.ticket-expiry-cleanup",
  title: "Expired resource tickets are revoked through durable storage",
  tags: ["resource", "storage", "security"],
  async run(context) {
    const file = await context.storage.writeAtomicFile({
      logicalPath: "eval/resource-ticket.txt",
      content: new TextEncoder().encode("ticket cleanup")
    })
    const expired = await context.storage.createResourceTicket({
      principalId: "principal_eval_resource",
      resourceId: file.resourceId,
      capability: "read",
      expiresAt: 10
    })
    await context.storage.createResourceTicket({
      principalId: "principal_eval_resource",
      resourceId: file.resourceId,
      capability: "read",
      expiresAt: 1_000
    })

    const receipt = await context.storage.cleanupExpiredResourceTickets({
      nowMs: 20,
      limit: 10
    })

    assert(receipt.revokedCount === 1, "only expired ticket should be revoked")
    assert(
      receipt.revokedTicketIds[0] === expired.id,
      "cleanup should revoke the expired ticket"
    )
    return {
      revokedCount: receipt.revokedCount,
      revokedTicketIds: receipt.revokedTicketIds
    }
  }
})

export const providerDeepSeekThinkingFidelityScenario = createEvalScenario({
  id: "provider.deepseek-thinking-fidelity",
  title: "DeepSeek thinking state is preserved and missing state fails closed",
  tags: ["provider", "llm", "fidelity"],
  async run() {
    const adapter = new DeepSeekThinkingAdapter({
      modelId: "deepseek-v4",
      baseUrl: "https://api.deepseek.example/v1",
      apiKey: "secret",
      fetch: deepSeekFixtureFetch()
    })
    const normalized = await consumeProviderStream({
      provider: adapter,
      request: { messages: [] }
    })
    const replay = adapter.buildReplayMessages([
      {
        role: "assistant",
        content: normalized.parts
      }
    ])
    const replayMessage = replay[0]
    assert(isRecord(replayMessage), "DeepSeek replay message should be a record")
    assert(
      replayMessage.reasoning_content === "private chain state",
      "DeepSeek reasoning_content should be replayed"
    )

    let failedClosed = false
    try {
      adapter.buildReplayMessages([
        {
          role: "assistant",
          content: [
            {
              type: "tool_call",
              id: "part_call",
              toolCallId: "call_1",
              toolName: "lookup",
              input: {}
            }
          ]
        }
      ])
    } catch (error) {
      failedClosed = error instanceof MissingRequiredProviderStateError
    }
    assert(failedClosed, "missing required reasoning state should fail closed")
    return {
      replayedReasoning: replayMessage.reasoning_content,
      failedClosed
    }
  }
})

function deepSeekFixtureFetch(): ProviderFetch {
  return async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    body: (async function* () {
      yield 'data: {"choices":[{"delta":{"content":"I will call a tool.","reasoning_content":"private chain state","tool_calls":[{"index":0,"id":"call_1","function":{"name":"lookup","arguments":"{\\"q\\":\\"wanex\\"}"}}]},"finish_reason":"tool_calls"}]}\n\n'
      yield "data: [DONE]\n\n"
    })(),
    async text() {
      return ""
    }
  })
}

export const teamRoundBoundScenario = createEvalScenario({
  id: "team.round-bound",
  title: "Team conversation stops at explicit max turn bound",
  tags: ["team", "multi-agent"],
  async run(context) {
    const team = new TeamConversationRuntime({
      storage: context.storage,
      principalId: "eval-team"
    })
    const conversation = await team.createConversation({
      id: "team_eval_bound",
      mode: "free",
      idempotencyKey: "team-eval-bound"
    })
    const first = await team.addParticipant({
      id: "team_eval_agent_a",
      conversationId: conversation.id,
      principalId: "agent_eval_a",
      kind: "agent",
      idempotencyKey: "team-eval-agent-a"
    })
    const second = await team.addParticipant({
      id: "team_eval_agent_b",
      conversationId: conversation.id,
      principalId: "agent_eval_b",
      kind: "agent",
      idempotencyKey: "team-eval-agent-b"
    })
    const result = await team.orchestrateRound({
      conversationId: conversation.id,
      policy: {
        maxTurns: 3,
        mode: "free"
      },
      speakers: {
        [first.id]: ({ turnIndex }) => ({
          content: [
            {
              type: "text",
              id: `team_eval_a_${turnIndex}`,
              text: `a ${turnIndex}`
            }
          ]
        }),
        [second.id]: ({ turnIndex }) => ({
          content: [
            {
              type: "text",
              id: `team_eval_b_${turnIndex}`,
              text: `b ${turnIndex}`
            }
          ]
        })
      }
    })
    assert(result.stopReason === "max_turns", "team round should stop by maxTurns")
    assert(result.turns.length === 3, "team round should emit exactly 3 turns")
    return {
      stopReason: result.stopReason,
      turns: result.turns.length
    }
  }
})
