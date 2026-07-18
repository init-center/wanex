import {
  parseProductAppBackendPortRunAgentTurnInput
} from "./command-port-input-agent.js"
import {
  parseProductAppBackendPortContinueWorkbenchInput
} from "./command-port-input-workbench.js"
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

export async function dispatchProductAppBackendAgentPortCommand(
  app: ProductAppBackendApp,
  request: ProductAppBackendCommandPortRequest
): Promise<ProductAppBackendCommandPortEnvelope> {
  const command = request.command
  switch (command) {
    case "runAgentTurn":
      return await runProductAppBackendCommandPortSafe({
        command,
        async run() {
          return await app.commands.runAgentTurn(
            parseProductAppBackendPortRunAgentTurnInput(request.input)
          )
        }
      })
    case "continueProductWorkbenchSession":
      return await runProductAppBackendCommandPortSafe({
        command,
        async run() {
          return await app.commands.continueProductWorkbenchSession(
            parseProductAppBackendPortContinueWorkbenchInput(request.input)
          )
        }
      })
  }
  return unreachableProductAppBackendPortCommand(command)
}
