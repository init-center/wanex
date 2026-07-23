import type { PreparedAgentContext } from "@wanex/runtime/context"
import type { WanexAppConversationOperationController } from "./conversation-operation.js"
import type {
  WanexAppRunAgentTurnRequest,
  WanexAppRunAgentTurnResult
} from "./types-agent.js"
import type { WanexAppAgentContextSummary } from "./types-context.js"

export async function runWanexAppAgentTurn(
  conversationOperations: WanexAppConversationOperationController,
  options: {
    readonly request: WanexAppRunAgentTurnRequest
    readonly providerProfileId: string
    readonly preparedAgentContext?: PreparedAgentContext
  }
): Promise<WanexAppRunAgentTurnResult> {
  if (!conversationOperations.isStarted()) {
    throw new Error("conversation operation processor is stopped")
  }
  const receipt = await conversationOperations.submit({
    request: options.request,
    providerProfileId: options.providerProfileId
  })
  const completed = await conversationOperations.waitForTerminal(receipt)
  if (completed.operation.state !== "succeeded") {
    throw new Error("agent turn failed; see app diagnostics for details")
  }
  const messageCount = await conversationOperations.countSessionMessages(
    completed.operation.sessionId
  )
  return {
    sessionId: completed.operation.sessionId,
    assistantText: completed.operation.result?.assistantText ?? "",
    messageCount,
    jobStatuses: [completed.operation.state],
    ...(options.preparedAgentContext === undefined
      ? {}
      : { context: agentContextSummary(options.preparedAgentContext) })
  }
}

function agentContextSummary(
  prepared: PreparedAgentContext
): WanexAppAgentContextSummary {
  return {
    instructionSources: prepared.instructionSnapshot?.sources.length ?? 0,
    skillNames:
      prepared.skillSnapshot?.sources.map((source) => source.name) ?? [],
    diagnostics: [
      ...(prepared.instructionSnapshot?.diagnostics.map(
        (diagnostic) => diagnostic.code
      ) ?? []),
      ...(prepared.skillSnapshot?.diagnostics.map(
        (diagnostic) => diagnostic.code
      ) ?? [])
    ],
    activationToolRegistered: prepared.tools !== undefined
  }
}
