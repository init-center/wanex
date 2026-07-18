import type {
  ProductAppBackendRouteInputRequest,
  ProductAppBackendRouteInputResult,
  ProductAppBackendWorkflowEnvelope
} from "./types.js"
import { routeProductAppBackendCommandText } from "./input-router-command.js"
import type { ProductAppBackendInputRouterHost } from "./input-router-host.js"
import { routeProductAppBackendWorkflowEnvelope as routeProductAppBackendWorkflowEnvelopeForHost } from "./input-router-workflow-envelope.js"
export type {
  ProductAppBackendInputRouterApp,
  ProductAppBackendInputRouterHost
} from "./input-router-host.js"

export async function routeProductAppBackendInput(
  host: ProductAppBackendInputRouterHost,
  request: ProductAppBackendRouteInputRequest | ProductAppBackendWorkflowEnvelope
): Promise<ProductAppBackendRouteInputResult> {
  if ("kind" in request) {
    return await routeProductAppBackendWorkflowEnvelope(host, request)
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
      command: "runAgentTurn",
      result: await host.commands.runAgentTurn({
        text: request.text,
        ...(request.sessionId === undefined
          ? {}
          : { sessionId: request.sessionId })
      })
    }
  }

  return await routeProductAppBackendCommandText(host, text)
}

export async function routeProductAppBackendWorkflowEnvelope(
  host: ProductAppBackendInputRouterHost,
  request: ProductAppBackendWorkflowEnvelope
): Promise<ProductAppBackendRouteInputResult> {
  return await routeProductAppBackendWorkflowEnvelopeForHost(
    host,
    request
  )
}
