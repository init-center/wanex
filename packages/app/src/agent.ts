import type { CoreStore } from "@wanex/storage"
import type { WanexAppConversationOperationController } from "./conversation-operation.js"
import type {
  WanexAppRunAgentTurnRequest,
  WanexAppRunAgentTurnResult
} from "./types-agent.js"

export async function runWanexAppAgentTurn(
  conversationOperations: WanexAppConversationOperationController,
  options: {
    readonly request: WanexAppRunAgentTurnRequest
    readonly modelEndpointId: string
    readonly storage: Pick<CoreStore, "getSessionTurn">
  }
): Promise<WanexAppRunAgentTurnResult> {
  if (!conversationOperations.isStarted()) {
    throw new Error("conversation operation processor is stopped")
  }
  const receipt = await conversationOperations.submit({
    request: options.request,
    modelEndpointId: options.modelEndpointId
  })
  const completed = await conversationOperations.waitForTerminal(receipt)
  if (completed.operation.state !== "succeeded") {
    throw new Error("agent turn failed; see app diagnostics for details")
  }
  const messageCount = await conversationOperations.countSessionMessages(
    completed.operation.sessionId
  )
  const turn = await options.storage.getSessionTurn(receipt.turnId)
  if (
    turn === null ||
    turn.sessionId !== receipt.sessionId ||
    turn.primaryInputId !== receipt.inputId ||
    turn.jobId !== receipt.jobId
  ) {
    throw new Error("completed agent turn binding was not found")
  }
  const contextEvidence = turn.executionBinding.contextEvidence
  return {
    sessionId: completed.operation.sessionId,
    assistantText: completed.operation.result?.assistantText ?? "",
    messageCount,
    jobStatuses: [completed.operation.state],
    ...(contextEvidence === undefined ? {} : { contextEvidence })
  }
}
