import type {
  PluginCapability,
  PluginManifestRecord
} from "@wanex/protocol"
import type { PluginRuntimeStore } from "./storage.js"
import {
  assertPluginInstallExecutable,
  pluginPackageTrustRecordFromJson
} from "./codec.js"
import type { PluginSandboxPolicy } from "./types.js"

export async function requireExecutablePluginManifest(
  storage: PluginRuntimeStore,
  request: {
    readonly pluginId: string
    readonly version: string
    readonly capability: PluginCapability
  }
): Promise<PluginManifestRecord> {
  const admission = await storage.getPluginActionExecutionAdmission({
    pluginId: request.pluginId,
    version: request.version,
    requiredCapability: request.capability
  })
  const trust = pluginPackageTrustRecordFromJson(admission.install.trust)
  assertPluginInstallExecutable(admission.manifest, admission.install, trust)
  return admission.manifest
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
