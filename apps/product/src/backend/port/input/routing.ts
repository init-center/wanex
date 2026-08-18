import {
  BackendCommandPortValidationError,
  optionalBoolean,
  optionalClassifier,
  optionalNumber,
  optionalString,
  parseRecord,
  parseString
} from "./core.js"
import type {
  BackendRouteInputRequest,
  BackendWorkflowEnvelope
} from "../../model/index.js"

export function parseBackendPortRouteInput(
  input: unknown
): BackendRouteInputRequest {
  const record = parseRecord("routeInput input", input)
  const text = parseString(record, "text", "routeInput input")
  return {
    text,
    ...optionalString(record, "sessionId")
  }
}

export function parseBackendPortWorkflowEnvelope(
  input: unknown
): BackendWorkflowEnvelope {
  const record = parseRecord("routeWorkflowEnvelope input", input)
  const kind = parseString(record, "kind", "routeWorkflowEnvelope input")
  const text = parseString(record, "text", "routeWorkflowEnvelope input")
  const base = {
    text,
    ...optionalString(record, "sessionId"),
    ...optionalClassifier(record)
  }

  switch (kind) {
    case "interactive":
      return {
        kind,
        ...base,
        ...optionalString(record, "sourceRef"),
        ...optionalString(record, "gesture")
      }
    case "command":
      return {
        kind,
        ...base,
        ...optionalString(record, "sourceRef")
      }
    case "scheduled":
      return {
        kind,
        ...base,
        scheduleId: parseString(record, "scheduleId", "scheduled input"),
        tickId: parseString(record, "tickId", "scheduled input"),
        ...optionalBoolean(record, "nonOverlap")
      }
    case "channel":
      return {
        kind,
        ...base,
        connectorId: parseString(record, "connectorId", "channel input"),
        eventId: parseString(record, "eventId", "channel input"),
        ...optionalString(record, "threadRef")
      }
    case "guided_follow_up":
      return {
        kind,
        ...base,
        activeTurnId: parseString(record, "activeTurnId", "guided follow-up input"),
        ...optionalString(record, "sourceRef")
      }
    case "side_query":
      return {
        kind,
        ...base,
        ...optionalString(record, "sourceRef"),
        ...optionalNumber(record, "maxOutputTokens")
      }
    default:
      throw new BackendCommandPortValidationError(
        `unsupported workflow envelope kind: ${kind}`
      )
  }
}
