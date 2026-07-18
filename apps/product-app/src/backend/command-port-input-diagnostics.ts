import {
  optionalNumber,
  parseRecord
} from "./command-port-input-core.js"
import type {
  ProductAppBackendDiagnosticsDetailOptions,
  ProductAppBackendDiagnosticsOptions,
  ProductAppBackendOverviewOptions,
  ProductAppBackendSupportBundleOptions
} from "./types.js"

export function parseProductAppBackendPortDiagnosticsOptions(
  input: unknown
): ProductAppBackendDiagnosticsOptions | undefined {
  if (input === undefined) {
    return undefined
  }
  const record = parseRecord("readDiagnostics input", input)
  return {
    ...optionalNumber(record, "now")
  }
}

export function parseProductAppBackendPortOverviewOptions(
  input: unknown
): ProductAppBackendOverviewOptions | undefined {
  if (input === undefined) {
    return undefined
  }
  const record = parseRecord("readProductOverview input", input)
  return {
    ...optionalNumber(record, "now"),
    ...optionalNumber(record, "recentSessionLimit")
  }
}

export function parseProductAppBackendPortDiagnosticsDetailOptions(
  input: unknown
): ProductAppBackendDiagnosticsDetailOptions | undefined {
  if (input === undefined) {
    return undefined
  }
  const record = parseRecord("readProductDiagnosticsDetail input", input)
  return {
    ...optionalNumber(record, "now"),
    ...optionalNumber(record, "diagnosticLimit"),
    ...optionalNumber(record, "activityLimit")
  }
}

export function parseProductAppBackendPortSupportBundleOptions(
  input: unknown
): ProductAppBackendSupportBundleOptions | undefined {
  if (input === undefined) {
    return undefined
  }
  const record = parseRecord("buildSupportBundle input", input)
  return {
    ...optionalNumber(record, "now"),
    ...optionalNumber(record, "eventLimit"),
    ...optionalNumber(record, "jobLimit")
  }
}
