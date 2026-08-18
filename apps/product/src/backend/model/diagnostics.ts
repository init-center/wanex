import type {
  AppDiagnosticSeverity,
  AppDiagnosticSource
} from "@wanex/app/diagnostics"
import type {
  BackendDiagnosticsOptions
} from "./app.js"

export interface BackendDiagnosticsDetailCommands {
  readProductDiagnosticsDetail(
    options?: BackendDiagnosticsDetailOptions
  ): Promise<BackendDiagnosticsDetailReadModel>
}

export interface BackendDiagnosticsDetailOptions
  extends BackendDiagnosticsOptions {
  readonly diagnosticLimit?: number
  readonly activityLimit?: number
}

export interface BackendDiagnosticsDetailReadModel {
  readonly kind: "product.backend.diagnostics-detail"
  readonly generatedAt: number
  readonly summary: BackendDiagnosticsDetailSummary
  readonly sources: readonly BackendDiagnosticsSourceSummary[]
  readonly diagnostics: readonly BackendDiagnosticsDetailRow[]
  readonly activity: readonly BackendDiagnosticsActivityRow[]
  readonly limits: BackendDiagnosticsDetailLimits
}

export interface BackendDiagnosticsDetailSummary {
  readonly totalCount: number
  readonly errorCount: number
  readonly warningCount: number
  readonly infoCount: number
  readonly activityCount: number
}

export interface BackendDiagnosticsSourceSummary {
  readonly source: AppDiagnosticSource
  readonly totalCount: number
  readonly errorCount: number
  readonly warningCount: number
  readonly infoCount: number
  readonly activityCount: number
}

export interface BackendDiagnosticsDetailRow {
  readonly id: string
  readonly source: AppDiagnosticSource
  readonly severity: AppDiagnosticSeverity
  readonly code: string
  readonly message: string
  readonly at: number
  readonly hasDetail: boolean
}

export interface BackendDiagnosticsActivityRow {
  readonly id: string
  readonly source: AppDiagnosticSource
  readonly severity: AppDiagnosticSeverity
  readonly message: string
  readonly at: number
  readonly hasDetail: boolean
}

export interface BackendDiagnosticsDetailLimits {
  readonly diagnosticLimit: number
  readonly activityLimit: number
}
