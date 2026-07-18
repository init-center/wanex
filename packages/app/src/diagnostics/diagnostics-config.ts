import type {
  AppDiagnosticEntry,
  BaseConfigUpdatedPayload
} from "./diagnostics-types.js"

export function configUpdatedDiagnostic(
  configEvent: BaseConfigUpdatedPayload
): AppDiagnosticEntry {
  return {
    id: `config:${configEvent.key}:${configEvent.updatedAt}`,
    source: "config",
    severity: "info",
    code: "config.updated",
    message: `Config key updated: ${configEvent.key}`,
    at: configEvent.updatedAt,
    detail: {
      key: configEvent.key,
      updatedAt: configEvent.updatedAt
    }
  }
}
