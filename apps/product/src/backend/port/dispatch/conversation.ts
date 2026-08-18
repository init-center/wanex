import {
  parseBackendPortCancelConversationOperationInput,
  parseBackendPortReadConversationOperationInput,
  parseBackendPortSubmitConversationOperationInput
} from "../input/conversation.js"
import {
  runBackendCommandPortSafe,
  unreachableBackendPortCommand
} from "../envelope.js"
import type {
  BackendCommandPortEnvelope
} from "../contract.js"
import type {
  BackendApp,
  BackendCommandPortRequest
} from "../../model/index.js"

export async function dispatchBackendConversationPortCommand(
  app: BackendApp,
  request: BackendCommandPortRequest
): Promise<BackendCommandPortEnvelope> {
  const command = request.command
  switch (command) {
    case "submitConversationOperation":
      return await runBackendCommandPortSafe({
        command,
        async run() {
          return await app.commands.submitConversationOperation(
            parseBackendPortSubmitConversationOperationInput(request.input)
          )
        }
      })
    case "readConversationOperation":
      return await runBackendCommandPortSafe({
        command,
        async run() {
          return await app.commands.readConversationOperation(
            parseBackendPortReadConversationOperationInput(request.input)
          )
        }
      })
    case "cancelConversationOperation":
      return await runBackendCommandPortSafe({
        command,
        async run() {
          return await app.commands.cancelConversationOperation(
            parseBackendPortCancelConversationOperationInput(request.input)
          )
        }
      })
  }
  return unreachableBackendPortCommand(command)
}
