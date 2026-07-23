import {
  parseProductAppBackendPortCancelConversationOperationInput,
  parseProductAppBackendPortReadConversationOperationInput,
  parseProductAppBackendPortSubmitConversationOperationInput
} from "./command-port-input-conversation.js"
import {
  runProductAppBackendCommandPortSafe,
  unreachableProductAppBackendPortCommand
} from "./command-port-envelope.js"
import type {
  ProductAppBackendCommandPortEnvelope
} from "./command-port-contract.js"
import type {
  ProductAppBackendApp,
  ProductAppBackendCommandPortRequest
} from "./types.js"

export async function dispatchProductAppBackendConversationPortCommand(
  app: ProductAppBackendApp,
  request: ProductAppBackendCommandPortRequest
): Promise<ProductAppBackendCommandPortEnvelope> {
  const command = request.command
  switch (command) {
    case "submitConversationOperation":
      return await runProductAppBackendCommandPortSafe({
        command,
        async run() {
          return await app.commands.submitConversationOperation(
            parseProductAppBackendPortSubmitConversationOperationInput(request.input)
          )
        }
      })
    case "readConversationOperation":
      return await runProductAppBackendCommandPortSafe({
        command,
        async run() {
          return await app.commands.readConversationOperation(
            parseProductAppBackendPortReadConversationOperationInput(request.input)
          )
        }
      })
    case "cancelConversationOperation":
      return await runProductAppBackendCommandPortSafe({
        command,
        async run() {
          return await app.commands.cancelConversationOperation(
            parseProductAppBackendPortCancelConversationOperationInput(request.input)
          )
        }
      })
  }
  return unreachableProductAppBackendPortCommand(command)
}
