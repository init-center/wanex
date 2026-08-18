import {
  MissingRequiredProviderStateError,
  OpenAICompatibleAdapter,
  consumeProviderStream,
  type ProviderFetch
} from "@wanex/runtime/provider"
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
    const adapter = new OpenAICompatibleAdapter({
      providerId: "deepseek",
      model: {
        id: "deepseek-v4",
        operations: ["conversation"],
        inputModalities: ["text"],
        outputModalities: ["text"],
        features: ["tool_calling", "reasoning"],
        behavior: { reasoningReplay: "required" },
        catalog: {
          source: "builtin",
          catalogId: "deepseek.chat-completions",
          revision: "2026-07-28"
        }
      },
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
