import {
  optionalNumber,
  parseRecord
} from "./core.js"

export function parseBackendPortMonitorOptions(
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
