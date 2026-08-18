import {
  ensureNoPositionals,
  parsePositiveInteger
} from "./parse-helpers.js"
import type { ParsedGlobalOptions } from "./parsed-options.js"
import type { ParsedCommand } from "./types.js"

export function parseDiagnosticsCommand(
  globals: ParsedGlobalOptions
): ParsedCommand {
  ensureNoPositionals(globals.positionals, "diagnostics")
  return {
    name: "diagnostics",
    options: globals.options,
    ...(globals.diagnosticsOptions.includeConfigReloads === undefined
      ? {}
      : {
          includeConfigReloads:
            globals.diagnosticsOptions.includeConfigReloads === "true"
        }),
    ...(globals.diagnosticsOptions.memoryMaintenance === undefined
      ? {}
      : {
          memoryMaintenance:
            globals.diagnosticsOptions.memoryMaintenance === "true"
        }),
    ...(globals.diagnosticsOptions["stale-after-ms"] === undefined
      ? {}
      : {
          staleAfterMs: parsePositiveInteger(
            globals.diagnosticsOptions["stale-after-ms"],
            "--stale-after-ms"
          )
        }),
    ...(globals.diagnosticsOptions["session-limit"] === undefined
      ? {}
      : {
          sessionLimit: parsePositiveInteger(
            globals.diagnosticsOptions["session-limit"],
            "--session-limit"
          )
        }),
    ...(globals.limit === undefined ? {} : { jobLimit: globals.limit }),
    ...(globals.diagnosticsOptions["plugin-limit"] === undefined
      ? {}
      : {
          pluginLimit: parsePositiveInteger(
            globals.diagnosticsOptions["plugin-limit"],
            "--plugin-limit"
          )
        })
  }
}

export function parseSupportBundleCommand(
  globals: ParsedGlobalOptions
): ParsedCommand {
  ensureNoPositionals(globals.positionals, "support-bundle")
  return {
    name: "support-bundle",
    options: globals.options,
    ...(globals.supportOptions["model-endpoint"] === undefined
      ? {}
      : {
          modelEndpointIds:
            globals.supportOptions["model-endpoint"].split(",").filter(Boolean)
        }),
    ...(globals.sessionId === undefined ? {} : { sessionId: globals.sessionId }),
    ...(globals.supportOptions["event-limit"] === undefined
      ? {}
      : {
          eventLimit: parsePositiveInteger(
            globals.supportOptions["event-limit"],
            "--event-limit"
          )
        }),
    ...(globals.supportOptions["job-limit"] === undefined
      ? {}
      : {
          jobLimit: parsePositiveInteger(
            globals.supportOptions["job-limit"],
            "--job-limit"
          )
        }),
    ...(globals.supportOptions["plugin-limit"] === undefined
      ? {}
      : {
          pluginLimit: parsePositiveInteger(
            globals.supportOptions["plugin-limit"],
            "--plugin-limit"
          )
        }),
    ...(globals.supportOptions.memoryMaintenance === undefined
      ? {}
      : {
          memoryMaintenance:
            globals.supportOptions.memoryMaintenance === "true"
        }),
    ...(globals.supportOptions["stale-after-ms"] === undefined
      ? {}
      : {
          staleAfterMs: parsePositiveInteger(
            globals.supportOptions["stale-after-ms"],
            "--stale-after-ms"
          )
        }),
    ...(globals.supportOptions["session-limit"] === undefined
      ? {}
      : {
          sessionLimit: parsePositiveInteger(
            globals.supportOptions["session-limit"],
            "--session-limit"
          )
        })
  }
}
