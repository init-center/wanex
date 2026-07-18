import {
  optionalNumber,
  parseRecord,
  parseString
} from "./command-port-input-core.js"
import type {
  ProductAppBackendReadRecentSessionsRequest,
  ProductAppBackendReadSessionInputProvenanceRequest,
  ProductAppBackendReadSessionTranscriptRequest
} from "./types.js"

export function parseProductAppBackendPortRecentSessionsInput(
  input: unknown
): ProductAppBackendReadRecentSessionsRequest | undefined {
  if (input === undefined) {
    return undefined
  }
  const record = parseRecord("readRecentSessions input", input)
  return {
    ...optionalNumber(record, "limit")
  }
}

export function parseProductAppBackendPortSessionInputProvenanceInput(
  input: unknown
): ProductAppBackendReadSessionInputProvenanceRequest {
  const record = parseRecord("readSessionInputProvenance input", input)
  return {
    sessionId: parseString(
      record,
      "sessionId",
      "readSessionInputProvenance input"
    )
  }
}

export function parseProductAppBackendPortSessionTranscriptInput(
  input: unknown
): ProductAppBackendReadSessionTranscriptRequest {
  const record = parseRecord("readSessionTranscript input", input)
  return {
    sessionId: parseString(
      record,
      "sessionId",
      "readSessionTranscript input"
    )
  }
}
