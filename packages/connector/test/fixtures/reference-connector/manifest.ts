import type { ConnectorAdapterPackagingSpec } from "@wanex/connector"
import type { JsonValue } from "@wanex/protocol"
import {
  REFERENCE_CONNECTOR_CAPABILITIES,
  REFERENCE_CONNECTOR_PLUGIN_ID,
  REFERENCE_CONNECTOR_VERSION,
  WANEX_REFERENCE_CONNECTOR_ADAPTER
} from "./constants.js"

export interface ReferenceConnectorManifest {
  readonly pluginId: typeof REFERENCE_CONNECTOR_PLUGIN_ID
  readonly version: typeof REFERENCE_CONNECTOR_VERSION
  readonly name: string
  readonly entry: JsonValue
  readonly capabilities: typeof REFERENCE_CONNECTOR_CAPABILITIES
}

export const referenceConnectorManifest: ReferenceConnectorManifest = {
  pluginId: REFERENCE_CONNECTOR_PLUGIN_ID,
  version: REFERENCE_CONNECTOR_VERSION,
  name: "Wanex Reference Connector Adapter",
  entry: {
    kind: "wanex.connector-adapter",
    adapter: WANEX_REFERENCE_CONNECTOR_ADAPTER
  },
  capabilities: REFERENCE_CONNECTOR_CAPABILITIES
}

export const referenceConnectorPackaging = {
  kind: "wanex.connector-adapter.package",
  pluginId: REFERENCE_CONNECTOR_PLUGIN_ID,
  packageName: "@wanex/connector-adapter-fixture",
  adapterExport: "createReferenceConnectorAdapter",
  bundleMode: "adapter-with-declared-runtime-deps",
  requiresGateway: false,
  runtimeDependencies: [
    "@wanex/connector",
    "@wanex/protocol"
  ],
  sdkDependencies: [],
  nativeArtifacts: []
} as const satisfies ConnectorAdapterPackagingSpec
