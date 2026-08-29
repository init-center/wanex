import type { JsonValue } from "@wanex/protocol"
import {
  expectPluginCapability,
  expectPositiveNumber,
  expectRecord,
  rejectUnknownRecordKeys,
  expectString,
  expectStringArray
} from "./internal-validation.js"
import { validatePluginPermissionRequest } from "./permission.js"
import { WANEX_PLUGIN_SUBPROCESS_ENTRY_KIND } from "./types.js"
import type {
  PluginPermissionRequest,
  PluginSubprocessManifestEntry,
  PluginSubprocessManifestEntryAction
} from "./types.js"

const SUBPROCESS_ENTRY_FIELDS = new Set([
  "kind",
  "command",
  "args",
  "timeoutMs",
  "stderrLimitBytes",
  "actions"
])
const SUBPROCESS_ACTION_FIELDS = new Set([
  "actionId",
  "capability",
  "permissions"
])
const PERMISSION_REQUEST_FIELDS = new Set([
  "resources",
  "networks",
  "fileSystemPaths",
  "maxExecutionMs"
])

export function pluginSubprocessManifestEntryFromJson(
  value: JsonValue
): PluginSubprocessManifestEntry {
  const record = expectRecord(value, "plugin subprocess manifest entry")
  rejectUnknownRecordKeys(
    record,
    SUBPROCESS_ENTRY_FIELDS,
    "plugin subprocess manifest entry"
  )
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
    rejectUnknownRecordKeys(
      record,
      SUBPROCESS_ACTION_FIELDS,
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
      ...(record.permissions === undefined
        ? {}
        : {
            permissions: expectPermissionRequest(
              record.permissions,
              `plugin subprocess entry actions[${index}].permissions`
            )
          })
    }
    return action
  })
}

function expectPermissionRequest(
  value: JsonValue | undefined,
  label: string
): PluginPermissionRequest {
  const record = expectRecord(value, label)
  rejectUnknownRecordKeys(record, PERMISSION_REQUEST_FIELDS, label)
  const request: PluginPermissionRequest = {
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
  validatePluginPermissionRequest(request)
  return request
}
