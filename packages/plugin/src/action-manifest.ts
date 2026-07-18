import type {
  PluginCapability,
  PluginManifestRecord
} from "@wanex/protocol"
import type { PluginRuntimeStore } from "./storage.js"
import type { PluginSandboxPolicy } from "./types.js"

export async function requireExecutableManifest(
  storage: PluginRuntimeStore,
  request: {
    readonly pluginId: string
    readonly version?: string
    readonly capability: PluginCapability
  }
): Promise<PluginManifestRecord> {
  const manifest = await storage.getPluginManifest({
    pluginId: request.pluginId,
    ...(request.version === undefined ? {} : { version: request.version })
  })
  if (manifest === null) {
    throw new Error(`plugin manifest not found: ${request.pluginId}`)
  }
  if (manifest.state !== "registered") {
    throw new Error(`plugin manifest is not registered: ${request.pluginId}`)
  }
  if (!manifest.capabilities.includes(request.capability)) {
    throw new Error(
      `plugin capability not declared: ${request.pluginId} requires ${request.capability}`
    )
  }
  return manifest
}

export function defaultPluginSandboxPolicy(
  manifest: PluginManifestRecord
): PluginSandboxPolicy {
  return {
    pluginId: manifest.pluginId,
    version: manifest.version,
    decision: "allow",
    capabilities: manifest.capabilities,
    resources: [],
    networks: [],
    fileSystemPaths: [],
    maxExecutionMs: 30_000
  }
}
