import type {
  AppActivityEntry,
  AppDiagnosticEntry,
  AppDiagnosticSeverity,
  AppDiagnosticSource,
  AppDiagnosticsSnapshot
} from "@wanex/app/diagnostics"
import type {
  ProductAppBackendDiagnosticsDetailOptions,
  ProductAppBackendDiagnosticsDetailReadModel,
  ProductAppBackendDiagnosticsSourceSummary
} from "./types.js"

export interface ReadProductAppBackendDiagnosticsDetailHost {
  readDiagnostics(
    options?: ProductAppBackendDiagnosticsDetailOptions
  ): Promise<AppDiagnosticsSnapshot>
}

const defaultDiagnosticLimit = 20
const defaultActivityLimit = 20

export async function readProductAppBackendDiagnosticsDetail(
  host: ReadProductAppBackendDiagnosticsDetailHost,
  options: ProductAppBackendDiagnosticsDetailOptions = {}
): Promise<ProductAppBackendDiagnosticsDetailReadModel> {
  const diagnostics = await host.readDiagnostics(options)
  const diagnosticLimit = options.diagnosticLimit ?? defaultDiagnosticLimit
  const activityLimit = options.activityLimit ?? defaultActivityLimit
  return {
    kind: "product-app.backend.diagnostics-detail",
    generatedAt: diagnostics.generatedAt,
    summary: {
      totalCount: diagnostics.diagnostics.length,
      errorCount: countSeverity(diagnostics.diagnostics, "error"),
      warningCount: countSeverity(diagnostics.diagnostics, "warning"),
      infoCount: countSeverity(diagnostics.diagnostics, "info"),
      activityCount: diagnostics.activity.length
    },
    sources: summarizeSources(diagnostics),
    diagnostics: diagnostics.diagnostics
      .slice(0, Math.max(0, diagnosticLimit))
      .map((item) => ({
        id: item.id,
        source: item.source,
        severity: item.severity,
        code: item.code,
        message: item.message,
        at: item.at,
        hasDetail: item.detail !== undefined
      })),
    activity: diagnostics.activity
      .slice(0, Math.max(0, activityLimit))
      .map((item) => ({
        id: item.id,
        source: item.source,
        severity: item.severity,
        message: item.message,
        at: item.at,
        hasDetail: item.detail !== undefined
      })),
    limits: {
      diagnosticLimit,
      activityLimit
    }
  }
}

function summarizeSources(
  snapshot: AppDiagnosticsSnapshot
): readonly ProductAppBackendDiagnosticsSourceSummary[] {
  const summaries = new Map<AppDiagnosticSource, MutableSourceSummary>()
  for (const diagnostic of snapshot.diagnostics) {
    const summary = ensureSourceSummary(summaries, diagnostic.source)
    summary.totalCount += 1
    incrementSeverity(summary, diagnostic.severity)
  }
  for (const activity of snapshot.activity) {
    const summary = ensureSourceSummary(summaries, activity.source)
    summary.activityCount += 1
  }
  return [...summaries.values()]
    .sort((left, right) => left.source.localeCompare(right.source))
    .map((summary) => ({
      source: summary.source,
      totalCount: summary.totalCount,
      errorCount: summary.errorCount,
      warningCount: summary.warningCount,
      infoCount: summary.infoCount,
      activityCount: summary.activityCount
    }))
}

interface MutableSourceSummary {
  readonly source: AppDiagnosticSource
  totalCount: number
  errorCount: number
  warningCount: number
  infoCount: number
  activityCount: number
}

function ensureSourceSummary(
  summaries: Map<AppDiagnosticSource, MutableSourceSummary>,
  source: AppDiagnosticSource
): MutableSourceSummary {
  const existing = summaries.get(source)
  if (existing !== undefined) {
    return existing
  }
  const created: MutableSourceSummary = {
    source,
    totalCount: 0,
    errorCount: 0,
    warningCount: 0,
    infoCount: 0,
    activityCount: 0
  }
  summaries.set(source, created)
  return created
}

function countSeverity(
  diagnostics: readonly AppDiagnosticEntry[],
  severity: AppDiagnosticSeverity
): number {
  return diagnostics.filter((item) => item.severity === severity).length
}

function incrementSeverity(
  summary: MutableSourceSummary,
  severity: AppDiagnosticSeverity
): void {
  switch (severity) {
    case "error":
      summary.errorCount += 1
      return
    case "warning":
      summary.warningCount += 1
      return
    case "info":
      summary.infoCount += 1
      return
  }
}
