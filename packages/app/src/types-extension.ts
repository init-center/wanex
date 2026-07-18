import type {
  AppExtensionContributionDomain,
  AppExtensionDiagnosticCode,
  AppExtensionResolvedSnapshot,
  AppExtensionSourceKind,
  AppExtensionSourceScope,
  AppExtensionTrustLevel
} from "@wanex/extension"

export interface WanexAppShellExtensionOptions {
  readonly snapshot: AppExtensionResolvedSnapshot
}

export interface WanexAppShellExtensionStatus {
  readonly configured: boolean
  readonly contributionCount: number
  readonly diagnosticCount: number
  readonly byDomain: WanexAppShellExtensionDomainCounts
}

export interface WanexAppShellExtensionDomainCounts {
  readonly instruction: number
  readonly skill: number
  readonly command: number
  readonly agent: number
  readonly tool: number
  readonly providerCatalog: number
  readonly lifecycleHook: number
}

export interface WanexAppShellExtensionReadModel {
  readonly configured: boolean
  readonly counts: WanexAppShellExtensionDomainCounts
  readonly contributions: readonly WanexAppShellExtensionContributionRow[]
  readonly commands: readonly WanexAppShellCommandContributionRow[]
  readonly agents: readonly WanexAppShellAgentContributionRow[]
  readonly tools: readonly WanexAppShellToolContributionRow[]
  readonly providerCatalog: readonly WanexAppShellProviderCatalogContributionRow[]
  readonly lifecycleHooks: readonly WanexAppShellLifecycleHookContributionRow[]
  readonly diagnostics: readonly WanexAppShellExtensionDiagnosticRow[]
}

export interface WanexAppShellExtensionContributionRow {
  readonly id: string
  readonly domain: AppExtensionContributionDomain
  readonly sourceKind: AppExtensionSourceKind
  readonly sourceScope: AppExtensionSourceScope
  readonly sourceId: string
  readonly trust: AppExtensionTrustLevel
  readonly priority: number
  readonly order: number
  readonly privileged: boolean
  readonly label: string
  readonly diagnosticCodes: readonly AppExtensionDiagnosticCode[]
}

export interface WanexAppShellCommandContributionRow
  extends WanexAppShellExtensionContributionRow {
  readonly domain: "command"
  readonly name: string
  readonly title: string
  readonly aliases: readonly string[]
  readonly category?: string
  readonly handlerRef: string
}

export interface WanexAppShellAgentContributionRow
  extends WanexAppShellExtensionContributionRow {
  readonly domain: "agent"
  readonly name: string
  readonly title?: string
  readonly providerProfileId?: string
  readonly modelId?: string
  readonly instructionRefs: readonly string[]
  readonly skillRefs: readonly string[]
  readonly toolRefs: readonly string[]
}

export interface WanexAppShellToolContributionRow
  extends WanexAppShellExtensionContributionRow {
  readonly domain: "tool"
  readonly name: string
  readonly permission?: "read" | "write" | "network" | "external"
  readonly handlerRef: string
}

export interface WanexAppShellProviderCatalogContributionRow
  extends WanexAppShellExtensionContributionRow {
  readonly domain: "provider_catalog"
  readonly providerId: string
  readonly modelIds: readonly string[]
  readonly defaultModelId?: string
  readonly defaultProfileId?: string
}

export interface WanexAppShellLifecycleHookContributionRow
  extends WanexAppShellExtensionContributionRow {
  readonly domain: "lifecycle_hook"
  readonly event: string
  readonly handlerRef: string
}

export interface WanexAppShellExtensionDiagnosticRow {
  readonly code: AppExtensionDiagnosticCode
  readonly severity: "info" | "warning" | "error"
  readonly message: string
  readonly contributionId?: string
  readonly domain?: string
  readonly sourceId?: string
}
