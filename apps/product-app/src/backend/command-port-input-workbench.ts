import {
  parseRecord,
  parseString
} from "./command-port-input-core.js"
import type {
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
