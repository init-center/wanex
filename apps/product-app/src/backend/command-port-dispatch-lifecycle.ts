import {
  assertProductAppBackendPortNoInput
} from "./command-port-input-core.js"
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

export async function dispatchProductAppBackendLifecyclePortCommand(
  app: ProductAppBackendApp,
  request: ProductAppBackendCommandPortRequest
): Promise<ProductAppBackendCommandPortEnvelope> {
  const command = request.command
  switch (command) {
    case "shutdown":
      return await runProductAppBackendCommandPortSafe({
        command,
        async run() {
          assertProductAppBackendPortNoInput(command, request.input)
          return await app.commands.shutdown()
        }
      })
  }
  return unreachableProductAppBackendPortCommand(command)
}
