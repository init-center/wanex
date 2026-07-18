import {
  optionalNumber,
  parseRecord
} from "./command-port-input-core.js"

export function parseProductAppBackendPortMonitorOptions(
  input: unknown
): { readonly intervalMs?: number } | undefined {
  if (input === undefined) {
    return undefined
  }
  const record = parseRecord("startAgentContextMonitor input", input)
  return {
    ...optionalNumber(record, "intervalMs")
  }
}
