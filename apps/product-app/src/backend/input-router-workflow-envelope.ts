import { routeProductAppBackendCommandText } from "./input-router-command.js"
import type { ProductAppBackendInputRouterHost } from "./input-router-host.js"
import type {
  ProductAppBackendAppWorkflowEnvelope,
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

  const validationError = validateAgentWorkflowEnvelope(request)
  if (validationError !== undefined) {
    return validationError
  }

  if (
    request.kind === "interactive" ||
    request.kind === "scheduled" ||
    request.kind === "channel"
  ) {
    return {
      kind: "agent",
      command: "submitConversationOperation",
      result: await host.commands.submitConversationOperation({
        content: [{ type: "text", text: request.text }],
        ...(request.sessionId === undefined
          ? {}
          : { sessionId: request.sessionId }),
        origin: workflowEnvelopeOrigin(request),
        intent: "normal"
      })
    }
  }

  const routed = await host.commands.routeAppWorkflowEnvelope(
    toAppWorkflowEnvelope(request)
  )
  if (routed.kind === "error") {
    return {
      kind: "error",
      command: "routeWorkflowEnvelope",
      code: routed.code,
      message: routed.message
    }
  }
  if (routed.kind === "agent") {
    throw new Error(
      "guided follow-up and side-query workflow envelopes must not route as blocking agent turns"
    )
  }
  return routed
}

function workflowEnvelopeOrigin(
  request:
    | Extract<ProductAppBackendWorkflowEnvelope, { readonly kind: "interactive" }>
    | Extract<ProductAppBackendWorkflowEnvelope, { readonly kind: "scheduled" }>
    | Extract<ProductAppBackendWorkflowEnvelope, { readonly kind: "channel" }>
) {
  switch (request.kind) {
    case "interactive":
      return {
        kind: "interactive" as const,
        ...(request.sourceRef === undefined
          ? {}
          : { sourceRef: request.sourceRef }),
        ...metadataField({
          gesture: request.gesture,
          ...classifierMetadata(request.classifier)
        })
      }
    case "scheduled":
      return {
        kind: "scheduler" as const,
        sourceRef: request.scheduleId,
        ...metadataField({
          scheduleId: request.scheduleId,
          tickId: request.tickId,
          nonOverlap: request.nonOverlap,
          ...classifierMetadata(request.classifier)
        })
      }
    case "channel":
      return {
        kind: "connector" as const,
        sourceRef: request.eventId,
        ...(request.threadRef === undefined
          ? {}
          : { parentRef: request.threadRef }),
        ...metadataField({
          connectorId: request.connectorId,
          eventId: request.eventId,
          ...classifierMetadata(request.classifier)
        })
      }
  }
}

function classifierMetadata(
  classifier: ProductAppBackendWorkflowEnvelope["classifier"]
): Record<string, string | number | undefined> {
  if (classifier === undefined) {
    return {}
  }
  return {
    classifierId: classifier.classifierId,
    classifierLabel: classifier.label,
    classifierConfidence: classifier.confidence
  }
}

function validateAgentWorkflowEnvelope(
  request: ProductAppBackendWorkflowEnvelope
): Extract<ProductAppBackendRouteInputResult, { readonly kind: "error" }> | undefined {
  const classifier = request.classifier
  if (
    classifier !== undefined &&
    (classifier.classifierId.length === 0 ||
      classifier.label.length === 0 ||
      !Number.isFinite(classifier.confidence) ||
      classifier.confidence < 0 ||
      classifier.confidence > 1)
  ) {
    return invalidWorkflowEnvelope(
      "classifier hint requires classifierId, label, and confidence between 0 and 1"
    )
  }
  if (
    request.kind === "scheduled" &&
    (request.scheduleId.length === 0 || request.tickId.length === 0)
  ) {
    return invalidWorkflowEnvelope(
      "scheduled envelope requires scheduleId and tickId"
    )
  }
  if (
    request.kind === "channel" &&
    (request.connectorId.length === 0 || request.eventId.length === 0)
  ) {
    return invalidWorkflowEnvelope(
      "channel envelope requires connectorId and eventId"
    )
  }
  return undefined
}

function invalidWorkflowEnvelope(
  message: string
): Extract<ProductAppBackendRouteInputResult, { readonly kind: "error" }> {
  return {
    kind: "error",
    command: "routeWorkflowEnvelope",
    code: "invalid_arguments",
    message
  }
}

function metadataField(
  value: Record<string, string | number | boolean | undefined>
) {
  const metadata = Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string | number | boolean] =>
      entry[1] !== undefined
    )
  )
  return Object.keys(metadata).length === 0 ? {} : { metadata }
}

function toAppWorkflowEnvelope(
  request: Exclude<ProductAppBackendWorkflowEnvelope, { readonly kind: "command" }>
): ProductAppBackendAppWorkflowEnvelope {
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
        activeTurnId: request.activeTurnId,
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
