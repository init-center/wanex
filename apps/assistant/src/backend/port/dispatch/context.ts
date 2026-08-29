import {
  assertBackendPortNoInput
} from "../input/core.js"
import {
  parseBackendPortMonitorOptions
} from "../input/context.js"
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

export async function dispatchBackendContextPortCommand(
  app: BackendApp,
  request: BackendCommandPortRequest
): Promise<BackendCommandPortEnvelope> {
  const command = request.command
  switch (command) {
    case "refreshAgentContextProfile":
      return await runBackendCommandPortSafe({
        command,
        async run() {
          assertBackendPortNoInput(command, request.input)
          return await app.commands.refreshAgentContextProfile()
        }
      })
    case "startAgentContextMonitor":
      return await runBackendCommandPortSafe({
        command,
        async run() {
          return await app.commands.startAgentContextMonitor(
            parseBackendPortMonitorOptions(request.input)
          )
        }
      })
    case "stopAgentContextMonitor":
      return await runBackendCommandPortSafe({
        command,
        async run() {
          assertBackendPortNoInput(command, request.input)
          return await app.commands.stopAgentContextMonitor()
        }
      })
  }
  return unreachableBackendPortCommand(command)
}
