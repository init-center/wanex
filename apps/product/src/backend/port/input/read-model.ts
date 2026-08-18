import {
  optionalNumber,
  parseRecord,
  parseString
} from "./core.js"
import type {
  BackendReadRecentSessionsRequest,
  BackendReadSessionInputProvenanceRequest,
  BackendReadSessionTranscriptRequest
} from "../../model/index.js"

export function parseBackendPortRecentSessionsInput(
  input: unknown
): BackendReadRecentSessionsRequest | undefined {
  if (input === undefined) {
    return undefined
  }
  const record = parseRecord("readRecentSessions input", input)
  return {
    ...optionalNumber(record, "limit")
  }
}

export function parseBackendPortSessionInputProvenanceInput(
  input: unknown
): BackendReadSessionInputProvenanceRequest {
  const record = parseRecord("readSessionInputProvenance input", input)
  return {
    sessionId: parseString(
      record,
      "sessionId",
      "readSessionInputProvenance input"
    )
  }
}

export function parseBackendPortSessionTranscriptInput(
  input: unknown
): BackendReadSessionTranscriptRequest {
  const record = parseRecord("readSessionTranscript input", input)
  return {
    sessionId: parseString(
      record,
      "sessionId",
      "readSessionTranscript input"
    ),
    ...optionalNumber(record, "beforeSequence"),
    ...optionalNumber(record, "limit")
  }
}
