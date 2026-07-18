import {
  assertProductAppBackendPortNoInput
} from "./command-port-input-core.js"
import {
  parseProductAppBackendPortMonitorOptions
} from "./command-port-input-context.js"
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

export async function dispatchProductAppBackendContextPortCommand(
  app: ProductAppBackendApp,
  request: ProductAppBackendCommandPortRequest
): Promise<ProductAppBackendCommandPortEnvelope> {
  const command = request.command
  switch (command) {
    case "refreshAgentContextProfile":
      return await runProductAppBackendCommandPortSafe({
        command,
        async run() {
          assertProductAppBackendPortNoInput(command, request.input)
          return await app.commands.refreshAgentContextProfile()
        }
      })
    case "startAgentContextMonitor":
      return await runProductAppBackendCommandPortSafe({
        command,
        async run() {
          return await app.commands.startAgentContextMonitor(
            parseProductAppBackendPortMonitorOptions(request.input)
          )
        }
      })
    case "stopAgentContextMonitor":
      return await runProductAppBackendCommandPortSafe({
        command,
        async run() {
          assertProductAppBackendPortNoInput(command, request.input)
          return await app.commands.stopAgentContextMonitor()
        }
      })
  }
  return unreachableProductAppBackendPortCommand(command)
}
