import type { PluginCapability } from "@wanex/protocol"

export const WANEX_REFERENCE_CONNECTOR_ADAPTER =
  "wanex-reference-connector-adapter" as const

export const REFERENCE_CONNECTOR_PLUGIN_ID =
  "plugin.connector.reference" as const
export const REFERENCE_CONNECTOR_ID = "connector.reference" as const
export const REFERENCE_CONNECTOR_VERSION = "0.0.0" as const
export const REFERENCE_CONNECTOR_CHANNEL_KIND = "reference" as const
export const REFERENCE_CONNECTOR_CHANNEL_ID = "main" as const
export const REFERENCE_CONNECTOR_CREDENTIAL_KIND =
  "reference-secret" as const

export const REFERENCE_CONNECTOR_CAPABILITIES = [
  "channel.connect",
  "channel.receive",
  "channel.deliver"
] as const satisfies readonly PluginCapability[]
