import {
  assertBackendPortNoInput
} from "../input/core.js"
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

export async function dispatchBackendLifecyclePortCommand(
  app: BackendApp,
  request: BackendCommandPortRequest
): Promise<BackendCommandPortEnvelope> {
  const command = request.command
  switch (command) {
    case "shutdown":
      return await runBackendCommandPortSafe({
        command,
        async run() {
          assertBackendPortNoInput(command, request.input)
          return await app.commands.shutdown()
        }
      })
  }
  return unreachableBackendPortCommand(command)
}
