import type {
  AppExtensionContributionDomain,
  AppExtensionDiagnosticCode,
  AppExtensionResolvedSnapshot,
  AppExtensionSourceKind,
  AppExtensionSourceScope,
  AppExtensionTrustLevel
} from "@wanex/extension"

export interface WanexAppExtensionOptions {
  readonly snapshot: AppExtensionResolvedSnapshot
}

export interface WanexAppExtensionStatus {
  readonly configured: boolean
  readonly contributionCount: number
  readonly diagnosticCount: number
  readonly byDomain: WanexAppExtensionDomainCounts
}

export interface WanexAppExtensionDomainCounts {
  readonly instruction: number
  readonly skill: number
  readonly command: number
  readonly agent: number
  readonly tool: number
  readonly providerCatalog: number
  readonly lifecycleHook: number
}

export interface WanexAppExtensionReadModel {
  readonly configured: boolean
  readonly counts: WanexAppExtensionDomainCounts
  readonly contributions: readonly WanexAppExtensionContributionRow[]
  readonly commands: readonly WanexAppCommandContributionRow[]
  readonly agents: readonly WanexAppAgentContributionRow[]
  readonly tools: readonly WanexAppToolContributionRow[]
  readonly providerCatalog: readonly WanexAppProviderCatalogContributionRow[]
  readonly lifecycleHooks: readonly WanexAppLifecycleHookContributionRow[]
  readonly diagnostics: readonly WanexAppExtensionDiagnosticRow[]
}

export interface WanexAppExtensionContributionRow {
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

export interface WanexAppCommandContributionRow
  extends WanexAppExtensionContributionRow {
  readonly domain: "command"
  readonly name: string
  readonly title: string
  readonly aliases: readonly string[]
  readonly category?: string
  readonly handlerRef: string
}

export interface WanexAppAgentContributionRow
  extends WanexAppExtensionContributionRow {
  readonly domain: "agent"
  readonly name: string
  readonly title?: string
  readonly providerProfileId?: string
  readonly modelId?: string
  readonly instructionRefs: readonly string[]
  readonly skillRefs: readonly string[]
  readonly toolRefs: readonly string[]
}

export interface WanexAppToolContributionRow
  extends WanexAppExtensionContributionRow {
  readonly domain: "tool"
  readonly name: string
  readonly permission?: "read" | "write" | "network" | "external"
  readonly handlerRef: string
}

export interface WanexAppProviderCatalogContributionRow
  extends WanexAppExtensionContributionRow {
  readonly domain: "provider_catalog"
  readonly providerId: string
  readonly modelIds: readonly string[]
  readonly defaultModelId?: string
  readonly defaultProfileId?: string
}

export interface WanexAppLifecycleHookContributionRow
  extends WanexAppExtensionContributionRow {
  readonly domain: "lifecycle_hook"
  readonly event: string
  readonly handlerRef: string
}

export interface WanexAppExtensionDiagnosticRow {
  readonly code: AppExtensionDiagnosticCode
  readonly severity: "info" | "warning" | "error"
  readonly message: string
  readonly contributionId?: string
  readonly domain?: string
  readonly sourceId?: string
}
