import type { JsonValue } from "@wanex/protocol"
import type {
  AppActivityEntry,
  AppDiagnosticEntry,
  BaseRuntimeHostJobSummary,
  BaseRuntimeHostRunningLeaseSummary
} from "./diagnostics-types.js"

export function runtimeHostProjection(summary: BaseRuntimeHostJobSummary): {
  readonly diagnostics: readonly AppDiagnosticEntry[]
  readonly activity: readonly AppActivityEntry[]
} {
  const diagnostics: AppDiagnosticEntry[] = [
    {
      id: "runtime-host:summary",
      source: "app",
      severity: summary.staleRunningLeases.length > 0 ? "warning" : "info",
      code:
        summary.staleRunningLeases.length > 0
          ? "app.runtime_host.lease_stale"
          : "app.runtime_host.summary",
      message:
        summary.staleRunningLeases.length > 0
          ? "Runtime host has stale running job leases"
          : "Runtime host job summary",
      at: summary.generatedAt,
      detail: runtimeHostSummaryDetail(summary)
    }
  ]
  if (summary.failedByKind.length > 0) {
    diagnostics.push({
      id: "runtime-host:failed-jobs",
      source: "app",
      severity: "error",
      code: "app.runtime_host.jobs_failed",
      message: "Runtime host has failed jobs",
      at: summary.generatedAt,
      detail: {
        failedByKind: summary.failedByKind.map((item) => ({
          kind: item.kind,
          count: item.count
        }))
      }
    })
  }
  if (summary.backlogByKind.length > 0) {
    diagnostics.push({
      id: "runtime-host:backlog-jobs",
      source: "app",
      severity: "warning",
      code: "app.runtime_host.backlog",
      message: "Runtime host has queued job backlog",
      at: summary.generatedAt,
      detail: {
        backlogByKind: summary.backlogByKind.map((item) => ({
          kind: item.kind,
          count: item.count
        }))
      }
    })
  }
  if (summary.retryingByKind.length > 0) {
    diagnostics.push({
      id: "runtime-host:retrying-jobs",
      source: "app",
      severity: "warning",
      code: "app.runtime_host.jobs_retrying",
      message: "Runtime host has retrying jobs",
      at: summary.generatedAt,
      detail: {
        retryingByKind: summary.retryingByKind.map((item) => ({
          kind: item.kind,
          count: item.count
        }))
      }
    })
  }
  return {
    diagnostics,
    activity: [
      {
        id: "runtime-host-activity:summary",
        source: "app",
        severity: summary.staleRunningLeases.length > 0 ? "warning" : "info",
        message: "Runtime host job summary refreshed",
        at: summary.generatedAt,
        detail: {
          started: summary.host.started,
          workerCount: summary.host.workerCount,
          memoryWorkerCount: summary.host.memoryWorkerCount,
          mediaGenerationWorkerCount: summary.host.mediaGenerationWorkerCount,
          totalJobs: summary.totalJobs,
          backlogCount: summary.backlogByKind.reduce(
            (total, item) => total + item.count,
            0
          ),
          runningLeaseCount: summary.runningLeases.length,
          staleRunningLeaseCount: summary.staleRunningLeases.length
        }
      }
    ]
  }
}

function runtimeHostSummaryDetail(summary: BaseRuntimeHostJobSummary): JsonValue {
  return {
    host: {
      started: summary.host.started,
      workerCount: summary.host.workerCount,
      memoryWorkerCount: summary.host.memoryWorkerCount,
      mediaGenerationWorkerCount: summary.host.mediaGenerationWorkerCount
    },
    totalJobs: summary.totalJobs,
    stateCounts: summary.stateCounts.map((item) => ({
      state: item.state,
      count: item.count
    })),
    kindCounts: summary.kindCounts.map((item) => ({
      kind: item.kind,
      count: item.count
    })),
    backlogByKind: summary.backlogByKind.map((item) => ({
      kind: item.kind,
      count: item.count
    })),
    runningLeases: summary.runningLeases.map((lease) =>
      runtimeHostLeaseDetail(lease)
    ),
    staleRunningLeases: summary.staleRunningLeases.map((lease) =>
      runtimeHostLeaseDetail(lease)
    )
  }
}

function runtimeHostLeaseDetail(
  lease: BaseRuntimeHostRunningLeaseSummary
): JsonValue {
  const detail: { [key: string]: JsonValue } = {
    jobId: lease.jobId,
    kind: lease.kind,
    attempt: lease.attempt,
    stale: lease.stale
  }
  if (lease.workerId !== undefined) {
    detail.workerId = lease.workerId
  }
  if (lease.leaseExpiresAt !== undefined) {
    detail.leaseExpiresAt = lease.leaseExpiresAt
  }
  if (lease.remainingLeaseMs !== undefined) {
    detail.remainingLeaseMs = lease.remainingLeaseMs
  }
  return detail
}
