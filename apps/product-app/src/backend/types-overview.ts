import type {
  AppDiagnosticSeverity,
  AppDiagnosticSource
} from "@wanex/app/diagnostics"
import type {
  AppExtensionSourceKind,
  AppExtensionTrustLevel
} from "@wanex/extension"
import type {
  ProductAppBackendCapabilityId
} from "./types-capability.js"
import type {
  ProductAppBackendDiagnosticsOptions,
  ProductAppBackendExtensionStatus
} from "./types-app.js"
import type {
  ProductAppBackendRecentSessionRow
} from "./types-read-model.js"

export interface ProductAppBackendOverviewCommands {
  readProductOverview(
    options?: ProductAppBackendOverviewOptions
  ): Promise<ProductAppBackendOverviewReadModel>
}

export interface ProductAppBackendOverviewOptions
  extends ProductAppBackendDiagnosticsOptions {
  readonly recentSessionLimit?: number
}

export interface ProductAppBackendOverviewReadModel {
  readonly kind: "product-app.backend.overview"
  readonly generatedAt: number
  readonly ready: boolean
  readonly lifecycle: ProductAppBackendOverviewLifecycle
  readonly runtimeHost: ProductAppBackendOverviewRuntimeHost
  readonly provider: ProductAppBackendOverviewProvider
  readonly context: ProductAppBackendOverviewContext
  readonly extensions: ProductAppBackendOverviewExtensions
  readonly capabilities: ProductAppBackendOverviewCapabilities
  readonly commands: ProductAppBackendOverviewCommandsSummary
  readonly sessions: ProductAppBackendOverviewSessions
  readonly recommendedActions: readonly ProductAppBackendOverviewAction[]
  readonly diagnostics: ProductAppBackendOverviewDiagnosticsSummary
}

export interface ProductAppBackendOverviewLifecycle {
  readonly disposed: boolean
  readonly ready: boolean
  readonly shutdownCommandId: string
}

export interface ProductAppBackendOverviewRuntimeHost {
  readonly observed: boolean
  readonly started: boolean
  readonly workerCount: number
  readonly memoryWorkerCount: number
  readonly totalJobs: number
  readonly backlogCount: number
  readonly runningLeaseCount: number
  readonly staleRunningLeaseCount: number
  readonly loopCount: number
  readonly activeLoopCount: number
  readonly stoppedLoopCount: number
  readonly runCount: number
  readonly failureCount: number
  readonly errorCount: number
  readonly attentionRequired: boolean
}

export interface ProductAppBackendOverviewProvider {
  readonly configuredProfileId: string
  readonly activeProfileId: string
}

export interface ProductAppBackendOverviewContext {
  readonly configured: boolean
  readonly revision: number
  readonly monitorRunning: boolean
  readonly monitorIntervalMs: number
  readonly refreshCount: number
  readonly instructionSources: number
  readonly skillCount: number
  readonly activationToolRegistered: boolean
}

export interface ProductAppBackendOverviewExtensions {
  readonly configured: boolean
  readonly contributionCount: number
  readonly diagnosticCount: number
  readonly byDomain: ProductAppBackendExtensionStatus["byDomain"]
}

export interface ProductAppBackendOverviewCapabilities {
  readonly selectedCount: number
  readonly notSelectedCount: number
  readonly selectedIds: readonly ProductAppBackendCapabilityId[]
  readonly notSelectedIds: readonly ProductAppBackendCapabilityId[]
}

export interface ProductAppBackendOverviewCommandsSummary {
  readonly totalCount: number
  readonly builtinCount: number
  readonly extensionCount: number
  readonly diagnosticCount: number
  readonly categories: readonly ProductAppBackendOverviewCommandCategorySummary[]
  readonly primary: readonly ProductAppBackendOverviewCommandRow[]
}

export interface ProductAppBackendOverviewCommandCategorySummary {
  readonly category: string
  readonly count: number
}

export interface ProductAppBackendOverviewCommandRow {
  readonly id: string
  readonly title: string
  readonly sourceKind: AppExtensionSourceKind
  readonly trust: AppExtensionTrustLevel
  readonly category?: string
}

export interface ProductAppBackendOverviewSessions {
  readonly recentCount: number
  readonly recentLimit: number
  readonly recent: readonly ProductAppBackendOverviewSessionRow[]
}

export interface ProductAppBackendOverviewSessionRow {
  readonly sessionId: string
  readonly title?: string
  readonly kind: ProductAppBackendRecentSessionRow["kind"]
  readonly status: ProductAppBackendRecentSessionRow["status"]
  readonly createdAt: number
  readonly updatedAt: number
  readonly archivedAt?: number
}

export interface ProductAppBackendOverviewAction {
  readonly id: string
  readonly commandId: string
  readonly label: string
  readonly priority: number
  readonly reason:
    | "ready"
    | "diagnostic_attention"
    | "runtime_attention"
    | "context_not_configured"
    | "no_recent_sessions"
}

export interface ProductAppBackendOverviewDiagnosticsSummary {
  readonly generatedAt: number
  readonly totalCount: number
  readonly errorCount: number
  readonly warningCount: number
  readonly infoCount: number
  readonly activityCount: number
  readonly top: readonly ProductAppBackendOverviewDiagnosticRow[]
}

export interface ProductAppBackendOverviewDiagnosticRow {
  readonly source: AppDiagnosticSource
  readonly severity: AppDiagnosticSeverity
  readonly code: string
  readonly message: string
}
