import type { WanexAppCommandContext } from "./command-context.js"
import type { WanexAppConversationOperationCommands } from "./types-conversation-operation.js"

export function createWanexAppConversationOperationCommands(
  context: WanexAppCommandContext
): WanexAppConversationOperationCommands {
  return {
    async submitConversationOperation(request) {
      context.assertActive()
      const providerProfileId = await context.refreshActiveProviderProfileId()
      return await context.conversationOperations.submit({
        request,
        providerProfileId
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
    }
  }
}
