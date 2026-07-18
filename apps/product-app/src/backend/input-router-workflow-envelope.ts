import { routeProductAppBackendCommandText } from "./input-router-command.js"
import type { ProductAppBackendInputRouterHost } from "./input-router-host.js"
import type {
  ProductAppBackendAppShellWorkflowEnvelope,
  ProductAppBackendRouteInputResult,
  ProductAppBackendWorkflowEnvelope
} from "./types.js"

export async function routeProductAppBackendWorkflowEnvelope(
  host: ProductAppBackendInputRouterHost,
  request: ProductAppBackendWorkflowEnvelope
): Promise<ProductAppBackendRouteInputResult> {
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
    return await routeProductAppBackendCommandText(host, text)
  }

  if (request.kind === "interactive" && text.startsWith("/")) {
    return await routeProductAppBackendCommandText(host, text)
  }

  const routed = await host.commands.routeAppShellWorkflowEnvelope(
    toAppShellWorkflowEnvelope(request)
  )
  if (routed.kind === "error") {
    return {
      kind: "error",
      command: "routeWorkflowEnvelope",
      code: routed.code,
      message: routed.message
    }
  }
  return routed
}

function toAppShellWorkflowEnvelope(
  request: Exclude<ProductAppBackendWorkflowEnvelope, { readonly kind: "command" }>
): ProductAppBackendAppShellWorkflowEnvelope {
  switch (request.kind) {
    case "interactive":
      return {
        kind: "interactive",
        text: request.text,
        ...(request.sessionId === undefined
          ? {}
          : { sessionId: request.sessionId }),
        ...(request.sourceRef === undefined
          ? {}
          : { sourceRef: request.sourceRef }),
        ...(request.gesture === undefined ? {} : { gesture: request.gesture }),
        ...(request.classifier === undefined
          ? {}
          : { classifier: request.classifier })
      }
    case "scheduled":
      return {
        kind: "scheduled",
        text: request.text,
        scheduleId: request.scheduleId,
        tickId: request.tickId,
        ...(request.sessionId === undefined
          ? {}
          : { sessionId: request.sessionId }),
        ...(request.nonOverlap === undefined
          ? {}
          : { nonOverlap: request.nonOverlap }),
        ...(request.classifier === undefined
          ? {}
          : { classifier: request.classifier })
      }
    case "channel":
      return {
        kind: "channel",
        text: request.text,
        connectorId: request.connectorId,
        eventId: request.eventId,
        ...(request.sessionId === undefined
          ? {}
          : { sessionId: request.sessionId }),
        ...(request.threadRef === undefined ? {} : { threadRef: request.threadRef }),
        ...(request.classifier === undefined
          ? {}
          : { classifier: request.classifier })
      }
    case "guided_follow_up":
      return {
        kind: "guided_follow_up",
        text: request.text,
        activeRunId: request.activeRunId,
        ...(request.sessionId === undefined
          ? {}
          : { sessionId: request.sessionId }),
        ...(request.sourceRef === undefined
          ? {}
          : { sourceRef: request.sourceRef }),
        ...(request.classifier === undefined
          ? {}
          : { classifier: request.classifier })
      }
    case "side_query":
      return {
        kind: "side_query",
        text: request.text,
        ...(request.sessionId === undefined
          ? {}
          : { sessionId: request.sessionId }),
        ...(request.sourceRef === undefined
          ? {}
          : { sourceRef: request.sourceRef }),
        ...(request.maxOutputTokens === undefined
          ? {}
          : { maxOutputTokens: request.maxOutputTokens }),
        ...(request.classifier === undefined
          ? {}
          : { classifier: request.classifier })
      }
  }
}
