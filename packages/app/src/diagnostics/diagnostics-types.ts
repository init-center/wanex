import type { JsonValue, SchedulerJobRecord } from "@wanex/protocol"

export type AppDiagnosticSource =
  | "connector"
  | "config"
  | "memory"
  | "scheduler"
  | "workspace"
  | "plugin"
  | "team"
  | "app"

export type AppDiagnosticSeverity = "info" | "warning" | "error"

export interface AppDiagnosticEntry {
  readonly id: string
  readonly source: AppDiagnosticSource
  readonly severity: AppDiagnosticSeverity
  readonly code: string
  readonly message: string
  readonly at: number
  readonly detail?: JsonValue
}

export interface AppActivityEntry {
  readonly id: string
  readonly source: AppDiagnosticSource
  readonly severity: AppDiagnosticSeverity
  readonly message: string
  readonly at: number
  readonly detail?: JsonValue
}

export interface AppDiagnosticsSnapshot {
  readonly generatedAt: number
  readonly diagnostics: readonly AppDiagnosticEntry[]
  readonly activity: readonly AppActivityEntry[]
}

export type JobDiagnosticDetailMode = "summary" | "raw"

export interface BuildAppDiagnosticsSnapshotInput {
  readonly connectorDiagnostics?: readonly BaseConnectorDiagnostic[]
  readonly connectorActivity?: readonly BaseConnectorActivityEntry[]
  readonly config?: readonly BaseConfigUpdatedPayload[]
  readonly jobs?: readonly SchedulerJobRecord[]
  readonly jobDetailMode?: JobDiagnosticDetailMode
  readonly memoryMaintenance?: {
    readonly diagnostics?: readonly AppDiagnosticEntry[]
    readonly activity?: readonly AppActivityEntry[]
  }
  readonly workspaceApplyPlan?: BaseWorkspaceApplyPlan
  readonly teamRound?: BaseTeamRoundResult
  readonly runtimeHost?: BaseRuntimeHostJobSummary
  readonly runtimeHostHealth?: BaseRuntimeHostHealthSnapshot
  readonly plugin?: {
    readonly manifests?: readonly BasePluginStateRecord[]
    readonly installs?: readonly BasePluginStateRecord[]
  }
  readonly now?: number
}

export interface BaseConnectorDiagnostic {
  readonly code: string
  readonly severity: AppDiagnosticSeverity
  readonly message: string
  readonly at: number
  readonly detail?: JsonValue
}

export interface BaseConnectorActivityEntry {
  readonly id: string
  readonly severity: AppDiagnosticSeverity
  readonly message: string
  readonly at: number
  readonly detail?: JsonValue
}

export interface BaseConfigUpdatedPayload {
  readonly key: string
  readonly updatedAt: number
}

export interface BasePluginStateRecord {
  readonly id: string
  readonly pluginId: string
  readonly version: string
  readonly state: string
  readonly updatedAt: number
}

export interface BaseWorkspaceApplyPlan {
  readonly status?: string
  readonly orderedProposalIds?: readonly string[]
  readonly items: readonly BaseWorkspaceApplyPlanItem[]
}

export interface BaseWorkspaceApplyPlanItem {
  readonly proposalId: string
  readonly changeSetId: string
  readonly status: "ready" | "queued" | "needs_review"
  readonly dependsOn: readonly string[]
  readonly paths: readonly string[]
  readonly conflicts: readonly BaseWorkspaceApplyConflict[]
}

export interface BaseWorkspaceApplyConflict {
  readonly path: string
  readonly reason: string
  readonly conflictingProposalId?: string
  readonly conflictingChangeSetId?: string
}

export interface BaseTeamRoundResult {
  readonly conversation: {
    readonly id: string
  }
  readonly stopReason: string
  readonly turns: readonly unknown[]
}

export interface BaseRuntimeHostJobSummary {
  readonly generatedAt: number
  readonly host: {
    readonly started: boolean
    readonly workerCount: number
    readonly memoryWorkerCount: number
  }
  readonly totalJobs: number
  readonly stateCounts: readonly BaseRuntimeHostJobStateCount[]
  readonly kindCounts: readonly BaseRuntimeHostJobKindCount[]
  readonly backlogByKind: readonly BaseRuntimeHostJobKindCount[]
  readonly retryingByKind: readonly BaseRuntimeHostJobKindCount[]
  readonly failedByKind: readonly BaseRuntimeHostJobKindCount[]
  readonly runningLeases: readonly BaseRuntimeHostRunningLeaseSummary[]
  readonly staleRunningLeases: readonly BaseRuntimeHostRunningLeaseSummary[]
}

export interface BaseRuntimeHostJobStateCount {
  readonly state: string
  readonly count: number
}

export interface BaseRuntimeHostJobKindCount {
  readonly kind: string
  readonly count: number
}

export interface BaseRuntimeHostRunningLeaseSummary {
  readonly jobId: string
  readonly kind: string
  readonly workerId?: string
  readonly attempt: number
  readonly leaseExpiresAt?: number
  readonly stale: boolean
  readonly remainingLeaseMs?: number
}

export interface BaseRuntimeHostHealthSnapshot {
  readonly generatedAt: number
  readonly started: boolean
  readonly workerCount: number
  readonly memoryWorkerCount: number
  readonly loopCount: number
  readonly activeLoopCount: number
  readonly stoppedLoopCount: number
  readonly loops: readonly BaseRuntimeHostLoopHealth[]
}

export interface BaseRuntimeHostLoopHealth {
  readonly id: string
  readonly kind: "agent" | "memory"
  readonly index: number
  readonly startedAt: number
  readonly stopped: boolean
  readonly runCount: number
  readonly idleCount: number
  readonly completedCount: number
  readonly failedCount: number
  readonly errorCount: number
  readonly lastResultStatus?: "idle" | "completed" | "failed"
  readonly lastResultAt?: number
  readonly lastErrorAt?: number
}
