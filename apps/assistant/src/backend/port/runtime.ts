import {
  BACKEND_COMMAND_PORT_COMMANDS,
  type BackendCommandPort,
  type BackendCommandPortCommand,
  type BackendCommandPortEnvelope
} from "./contract.js"
import {
  parseBackendPortRequest
} from "./input/command.js"
import {
  messageFrom,
  portError
} from "./envelope.js"
import {
  dispatchBackendConversationPortCommand
} from "./dispatch/conversation.js"
import {
  dispatchBackendContextPortCommand
} from "./dispatch/context.js"
import {
  dispatchBackendDiagnosticsPortCommand
} from "./dispatch/diagnostics.js"
import {
  dispatchBackendLifecyclePortCommand
} from "./dispatch/lifecycle.js"
import {
  dispatchBackendReadModelPortCommand
} from "./dispatch/read-model.js"
import {
  dispatchBackendRoutingPortCommand
} from "./dispatch/routing.js"
import type {
  BackendApp,
  BackendCommandPortRequest
} from "../model/index.js"

export {
  BACKEND_COMMAND_PORT_COMMANDS
} from "./contract.js"
export type {
  BackendCommandPort,
  BackendCommandPortCommand,
  BackendCommandPortEnvelope
} from "./contract.js"

const knownPortCommands = new Set<string>(
  Object.values(BACKEND_COMMAND_PORT_COMMANDS)
)

export function createBackendCommandPort(
  app: BackendApp
): BackendCommandPort {
  return {
    async dispatch(request) {
      return await dispatchBackendCommandPortRequest(app, request)
    }
  }
}

export async function dispatchBackendCommandPortRequest(
  app: BackendApp,
  request: unknown
): Promise<BackendCommandPortEnvelope> {
  const parsed = parsePortRequest(request)
  if (!parsed.ok) {
    return parsed.error
  }
  return await dispatchParsedBackendCommandPortRequest(app, parsed.request)
}

async function dispatchParsedBackendCommandPortRequest(
  app: BackendApp,
  request: BackendCommandPortRequest
): Promise<BackendCommandPortEnvelope> {
  const command = request.command
  if (!knownPortCommands.has(command)) {
    return portError({
      command: command.length === 0 ? "unknown" : command,
      code: "unknown_command",
      category: "validation",
      message: `unknown backend port command: ${command}`
    })
  }

  switch (command as BackendCommandPortCommand) {
    case "status":
    case "readAssistantOverview":
    case "readAssistantDiagnosticsDetail":
    case "readRecentSessions":
    case "readAssistantWorkbench":
    case "readAssistantCapabilities":
    case "readAssistantCommands":
    case "explainAssistantCommandContribution":
    case "previewAssistantCommandInvocation":
    case "executeAssistantCommand":
    case "readSessionInputProvenance":
    case "readSessionTranscript":
      return await dispatchBackendReadModelPortCommand(app, request)
    case "routeInput":
    case "routeWorkflowEnvelope":
      return await dispatchBackendRoutingPortCommand(app, request)
    case "submitConversationOperation":
    case "readConversationOperation":
    case "cancelConversationOperation":
      return await dispatchBackendConversationPortCommand(app, request)
    case "readDiagnostics":
    case "buildSupportBundle":
      return await dispatchBackendDiagnosticsPortCommand(app, request)
    case "refreshAgentContextProfile":
    case "startAgentContextMonitor":
    case "stopAgentContextMonitor":
      return await dispatchBackendContextPortCommand(app, request)
    case "shutdown":
      return await dispatchBackendLifecyclePortCommand(app, request)
  }
}

function parsePortRequest(input: unknown):
  | {
      readonly ok: true
      readonly request: BackendCommandPortRequest
    }
  | {
      readonly ok: false
      readonly error: BackendCommandPortEnvelope
    } {
  try {
    return {
      ok: true,
      request: parseBackendPortRequest(input)
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
