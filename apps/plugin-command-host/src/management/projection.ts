import {
  pluginPackageLayoutFromJson,
  pluginPackageTrustRecordFromJson,
  type LocalPluginPackageInspection,
  type PluginPackageTrustRecord,
} from "@wanex/plugin"
import type { JsonValue, PluginInstallRecord } from "@wanex/protocol"
import type {
  LocalPluginReview,
  PluginInstalledVersionSummary,
  PluginManagementDiagnostic,
} from "@wanex/product/plugin-management"
import type { PluginCommandHostStatus } from "../types.js"
import { freezeManagementValue } from "./revision.js"

export function projectInstalledPluginVersions(
  installs: readonly PluginInstallRecord[],
  hostStatus: PluginCommandHostStatus,
): readonly PluginInstalledVersionSummary[] {
  return installs
    .map((install) => projectInstalledPluginVersion(install, hostStatus))
    .sort(compareSummary)
}

export function projectLocalPluginReview(
  reviewId: string,
  expiresAt: number,
  inspection: LocalPluginPackageInspection,
): LocalPluginReview {
  const layout = inspection.layout
  return freezeManagementValue({
    kind: "plugin.management.local-review",
    reviewId,
    expiresAt,
    pluginId: layout.pluginId,
    displayName: displayName(layout.name, layout.packageName, layout.pluginId),
    version: layout.version,
    sourceKind: "local",
    signatureStatus: "unsigned",
    artifactSha256: inspection.artifactSha256,
    totalBytes: inspection.totalBytes,
    fileCount: inspection.fileCount,
    capabilities: [...layout.capabilities],
    commands: (layout.contributes?.commands ?? []).map((command) => ({
      id: command.id,
      title: command.title,
    })),
    dependencies: inspection.dependencies.map((dependency) => ({
      name: dependency.name,
      distribution: dependency.distribution,
      loading: dependency.loading,
      observedBytes: dependency.observedBytes,
      ...(dependency.maxPackedBytes === undefined
        ? {}
        : { maxPackedBytes: dependency.maxPackedBytes }),
    })),
  })
}

function projectInstalledPluginVersion(
  install: PluginInstallRecord,
  hostStatus: PluginCommandHostStatus,
): PluginInstalledVersionSummary {
  try {
    const layout = pluginPackageLayoutFromJson(install.layout)
    const trust = pluginPackageTrustRecordFromJson(install.trust)
    if (
      layout.pluginId !== install.pluginId ||
      layout.version !== install.version ||
      trust.pluginId !== install.pluginId ||
      trust.version !== install.version
    ) {
      throw new Error("identity mismatch")
    }
    const diagnostic = runtimeDiagnostic(install, hostStatus)
    const localEvidence = localPackageEvidence(install.metadata)
    return {
      pluginId: install.pluginId,
      displayName: displayName(layout.name, layout.packageName, install.pluginId),
      version: install.version,
      state: install.state,
      runtimeState:
        diagnostic === undefined
          ? install.state === "installed"
            ? "loaded"
            : "inactive"
          : "attention_required",
      capabilities: [...layout.capabilities],
      sourceKind: trust.source.kind,
      signatureStatus: signatureStatus(trust),
      ...(trust.integrity?.sha256 === undefined
        ? {}
        : { artifactSha256: trust.integrity.sha256 }),
      ...(localEvidence.totalBytes === undefined
        ? {}
        : { totalBytes: localEvidence.totalBytes }),
      ...(localEvidence.fileCount === undefined
        ? {}
        : { fileCount: localEvidence.fileCount }),
      commandCount: layout.contributes?.commands?.length ?? 0,
      updatedAt: install.updatedAt,
      ...(diagnostic === undefined ? {} : { diagnostic }),
    }
  } catch {
    return {
      pluginId: install.pluginId,
      displayName: install.pluginId,
      version: install.version,
      state: install.state,
      runtimeState: "attention_required",
      capabilities: [],
      sourceKind: "unknown",
      signatureStatus: "unknown",
      commandCount: 0,
      updatedAt: install.updatedAt,
      diagnostic: {
        code: "record_invalid",
        message: "Plugin installation metadata is invalid.",
      },
    }
  }
}

function runtimeDiagnostic(
  install: PluginInstallRecord,
  hostStatus: PluginCommandHostStatus,
): PluginManagementDiagnostic | undefined {
  if (install.state !== "installed") return undefined
  if (hostStatus.lastRefresh === undefined) {
    return {
      code: "runtime_not_loaded",
      message: "Plugin commands have not been loaded.",
    }
  }
  if (hostStatus.lastRefresh.status === "failed") {
    return {
      code: "catalog_refresh_failed",
      message: "Plugin command catalog refresh failed.",
    }
  }
  return undefined
}

function signatureStatus(
  trust: PluginPackageTrustRecord,
): PluginInstalledVersionSummary["signatureStatus"] {
  if (trust.signature !== undefined) {
    return trust.signature.verified ? "verified" : "invalid"
  }
  return trust.source.kind === "local" ? "unsigned" : "unknown"
}

function localPackageEvidence(metadata: JsonValue | undefined): {
  readonly totalBytes?: number
  readonly fileCount?: number
} {
  if (!isRecord(metadata)) return {}
  const localPackage = metadata.localPackage
  if (!isRecord(localPackage)) return {}
  const totalBytes = nonNegativeSafeInteger(localPackage.totalBytes)
  const fileCount = nonNegativeSafeInteger(localPackage.fileCount)
  return {
    ...(totalBytes === undefined ? {} : { totalBytes }),
    ...(fileCount === undefined ? {} : { fileCount }),
  }
}

function isRecord(value: JsonValue | undefined): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function nonNegativeSafeInteger(value: JsonValue | undefined): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined
}

function displayName(
  name: string | undefined,
  packageName: string | undefined,
  pluginId: string,
): string {
  return name ?? packageName ?? pluginId
}

function compareSummary(
  left: PluginInstalledVersionSummary,
  right: PluginInstalledVersionSummary,
): number {
  return `${left.pluginId}\u0000${left.version}`.localeCompare(
    `${right.pluginId}\u0000${right.version}`,
  )
}
