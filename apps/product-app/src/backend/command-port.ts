import {
  PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS,
  type ProductAppBackendCommandPort,
  type ProductAppBackendCommandPortCommand,
  type ProductAppBackendCommandPortEnvelope
} from "./command-port-contract.js"
import {
  parseProductAppBackendPortRequest
} from "./command-port-input-command.js"
import {
  messageFrom,
  portError
} from "./command-port-envelope.js"
import {
  dispatchProductAppBackendAgentPortCommand
} from "./command-port-dispatch-agent.js"
import {
  dispatchProductAppBackendContextPortCommand
} from "./command-port-dispatch-context.js"
import {
  dispatchProductAppBackendDiagnosticsPortCommand
} from "./command-port-dispatch-diagnostics.js"
import {
  dispatchProductAppBackendLifecyclePortCommand
} from "./command-port-dispatch-lifecycle.js"
import {
  dispatchProductAppBackendReadModelPortCommand
} from "./command-port-dispatch-read-model.js"
import {
  dispatchProductAppBackendRoutingPortCommand
} from "./command-port-dispatch-routing.js"
import type {
  ProductAppBackendApp,
  ProductAppBackendCommandPortRequest
} from "./types.js"

export {
  PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS
} from "./command-port-contract.js"
export type {
  ProductAppBackendCommandPort,
  ProductAppBackendCommandPortCommand,
  ProductAppBackendCommandPortEnvelope
} from "./command-port-contract.js"

const knownPortCommands = new Set<string>(
  Object.values(PRODUCT_APP_BACKEND_COMMAND_PORT_COMMANDS)
)

export function createProductAppBackendCommandPort(
  app: ProductAppBackendApp
): ProductAppBackendCommandPort {
  return {
    async dispatch(request) {
      return await dispatchProductAppBackendCommandPortRequest(app, request)
    }
  }
}

export async function dispatchProductAppBackendCommandPortRequest(
  app: ProductAppBackendApp,
  request: unknown
): Promise<ProductAppBackendCommandPortEnvelope> {
  const parsed = parsePortRequest(request)
  if (!parsed.ok) {
    return parsed.error
  }
  return await dispatchParsedProductAppBackendCommandPortRequest(app, parsed.request)
}

async function dispatchParsedProductAppBackendCommandPortRequest(
  app: ProductAppBackendApp,
  request: ProductAppBackendCommandPortRequest
): Promise<ProductAppBackendCommandPortEnvelope> {
  const command = request.command
  if (!knownPortCommands.has(command)) {
    return portError({
      command: command.length === 0 ? "unknown" : command,
      code: "unknown_command",
      category: "validation",
      message: `unknown product app backend port command: ${command}`
    })
  }

  switch (command as ProductAppBackendCommandPortCommand) {
    case "status":
    case "readProductOverview":
    case "readProductDiagnosticsDetail":
    case "readRecentSessions":
    case "readProductWorkbench":
    case "readProductCapabilities":
    case "readProductCommands":
    case "explainProductCommandContribution":
    case "previewProductCommandInvocation":
    case "executeProductCommand":
    case "readSessionInputProvenance":
    case "readSessionTranscript":
      return await dispatchProductAppBackendReadModelPortCommand(app, request)
    case "routeInput":
    case "routeWorkflowEnvelope":
      return await dispatchProductAppBackendRoutingPortCommand(app, request)
    case "runAgentTurn":
    case "continueProductWorkbenchSession":
      return await dispatchProductAppBackendAgentPortCommand(app, request)
    case "readDiagnostics":
    case "buildSupportBundle":
      return await dispatchProductAppBackendDiagnosticsPortCommand(app, request)
    case "refreshAgentContextProfile":
    case "startAgentContextMonitor":
    case "stopAgentContextMonitor":
      return await dispatchProductAppBackendContextPortCommand(app, request)
    case "shutdown":
      return await dispatchProductAppBackendLifecyclePortCommand(app, request)
  }
}

function parsePortRequest(input: unknown):
  | {
      readonly ok: true
      readonly request: ProductAppBackendCommandPortRequest
    }
  | {
      readonly ok: false
      readonly error: ProductAppBackendCommandPortEnvelope
    } {
  try {
    return {
      ok: true,
      request: parseProductAppBackendPortRequest(input)
    }
  } catch (error) {
    return {
      ok: false,
      error: portError({
        command: "unknown",
        code: "validation_error",
        category: "validation",
        message: messageFrom(error)
      })
    }
  }
}
