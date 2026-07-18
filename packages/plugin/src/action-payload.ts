import type { JsonValue } from "@wanex/protocol"
import {
  expectJsonValue,
  expectPluginCapability,
  expectRecord,
  expectString
} from "./internal-validation.js"
import type { PluginActionJobPayload } from "./types.js"

export function pluginActionJobPayloadFromJson(
  payload: JsonValue
): PluginActionJobPayload {
  const record = expectRecord(payload, "plugin.action payload")
  return {
    pluginId: expectString(record.pluginId, "plugin.action.pluginId"),
    ...(record.version === undefined
      ? {}
      : { version: expectString(record.version, "plugin.action.version") }),
    actionId: expectString(record.actionId, "plugin.action.actionId"),
    payload: expectJsonValue(record.payload, "plugin.action.payload"),
    ...(record.requiredCapability === undefined
      ? {}
      : {
          requiredCapability: expectPluginCapability(
            record.requiredCapability,
            "plugin.action.requiredCapability"
          )
        })
  }
}
