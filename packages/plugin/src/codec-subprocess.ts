import type { JsonValue } from "@wanex/protocol"
import {
  expectPluginCapability,
  expectPositiveNumber,
  expectRecord,
  expectString,
  expectStringArray
} from "./internal-validation.js"
import { validatePluginSandboxAccessRequest } from "./sandbox.js"
import { WANEX_PLUGIN_SUBPROCESS_ENTRY_KIND } from "./types.js"
import type {
  PluginSandboxAccessRequest,
  PluginSubprocessManifestEntry,
  PluginSubprocessManifestEntryAction
} from "./types.js"

export function pluginSubprocessManifestEntryFromJson(
  value: JsonValue
): PluginSubprocessManifestEntry {
  const record = expectRecord(value, "plugin subprocess manifest entry")
  const kind = expectString(record.kind, "plugin subprocess entry kind")
  if (kind !== WANEX_PLUGIN_SUBPROCESS_ENTRY_KIND) {
    throw new Error("plugin subprocess entry kind is not supported")
  }
  const entry: PluginSubprocessManifestEntry = {
    kind: WANEX_PLUGIN_SUBPROCESS_ENTRY_KIND,
    command: expectString(record.command, "plugin subprocess entry command"),
    ...(record.args === undefined
      ? {}
      : { args: expectStringArray(record.args, "plugin subprocess entry args") }),
    ...(record.timeoutMs === undefined
      ? {}
      : {
          timeoutMs: expectPositiveNumber(
            record.timeoutMs,
            "plugin subprocess entry timeoutMs"
          )
        }),
    ...(record.stderrLimitBytes === undefined
      ? {}
      : {
          stderrLimitBytes: expectPositiveNumber(
            record.stderrLimitBytes,
            "plugin subprocess entry stderrLimitBytes"
          )
        }),
    actions: expectSubprocessEntryActions(record.actions)
  }
  if (entry.actions.length === 0) {
    throw new Error("plugin subprocess entry actions must not be empty")
  }
  return entry
}

function expectSubprocessEntryActions(
  value: JsonValue | undefined
): PluginSubprocessManifestEntryAction[] {
  if (!Array.isArray(value)) {
    throw new Error("plugin subprocess entry actions must be an array")
  }
  return value.map((entry, index) => {
    const record = expectRecord(
      entry,
      `plugin subprocess entry actions[${index}]`
    )
    const action: PluginSubprocessManifestEntryAction = {
      actionId: expectString(
        record.actionId,
        `plugin subprocess entry actions[${index}].actionId`
      ),
      capability: expectPluginCapability(
        record.capability,
        `plugin subprocess entry actions[${index}].capability`
      ),
      ...(record.version === undefined
        ? {}
        : {
            version: expectString(
              record.version,
              `plugin subprocess entry actions[${index}].version`
            )
          }),
      ...(record.sandbox === undefined
        ? {}
        : {
            sandbox: expectSandboxAccessRequest(
              record.sandbox,
              `plugin subprocess entry actions[${index}].sandbox`
            )
          })
    }
    return action
  })
}

function expectSandboxAccessRequest(
  value: JsonValue | undefined,
  label: string
): PluginSandboxAccessRequest {
  const record = expectRecord(value, label)
  const request: PluginSandboxAccessRequest = {
    ...(record.resources === undefined
      ? {}
      : { resources: expectStringArray(record.resources, `${label}.resources`) }),
    ...(record.networks === undefined
      ? {}
      : { networks: expectStringArray(record.networks, `${label}.networks`) }),
    ...(record.fileSystemPaths === undefined
      ? {}
      : {
          fileSystemPaths: expectStringArray(
            record.fileSystemPaths,
            `${label}.fileSystemPaths`
          )
        }),
    ...(record.maxExecutionMs === undefined
      ? {}
      : {
          maxExecutionMs: expectPositiveNumber(
            record.maxExecutionMs,
            `${label}.maxExecutionMs`
          )
        })
  }
  validatePluginSandboxAccessRequest(request)
  return request
}
