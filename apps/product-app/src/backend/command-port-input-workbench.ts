import {
  optionalString,
  parseRecord,
  parseString
} from "./command-port-input-core.js"
import type {
  ProductAppBackendContinueWorkbenchSessionRequest,
  ProductAppBackendReadWorkbenchRequest
} from "./types.js"

export function parseProductAppBackendPortWorkbenchInput(
  input: unknown
): ProductAppBackendReadWorkbenchRequest {
  const record = parseRecord("readProductWorkbench input", input)
  return {
    sessionId: parseString(record, "sessionId", "readProductWorkbench input")
  }
}

export function parseProductAppBackendPortContinueWorkbenchInput(
  input: unknown
): ProductAppBackendContinueWorkbenchSessionRequest {
  const record = parseRecord("continueProductWorkbenchSession input", input)
  return {
    sessionId: parseString(
      record,
      "sessionId",
      "continueProductWorkbenchSession input"
    ),
    text: parseString(record, "text", "continueProductWorkbenchSession input"),
    ...optionalString(record, "principalId"),
    ...optionalString(record, "inputId"),
    ...optionalString(record, "idempotencyKey"),
    ...optionalString(record, "jobId"),
    ...optionalString(record, "jobIdempotencyKey")
  }
}
