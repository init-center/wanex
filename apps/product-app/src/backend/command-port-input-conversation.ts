import {
  optionalString,
  parseRecord,
  parseString
} from "./command-port-input-core.js"
import type {
  ProductAppBackendCancelConversationOperationRequest,
  ProductAppBackendReadConversationOperationRequest,
  ProductAppBackendSubmitConversationOperationRequest
} from "./types.js"

export function parseProductAppBackendPortSubmitConversationOperationInput(
  input: unknown
): ProductAppBackendSubmitConversationOperationRequest {
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

export function parseProductAppBackendPortReadConversationOperationInput(
  input: unknown
): ProductAppBackendReadConversationOperationRequest {
  return operationReference(
    parseRecord("readConversationOperation input", input)
  )
}

export function parseProductAppBackendPortCancelConversationOperationInput(
  input: unknown
): ProductAppBackendCancelConversationOperationRequest {
  const record = parseRecord("cancelConversationOperation input", input)
  return {
    ...operationReference(record),
    reason: parseString(record, "reason", "cancelConversationOperation input")
  }
}

function operationReference(
  record: Readonly<Record<string, unknown>>
): ProductAppBackendReadConversationOperationRequest {
  return {
    sessionId: parseString(record, "sessionId", "conversation operation input"),
    inputId: parseString(record, "inputId", "conversation operation input"),
    turnId: parseString(record, "turnId", "conversation operation input"),
    jobId: parseString(record, "jobId", "conversation operation input")
  }
}
