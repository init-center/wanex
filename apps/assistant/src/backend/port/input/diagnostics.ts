import {
  optionalNumber,
  parseRecord
} from "./core.js"
import type {
  BackendDiagnosticsDetailOptions,
  BackendDiagnosticsOptions,
  BackendOverviewOptions,
  BackendSupportBundleOptions
} from "../../model/index.js"

export function parseBackendPortDiagnosticsOptions(
  input: unknown
): BackendDiagnosticsOptions | undefined {
  if (input === undefined) {
    return undefined
  }
  const record = parseRecord("readDiagnostics input", input)
  return {
    ...optionalNumber(record, "now")
  }
}

export function parseBackendPortOverviewOptions(
  input: unknown
): BackendOverviewOptions | undefined {
  if (input === undefined) {
    return undefined
  }
  const record = parseRecord("readAssistantOverview input", input)
  return {
    ...optionalNumber(record, "now"),
    ...optionalNumber(record, "recentSessionLimit")
  }
}

export function parseBackendPortDiagnosticsDetailOptions(
  input: unknown
): BackendDiagnosticsDetailOptions | undefined {
  if (input === undefined) {
    return undefined
  }
  const record = parseRecord("readAssistantDiagnosticsDetail input", input)
  return {
    ...optionalNumber(record, "now"),
    ...optionalNumber(record, "diagnosticLimit"),
    ...optionalNumber(record, "activityLimit")
  }
}

export function parseBackendPortSupportBundleOptions(
  input: unknown
): BackendSupportBundleOptions | undefined {
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
