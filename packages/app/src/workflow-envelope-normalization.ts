import type {
  JsonValue,
  SessionInputOrigin
} from "@wanex/protocol"
import type {
  WanexAppShellNormalizedWorkflowAgentInput,
  WanexAppShellRouteWorkflowEnvelopeErrorResult,
  WanexAppShellWorkflowEnvelope,
  WanexAppShellWorkflowEnvelopeNormalizationResult
} from "./types-workflow-envelope.js"

export function normalizeWanexAppShellWorkflowEnvelope(
  request: WanexAppShellWorkflowEnvelope
): WanexAppShellWorkflowEnvelopeNormalizationResult {
  const text = request.text.trim()
  if (text.length === 0) {
    return {
      kind: "error",
      command: "routeWorkflowEnvelope",
      code: "empty_input",
      message: "workflow envelope text must not be empty"
    }
  }
  const classifierError = validateClassifier(request.classifier)
  if (classifierError !== undefined) {
    return classifierError
  }

  switch (request.kind) {
    case "interactive":
      return normalizeAgentEnvelope(request, {
        origin: {
          kind: "interactive",
          ...(request.sourceRef === undefined
            ? {}
            : { sourceRef: request.sourceRef }),
          ...metadataField(
            compactMetadata({
              gesture: request.gesture,
              ...classifierMetadata(request.classifier)
            })
          )
        },
        intent: "normal"
      })
    case "scheduled":
      if (request.scheduleId.length === 0 || request.tickId.length === 0) {
        return invalidEnvelope("scheduled envelope requires scheduleId and tickId")
      }
      return normalizeAgentEnvelope(request, {
        origin: {
          kind: "scheduler",
          sourceRef: request.scheduleId,
          ...metadataField(
            compactMetadata({
              scheduleId: request.scheduleId,
              tickId: request.tickId,
              nonOverlap: request.nonOverlap,
              ...classifierMetadata(request.classifier)
            })
          )
        },
        intent: "normal"
      })
    case "channel":
      if (request.connectorId.length === 0 || request.eventId.length === 0) {
        return invalidEnvelope("channel envelope requires connectorId and eventId")
      }
      return normalizeAgentEnvelope(request, {
        origin: {
          kind: "connector",
          sourceRef: request.eventId,
          ...(request.threadRef === undefined
            ? {}
            : { parentRef: request.threadRef }),
          ...metadataField(
            compactMetadata({
              connectorId: request.connectorId,
              eventId: request.eventId,
              ...classifierMetadata(request.classifier)
            })
          )
        },
        intent: "normal"
      })
    case "guided_follow_up":
      if (request.sessionId === undefined) {
        return invalidEnvelope("guided follow-up envelope requires sessionId")
      }
      if (request.activeRunId.length === 0) {
        return invalidEnvelope("guided follow-up envelope requires activeRunId")
      }
      return {
        kind: "normalized",
        envelope: {
          text: request.text,
          sessionId: request.sessionId,
          guidedFollowUp: {
            sessionId: request.sessionId,
            activeRunId: request.activeRunId,
            text: request.text,
            ...(request.sourceRef === undefined
              ? {}
              : { sourceRef: request.sourceRef })
          }
        }
      }
    case "side_query":
      return {
        kind: "normalized",
        envelope: {
          text: request.text,
          ...(request.sessionId === undefined
            ? {}
            : { sessionId: request.sessionId }),
          sideQuery: {
            question: request.text,
            ...(request.sessionId === undefined
              ? {}
              : { sessionId: request.sessionId }),
            ...(request.sourceRef === undefined
              ? {}
              : { sourceRef: request.sourceRef }),
            ...(request.maxOutputTokens === undefined
              ? {}
              : { maxOutputTokens: request.maxOutputTokens })
          }
        }
      }
  }
}

function normalizeAgentEnvelope(
  request: WanexAppShellWorkflowEnvelope,
  agent: WanexAppShellNormalizedWorkflowAgentInput
): WanexAppShellWorkflowEnvelopeNormalizationResult {
  return {
    kind: "normalized",
    envelope: {
      text: request.text,
      ...(request.sessionId === undefined ? {} : { sessionId: request.sessionId }),
      agent
    }
  }
}

function validateClassifier(
  classifier: WanexAppShellWorkflowEnvelope["classifier"]
): WanexAppShellRouteWorkflowEnvelopeErrorResult | undefined {
  if (classifier === undefined) {
    return undefined
  }
  if (
    classifier.classifierId.length === 0 ||
    classifier.label.length === 0 ||
    !Number.isFinite(classifier.confidence) ||
    classifier.confidence < 0 ||
    classifier.confidence > 1
  ) {
    return {
      kind: "error",
      command: "routeWorkflowEnvelope",
      code: "invalid_arguments",
      message:
        "classifier hint requires classifierId, label, and confidence between 0 and 1"
    }
  }
  return undefined
}

function invalidEnvelope(
  message: string
): WanexAppShellRouteWorkflowEnvelopeErrorResult {
  return {
    kind: "error",
    command: "routeWorkflowEnvelope",
    code: "invalid_arguments",
    message
  }
}

function classifierMetadata(
  classifier: WanexAppShellWorkflowEnvelope["classifier"]
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

function compactMetadata(
  value: Record<string, string | number | boolean | undefined>
): Record<string, JsonValue> | undefined {
  const metadata: Record<string, JsonValue> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) {
      metadata[key] = item
    }
  }
  return Object.keys(metadata).length === 0 ? undefined : metadata
}

function metadataField(
  metadata: Record<string, JsonValue> | undefined
): Partial<Pick<SessionInputOrigin, "metadata">> {
  return metadata === undefined ? {} : { metadata }
}
