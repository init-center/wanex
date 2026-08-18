import type { WanexAppCommandContext } from "./command-context.js"
import type { WanexAppConversationOperationCommands } from "./types-conversation-operation.js"

export function createWanexAppConversationOperationCommands(
  context: WanexAppCommandContext
): WanexAppConversationOperationCommands {
  return {
    async submitConversationOperation(request) {
      context.assertActive()
      const modelEndpointId = await context.refreshActiveModelEndpointId()
      return await context.conversationOperations.submit({
        request,
        modelEndpointId
      })
    },
    async readConversationOperation(request) {
      context.assertActive()
      return await context.conversationOperations.read(request)
    },
    async cancelConversationOperation(request) {
      context.assertActive()
      return await context.conversationOperations.cancel(request)
    },
    async interruptConversationOperation(request) {
      context.assertActive()
      return await context.conversationOperations.interrupt(request)
    },
    async steerConversationOperation(request) {
      context.assertActive()
      return await context.conversationOperations.steer(request)
    },
    async resolveConversationOperationRecovery(request) {
      context.assertActive()
      return await context.conversationOperations.resolveRecovery(request)
    },
    async listConversationOperationApprovals(request) {
      context.assertActive()
      return await context.conversationOperations.listApprovals(request)
    },
    async readConversationOperationApproval(request) {
      context.assertActive()
      return await context.conversationOperations.readApproval(request)
    },
    async resolveConversationOperationApproval(request) {
      context.assertActive()
      return await context.conversationOperations.resolveApproval(request)
    }
  }
}
