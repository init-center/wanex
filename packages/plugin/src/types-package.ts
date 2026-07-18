import type { JsonValue, PluginCapability } from "@wanex/protocol"
import type {
  WANEX_PLUGIN_INSTALL_PLAN_KIND,
  WANEX_PLUGIN_PACKAGE_LAYOUT_KIND,
  WANEX_PLUGIN_PACKAGE_TRUST_KIND,
  WANEX_PLUGIN_SUBPROCESS_ENTRY_KIND
} from "./types-constants.js"
import type { PluginSandboxAccessRequest } from "./types-sandbox.js"

export interface PluginSubprocessManifestEntryAction {
  readonly actionId: string
  readonly capability: PluginCapability
  readonly version?: string
  readonly sandbox?: PluginSandboxAccessRequest
}

export interface PluginSubprocessManifestEntry {
  readonly kind: typeof WANEX_PLUGIN_SUBPROCESS_ENTRY_KIND
  readonly command: string
  readonly args?: readonly string[]
  readonly timeoutMs?: number
  readonly stderrLimitBytes?: number
  readonly actions: readonly PluginSubprocessManifestEntryAction[]
}

export type PluginPackageSourceKind =
  | "local"
  | "registry"
  | "archive"
  | "git"
  | "builtin"

export type PluginPackageTrustDecisionStatus =
  | "allow"
  | "deny"
  | "review-required"

export interface PluginPackageTrustSource {
  readonly kind: PluginPackageSourceKind
  readonly uri?: string
  readonly publisher?: string
  readonly revision?: string
}

export interface PluginPackageTrustIntegrity {
  readonly sha256?: string
}

export interface PluginPackageTrustSignature {
  readonly kind: string
  readonly signer?: string
  readonly verified: boolean
}

export interface PluginPackageTrustInstall {
  readonly rootDir: string
}

export interface PluginPackageTrustDecision {
  readonly status: PluginPackageTrustDecisionStatus
  readonly reason?: string
}

export interface PluginPackageTrustRecord {
  readonly kind: typeof WANEX_PLUGIN_PACKAGE_TRUST_KIND
  readonly pluginId: string
  readonly version: string
  readonly source: PluginPackageTrustSource
  readonly integrity?: PluginPackageTrustIntegrity
  readonly signature?: PluginPackageTrustSignature
  readonly install: PluginPackageTrustInstall
  readonly decision: PluginPackageTrustDecision
  readonly metadata?: JsonValue
}

export type PluginPackageRuntimeDependencyLoading = "lazy" | "startup"
export type PluginPackageRuntimeDependencyDistribution =
  | "bundled"
  | "peer"
  | "optional"
  | "external-artifact"

export interface PluginPackageRuntimeDependency {
  readonly name: string
  readonly version?: string
  readonly loading: PluginPackageRuntimeDependencyLoading
  readonly distribution: PluginPackageRuntimeDependencyDistribution
  readonly platforms?: readonly string[]
  readonly maxPackedBytes?: number
}

export interface PluginPackageFileEntry {
  readonly path: string
  readonly sha256?: string
  readonly executable?: boolean
  readonly bytes?: number
}

export interface PluginPackageLayout {
  readonly kind: typeof WANEX_PLUGIN_PACKAGE_LAYOUT_KIND
  readonly pluginId: string
  readonly version: string
  readonly name?: string
  readonly packageName?: string
  readonly entry: PluginSubprocessManifestEntry
  readonly capabilities: readonly PluginCapability[]
  readonly runtimeDependencies?: readonly PluginPackageRuntimeDependency[]
  readonly files?: readonly PluginPackageFileEntry[]
  readonly metadata?: JsonValue
}

export interface PluginInstallPlan {
  readonly kind: typeof WANEX_PLUGIN_INSTALL_PLAN_KIND
  readonly layout: PluginPackageLayout
  readonly source: PluginPackageTrustSource
  readonly integrity?: PluginPackageTrustIntegrity
  readonly signature?: PluginPackageTrustSignature
  readonly install: PluginPackageTrustInstall
  readonly decision: PluginPackageTrustDecision
  readonly metadata?: JsonValue
}
