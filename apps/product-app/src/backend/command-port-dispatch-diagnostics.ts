import {
  parseProductAppBackendPortDiagnosticsOptions,
  parseProductAppBackendPortSupportBundleOptions
} from "./command-port-input-diagnostics.js"
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

export async function dispatchProductAppBackendDiagnosticsPortCommand(
  app: ProductAppBackendApp,
  request: ProductAppBackendCommandPortRequest
): Promise<ProductAppBackendCommandPortEnvelope> {
  const command = request.command
  switch (command) {
    case "readDiagnostics":
      return await runProductAppBackendCommandPortSafe({
        command,
        async run() {
          return await app.commands.readDiagnostics(
            parseProductAppBackendPortDiagnosticsOptions(request.input)
          )
        }
      })
    case "buildSupportBundle":
      return await runProductAppBackendCommandPortSafe({
        command,
        async run() {
          return await app.commands.buildSupportBundle(
            parseProductAppBackendPortSupportBundleOptions(request.input)
          )
        }
      })
  }
  return unreachableProductAppBackendPortCommand(command)
}
