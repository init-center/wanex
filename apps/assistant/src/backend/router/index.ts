import type {
  BackendRouteInputRequest,
  BackendRouteInputResult,
  BackendWorkflowEnvelope
} from "../model/index.js"
import { routeBackendCommandText } from "./command.js"
import type { BackendInputRouterHost } from "./host.js"
import { routeBackendWorkflowEnvelope as routeBackendWorkflowEnvelopeForHost } from "./workflow.js"
export type {
  BackendInputRouterApp,
  BackendInputRouterHost
} from "./host.js"

export async function routeBackendInput(
  host: BackendInputRouterHost,
  request: BackendRouteInputRequest | BackendWorkflowEnvelope
): Promise<BackendRouteInputResult> {
  if ("kind" in request) {
    return await routeBackendWorkflowEnvelope(host, request)
  }

  const text = request.text.trim()
  if (text.length === 0) {
    return {
      kind: "error",
      command: "routeInput",
      code: "empty_input",
      message: "input must not be empty"
    }
  }

  if (!text.startsWith("/")) {
    return {
      kind: "agent",
      command: "submitConversationOperation",
      result: await host.commands.submitConversationOperation({
        content: [{ type: "text", text: request.text }],
        ...(request.sessionId === undefined
          ? {}
          : { sessionId: request.sessionId })
      })
    }
  }

  return await routeBackendCommandText(host, text)
}

export async function routeBackendWorkflowEnvelope(
  host: BackendInputRouterHost,
  request: BackendWorkflowEnvelope
): Promise<BackendRouteInputResult> {
  return await routeBackendWorkflowEnvelopeForHost(
    host,
    request
  )
}
