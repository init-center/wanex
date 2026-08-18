import {
  optionalString,
  parseRecord,
  parseString
} from "./core.js"
import type {
  BackendCancelConversationOperationRequest,
  BackendReadConversationOperationRequest,
  BackendSubmitConversationOperationRequest
} from "../../model/index.js"

export function parseBackendPortSubmitConversationOperationInput(
  input: unknown
): BackendSubmitConversationOperationRequest {
  const record = parseRecord("submitConversationOperation input", input)
  return {
    content: [{
      type: "text",
      text: parseString(record, "text", "submitConversationOperation input")
    }],
    ...optionalString(record, "sessionId"),
    ...optionalString(record, "principalId"),
    ...optionalString(record, "inputId"),
    ...optionalString(record, "idempotencyKey"),
    ...optionalString(record, "jobId"),
    ...optionalString(record, "expectedTurnId"),
    ...optionalString(record, "regeneratesTurnId")
  }
}

export function parseBackendPortReadConversationOperationInput(
  input: unknown
): BackendReadConversationOperationRequest {
  return operationReference(
    parseRecord("readConversationOperation input", input)
  )
}

export function parseBackendPortCancelConversationOperationInput(
  input: unknown
): BackendCancelConversationOperationRequest {
  const record = parseRecord("cancelConversationOperation input", input)
  return {
    ...operationReference(record),
    reason: parseString(record, "reason", "cancelConversationOperation input")
  }
}

function operationReference(
  record: Readonly<Record<string, unknown>>
): BackendReadConversationOperationRequest {
  return {
    sessionId: parseString(record, "sessionId", "conversation operation input"),
    inputId: parseString(record, "inputId", "conversation operation input"),
    turnId: parseString(record, "turnId", "conversation operation input"),
    jobId: parseString(record, "jobId", "conversation operation input")
  }
}
