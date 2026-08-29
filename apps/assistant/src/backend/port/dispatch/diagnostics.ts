import {
  parseBackendPortDiagnosticsOptions,
  parseBackendPortSupportBundleOptions
} from "../input/diagnostics.js"
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

export async function dispatchBackendDiagnosticsPortCommand(
  app: BackendApp,
  request: BackendCommandPortRequest
): Promise<BackendCommandPortEnvelope> {
  const command = request.command
  switch (command) {
    case "readDiagnostics":
      return await runBackendCommandPortSafe({
        command,
        async run() {
          return await app.commands.readDiagnostics(
            parseBackendPortDiagnosticsOptions(request.input)
          )
        }
      })
    case "buildSupportBundle":
      return await runBackendCommandPortSafe({
        command,
        async run() {
          return await app.commands.buildSupportBundle(
            parseBackendPortSupportBundleOptions(request.input)
          )
        }
      })
  }
  return unreachableBackendPortCommand(command)
}
