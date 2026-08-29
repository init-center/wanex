import { createHash } from "node:crypto"
import {
  resolveAppExtensionContributions,
  type AppExtensionCatalogGeneration,
  type AppExtensionResolvedSnapshot,
} from "@wanex/extension"
import {
  assertPluginInstallExecutable,
  pluginPackageLayoutFromJson,
  pluginPackageTrustRecordFromJson,
  PluginRuntime,
  type PluginInstallRecord,
  type PluginManifestRecord,
} from "@wanex/plugin"
import type { PluginInstallState } from "@wanex/protocol"
import { projectPluginPackageCommandContributions } from "./manifest/commands.js"
import { PluginActionHostRegistry } from "./action-host-registry.js"
import type {
  AssistantPluginHostDiagnosticCode,
  AssistantPluginHostRefreshResult,
} from "./types.js"

export const MAX_ACTIVE_PLUGIN_INSTALLS = 256

export interface PluginCatalogBuild {
  readonly generation: AppExtensionCatalogGeneration
  readonly activePluginCount: number
  readonly commandCount: number
}

export class PluginCatalogBuildError extends Error {
  constructor(
    readonly code: AssistantPluginHostDiagnosticCode,
    message: string,
  ) {
    super(message)
    this.name = "PluginCatalogBuildError"
  }
}

export function emptyPluginCatalogGeneration(): AppExtensionCatalogGeneration {
  const snapshot = resolveAppExtensionContributions([])
  return {
    revision: revisionForArtifacts([]),
    snapshot,
  }
}

export async function buildPluginCatalog(
  plugin: PluginRuntime,
  registry: PluginActionHostRegistry,
): Promise<PluginCatalogBuild> {
  const installs = await plugin.listInstalls({
    state: "installed" satisfies PluginInstallState,
    limit: MAX_ACTIVE_PLUGIN_INSTALLS + 1,
  })
  if (installs.length > MAX_ACTIVE_PLUGIN_INSTALLS) {
    throw new PluginCatalogBuildError(
      "active_plugin_limit_exceeded",
      `active Plugin install count exceeds ${MAX_ACTIVE_PLUGIN_INSTALLS}`,
    )
  }

  const sortedInstalls = [...installs].sort(compareInstallIdentity)
  const seenPluginIds = new Set<string>()
  const artifacts: PluginCatalogArtifact[] = []
  const contributions = []

  for (const install of sortedInstalls) {
    if (seenPluginIds.has(install.pluginId)) {
      throw new PluginCatalogBuildError(
        "duplicate_active_plugin",
        `multiple active Plugin installs found for ${install.pluginId}`,
      )
    }
    seenPluginIds.add(install.pluginId)

    const manifest = await plugin.getManifest(install.pluginId, install.version)
    if (manifest === null) {
      throw new PluginCatalogBuildError(
        "manifest_missing",
        `active Plugin manifest is missing for ${install.pluginId}@${install.version}`,
      )
    }
    if (manifest.state !== "registered") {
      throw new PluginCatalogBuildError(
        "manifest_inactive",
        `active Plugin manifest is not registered for ${install.pluginId}@${install.version}`,
      )
    }

    const layout = parseLayout(install)
    const trust = parseTrust(install)
    assertMatchingIdentity(manifest, install, layout, trust)

    let projected
    try {
      projected = projectPluginPackageCommandContributions(layout)
    } catch (error) {
      throw new PluginCatalogBuildError(
        "layout_invalid",
        `Plugin command projection failed for ${install.pluginId}@${install.version}: ${errorMessage(error)}`,
      )
    }
    contributions.push(...projected)
    artifacts.push({ manifest, install, layout, trust, commands: projected })
  }

  const snapshot = resolveAppExtensionContributions(contributions)
  if (snapshot.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    throw new PluginCatalogBuildError(
      "command_resolution_failed",
      "Plugin command catalog resolution produced an error diagnostic",
    )
  }

  for (const artifact of artifacts) {
    try {
      await registry.ensure(artifact)
    } catch (error) {
      throw new PluginCatalogBuildError(
        "host_creation_failed",
        `Plugin execution host creation failed for ${artifact.install.pluginId}@${artifact.install.version}: ${errorMessage(error)}`,
      )
    }
  }

  return {
    generation: {
      revision: revisionForArtifacts(artifacts),
      snapshot,
    },
    activePluginCount: artifacts.length,
    commandCount: snapshot.byDomain.command.all.length,
  }
}

