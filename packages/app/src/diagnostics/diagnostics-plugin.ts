import type {
  AppDiagnosticEntry,
  BasePluginStateRecord
} from "./diagnostics-types.js"

export function pluginStateDiagnostic(
  kind: "manifest" | "install",
  record: BasePluginStateRecord
): AppDiagnosticEntry {
  const removedOrDisabled = record.state === "removed" || record.state === "disabled"
  return {
    id: `plugin-${kind}:${record.id}`,
    source: "plugin",
    severity: removedOrDisabled ? "warning" : "info",
    code: `plugin.${kind}.${record.state}`,
    message: `Plugin ${kind} ${record.state}`,
    at: record.updatedAt,
    detail: {
      id: record.id,
      pluginId: record.pluginId,
      version: record.version,
      state: record.state,
      updatedAt: record.updatedAt
    }
  }
}
