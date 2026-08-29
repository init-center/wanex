import {
  parseRecord,
  parseString
} from "./core.js"
import type {
  BackendReadWorkbenchRequest
} from "../../model/index.js"

export function parseBackendPortWorkbenchInput(
  input: unknown
): BackendReadWorkbenchRequest {
  const record = parseRecord("readAssistantWorkbench input", input)
  return {
    sessionId: parseString(record, "sessionId", "readAssistantWorkbench input")
  }
}
