import {
  optionalString,
  parseRecord,
  parseString
} from "./command-port-input-core.js"
import type {
  ProductAppBackendRunAgentTurnRequest
} from "./types.js"

export function parseProductAppBackendPortRunAgentTurnInput(
  input: unknown
): ProductAppBackendRunAgentTurnRequest {
  const record = parseRecord("runAgentTurn input", input)
  return {
    text: parseString(record, "text", "runAgentTurn input"),
    ...optionalString(record, "sessionId"),
    ...optionalString(record, "principalId"),
    ...optionalString(record, "inputId"),
    ...optionalString(record, "idempotencyKey"),
    ...optionalString(record, "jobId"),
    ...optionalString(record, "jobIdempotencyKey"),
    ...optionalString(record, "expectedRunId")
  }
}
