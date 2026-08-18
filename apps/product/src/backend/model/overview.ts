import type {
  AppDiagnosticSeverity,
  AppDiagnosticSource
} from "@wanex/app/diagnostics"
import type {
  AppExtensionSourceKind,
  AppExtensionTrustLevel
} from "@wanex/extension"
import type {
  BackendCapabilityId
} from "./capability.js"
import type {
  BackendDiagnosticsOptions,
  BackendExtensionStatus
} from "./app.js"
import type {
  BackendRecentSessionRow
} from "./read-model.js"

export interface BackendOverviewCommands {
  readProductOverview(
    options?: BackendOverviewOptions
  ): Promise<BackendOverviewReadModel>
}

export interface BackendOverviewOptions
  extends BackendDiagnosticsOptions {
  readonly recentSessionLimit?: number
}

export interface BackendOverviewReadModel {
  readonly kind: "product.backend.overview"
  readonly generatedAt: number
  readonly ready: boolean
  readonly lifecycle: BackendOverviewLifecycle
  readonly runtimeHost: BackendOverviewRuntimeHost
  readonly provider: BackendOverviewProvider
  readonly context: BackendOverviewContext
  readonly extensions: BackendOverviewExtensions
  readonly capabilities: BackendOverviewCapabilities
  readonly commands: BackendOverviewCommandsSummary
  readonly sessions: BackendOverviewSessions
  readonly recommendedActions: readonly BackendOverviewAction[]
  readonly diagnostics: BackendOverviewDiagnosticsSummary
}

export interface BackendOverviewLifecycle {
  readonly disposed: boolean
  readonly ready: boolean
  readonly shutdownCommandId: string
}

export interface BackendOverviewRuntimeHost {
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

export interface BackendOverviewProvider {
  readonly activeEndpointId?: string
}

export interface BackendOverviewContext {
  readonly configured: boolean
  readonly revision: number
  readonly monitorRunning: boolean
  readonly monitorIntervalMs: number
  readonly refreshCount: number
  readonly instructionSources: number
  readonly skillCount: number
  readonly activationToolRegistered: boolean
}

export interface BackendOverviewExtensions {
  readonly configured: boolean
  readonly contributionCount: number
  readonly diagnosticCount: number
  readonly byDomain: BackendExtensionStatus["byDomain"]
}

export interface BackendOverviewCapabilities {
  readonly selectedCount: number
  readonly notSelectedCount: number
  readonly selectedIds: readonly BackendCapabilityId[]
  readonly notSelectedIds: readonly BackendCapabilityId[]
}

export interface BackendOverviewCommandsSummary {
  readonly totalCount: number
  readonly builtinCount: number
  readonly extensionCount: number
  readonly diagnosticCount: number
  readonly categories: readonly BackendOverviewCommandCategorySummary[]
  readonly primary: readonly BackendOverviewCommandRow[]
}

export interface BackendOverviewCommandCategorySummary {
  readonly category: string
  readonly count: number
}

export interface BackendOverviewCommandRow {
  readonly id: string
  readonly title: string
  readonly sourceKind: AppExtensionSourceKind
  readonly trust: AppExtensionTrustLevel
  readonly category?: string
}

export interface BackendOverviewSessions {
  readonly recentCount: number
  readonly recentLimit: number
  readonly recent: readonly BackendOverviewSessionRow[]
  readonly archivedCount: number
  readonly archived: readonly BackendOverviewSessionRow[]
}

export interface BackendOverviewSessionRow {
  readonly sessionId: string
  readonly title?: string
  readonly kind: BackendRecentSessionRow["kind"]
  readonly status: BackendRecentSessionRow["status"]
  readonly revision: number
  readonly createdAt: number
  readonly updatedAt: number
  readonly archivedAt?: number
}

export interface BackendOverviewAction {
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

export interface BackendOverviewDiagnosticsSummary {
  readonly generatedAt: number
  readonly totalCount: number
  readonly errorCount: number
  readonly warningCount: number
  readonly infoCount: number
  readonly activityCount: number
  readonly top: readonly BackendOverviewDiagnosticRow[]
}

export interface BackendOverviewDiagnosticRow {
  readonly source: AppDiagnosticSource
  readonly severity: AppDiagnosticSeverity
  readonly code: string
  readonly message: string
}
