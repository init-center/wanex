import { routeBackendCommandText } from "./command.js"
import type { BackendInputRouterHost } from "./host.js"
import type {
  BackendRouteInputResult,
  BackendWorkflowEnvelope
} from "../model/index.js"

export async function routeBackendWorkflowEnvelope(
  host: BackendInputRouterHost,
  request: BackendWorkflowEnvelope
): Promise<BackendRouteInputResult> {
  const text = request.text.trim()
  if (text.length === 0) {
    return {
      kind: "error",
      command: "routeWorkflowEnvelope",
      code: "empty_input",
      message: "workflow envelope text must not be empty"
    }
  }

  if (request.kind === "command") {
    if (!text.startsWith("/")) {
      return {
        kind: "error",
        command: "routeWorkflowEnvelope",
        code: "invalid_arguments",
        message: "command workflow envelope text must start with /"
      }
    }
    return await routeBackendCommandText(host, text)
  }

  if (request.kind === "interactive" && text.startsWith("/")) {
    return await routeBackendCommandText(host, text)
  }

  return await host.commands.routeAppWorkflowEnvelope(request)
}
