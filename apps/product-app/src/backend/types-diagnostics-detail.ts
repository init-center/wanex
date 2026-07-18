import type {
  AppDiagnosticSeverity,
  AppDiagnosticSource
} from "@wanex/app/diagnostics"
import type {
  ProductAppBackendDiagnosticsOptions
} from "./types-app.js"

export interface ProductAppBackendDiagnosticsDetailCommands {
  readProductDiagnosticsDetail(
    options?: ProductAppBackendDiagnosticsDetailOptions
  ): Promise<ProductAppBackendDiagnosticsDetailReadModel>
}

export interface ProductAppBackendDiagnosticsDetailOptions
  extends ProductAppBackendDiagnosticsOptions {
  readonly diagnosticLimit?: number
  readonly activityLimit?: number
}

export interface ProductAppBackendDiagnosticsDetailReadModel {
  readonly kind: "product-app.backend.diagnostics-detail"
  readonly generatedAt: number
  readonly summary: ProductAppBackendDiagnosticsDetailSummary
  readonly sources: readonly ProductAppBackendDiagnosticsSourceSummary[]
  readonly diagnostics: readonly ProductAppBackendDiagnosticsDetailRow[]
  readonly activity: readonly ProductAppBackendDiagnosticsActivityRow[]
  readonly limits: ProductAppBackendDiagnosticsDetailLimits
}

export interface ProductAppBackendDiagnosticsDetailSummary {
  readonly totalCount: number
  readonly errorCount: number
  readonly warningCount: number
  readonly infoCount: number
  readonly activityCount: number
}

export interface ProductAppBackendDiagnosticsSourceSummary {
  readonly source: AppDiagnosticSource
  readonly totalCount: number
  readonly errorCount: number
  readonly warningCount: number
  readonly infoCount: number
  readonly activityCount: number
}

export interface ProductAppBackendDiagnosticsDetailRow {
  readonly id: string
  readonly source: AppDiagnosticSource
  readonly severity: AppDiagnosticSeverity
  readonly code: string
  readonly message: string
  readonly at: number
  readonly hasDetail: boolean
}

export interface ProductAppBackendDiagnosticsActivityRow {
  readonly id: string
  readonly source: AppDiagnosticSource
  readonly severity: AppDiagnosticSeverity
  readonly message: string
  readonly at: number
  readonly hasDetail: boolean
}

export interface ProductAppBackendDiagnosticsDetailLimits {
  readonly diagnosticLimit: number
  readonly activityLimit: number
}
