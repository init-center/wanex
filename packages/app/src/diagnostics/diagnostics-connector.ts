import type {
  AppActivityEntry,
  AppDiagnosticEntry,
  BaseConnectorActivityEntry,
  BaseConnectorDiagnostic
} from "./diagnostics-types.js"

export function connectorDiagnosticProjection(
  item: BaseConnectorDiagnostic
): AppDiagnosticEntry {
  return {
    id: `connector:${item.code}:${item.at}`,
    source: "connector",
    severity: item.severity,
    code: item.code,
    message: item.message,
    at: item.at,
    ...(item.detail === undefined ? {} : { detail: item.detail })
  }
}

export function connectorActivityProjection(
  item: BaseConnectorActivityEntry
): AppActivityEntry {
  return {
    id: item.id,
    source: "connector",
    severity: item.severity,
    message: item.message,
    at: item.at,
    ...(item.detail === undefined ? {} : { detail: item.detail })
  }
}