export function failedRefreshResult(
  error: unknown,
  current: {
    readonly revision: string
    readonly activePluginCount: number
    readonly commandCount: number
  },
): AssistantPluginHostRefreshResult {
  return {
    status: "failed",
    revision: current.revision,
    activePluginCount: current.activePluginCount,
    commandCount: current.commandCount,
    diagnostic: diagnosticForError(error),
  }
}

interface PluginCatalogArtifact {
  readonly manifest: PluginManifestRecord
  readonly install: PluginInstallRecord
  readonly layout: ReturnType<typeof pluginPackageLayoutFromJson>
  readonly trust: ReturnType<typeof pluginPackageTrustRecordFromJson>
  readonly commands: readonly unknown[]
}

function parseLayout(install: PluginInstallRecord) {
  try {
    return pluginPackageLayoutFromJson(install.layout)
  } catch (error) {
    throw new PluginCatalogBuildError(
      "layout_invalid",
      `active Plugin layout is invalid for ${install.pluginId}@${install.version}: ${errorMessage(error)}`,
    )
  }
}

function parseTrust(install: PluginInstallRecord) {
  try {
    return pluginPackageTrustRecordFromJson(install.trust)
  } catch (error) {
    throw new PluginCatalogBuildError(
      "trust_invalid",
      `active Plugin trust is invalid for ${install.pluginId}@${install.version}: ${errorMessage(error)}`,
    )
  }
}

function assertMatchingIdentity(
  manifest: PluginManifestRecord,
  install: PluginInstallRecord,
  layout: ReturnType<typeof pluginPackageLayoutFromJson>,
  trust: ReturnType<typeof pluginPackageTrustRecordFromJson>,
): void {
  try {
    assertPluginInstallExecutable(manifest, install, trust)
  } catch (error) {
    throw new PluginCatalogBuildError("trust_invalid", errorMessage(error))
  }
  if (trust.install.rootDir !== install.installRootDir) {
    throw new PluginCatalogBuildError(
      "trust_invalid",
      `Plugin trust root does not match install record for ${install.pluginId}@${install.version}`,
    )
  }
  if (
    layout.pluginId !== manifest.pluginId ||
    layout.version !== manifest.version ||
    manifest.name !== layout.name ||
    stableJson(manifest.entry ?? null) !== stableJson(layout.entry) ||
    stableJson(manifest.capabilities) !== stableJson(layout.capabilities) ||
    stableJson(manifest.metadata ?? null) !== stableJson(layout.metadata ?? null)
  ) {
    throw new PluginCatalogBuildError(
      "identity_mismatch",
      `Plugin manifest and layout identity do not match for ${install.pluginId}@${install.version}`,
    )
  }
}

function revisionForArtifacts(artifacts: readonly PluginCatalogArtifact[]): string {
  const identity = artifacts
    .map((artifact) => ({
      pluginId: artifact.install.pluginId,
      version: artifact.install.version,
      layout: artifact.layout,
      manifest: {
        name: artifact.manifest.name,
        entry: artifact.manifest.entry,
        capabilities: artifact.manifest.capabilities,
        metadata: artifact.manifest.metadata,
      },
      trust: {
        source: artifact.trust.source,
        integrity: artifact.trust.integrity,
        signature: artifact.trust.signature,
        decision: artifact.trust.decision,
      },
      commands: artifact.commands,
    }))
    .sort((left, right) =>
      `${left.pluginId}\u0000${left.version}`.localeCompare(
        `${right.pluginId}\u0000${right.version}`,
      ),
    )
  return `plugin-catalog:sha256:${createHash("sha256")
    .update(stableJson(identity))
    .digest("hex")}`
}

function compareInstallIdentity(
  left: PluginInstallRecord,
  right: PluginInstallRecord,
): number {
  return `${left.pluginId}\u0000${left.version}`.localeCompare(
    `${right.pluginId}\u0000${right.version}`,
  )
}

function diagnosticForError(error: unknown): {
  readonly code: AssistantPluginHostDiagnosticCode
  readonly message: string
} {
  if (error instanceof PluginCatalogBuildError) {
    return { code: error.code, message: error.code }
  }
  return { code: "refresh_failed", message: "refresh_failed" }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null"
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
    .join(",")}}`
}
