import type { SchedulerJobRecord } from "@wanex/protocol"
import type { AppActivityEntry, AppDiagnosticEntry } from "./diagnostics-types.js"
import type { MutableMemoryMaintenanceDiagnosticsSummary } from "./memory-diagnostics-summary.js"

export function projectJobDiagnostics(request: {
  readonly diagnostics: AppDiagnosticEntry[]
  readonly activity: AppActivityEntry[]
  readonly generatedAt: number
  readonly jobs: readonly SchedulerJobRecord[]
  readonly summary: MutableMemoryMaintenanceDiagnosticsSummary
}): void {
  const pendingJobs = request.jobs.filter((job) =>
    ["pending", "ready", "retry_scheduled"].includes(job.state)
  )
  const runningJobs = request.jobs.filter((job) => job.state === "running")
  const failedJobs = request.jobs.filter((job) => job.state === "failed")

  request.summary.pendingJobCount = pendingJobs.length
  request.summary.runningJobCount = runningJobs.length
  request.summary.failedJobCount = failedJobs.length

  if (pendingJobs.length > 0) {
    pushAggregateJobDiagnostic({
      diagnostics: request.diagnostics,
      activity: request.activity,
      generatedAt: request.generatedAt,
      code: "memory.maintenance.backlog.ready",
      severity: "warning",
      message: "Memory maintenance has ready compaction backlog",
      jobs: pendingJobs
    })
  }
  if (runningJobs.length > 0) {
    pushAggregateJobDiagnostic({
      diagnostics: request.diagnostics,
      activity: request.activity,
      generatedAt: request.generatedAt,
      code: "memory.maintenance.backlog.running",
      severity: "info",
      message: "Memory maintenance compaction jobs are running",
      jobs: runningJobs
    })
  }
  if (failedJobs.length > 0) {
    pushAggregateJobDiagnostic({
      diagnostics: request.diagnostics,
      activity: request.activity,
      generatedAt: request.generatedAt,
      code: "memory.maintenance.job.failed",
      severity: "error",
      message: "Memory maintenance compaction jobs failed",
      jobs: failedJobs
    })
  }
}

function pushAggregateJobDiagnostic(request: {
  readonly diagnostics: AppDiagnosticEntry[]
  readonly activity: AppActivityEntry[]
  readonly generatedAt: number
  readonly code: string
  readonly severity: AppDiagnosticEntry["severity"]
  readonly message: string
  readonly jobs: readonly SchedulerJobRecord[]
}): void {
  const at = request.jobs.reduce(
    (max, job) => Math.max(max, job.updatedAt),
    request.generatedAt
  )
  const detail = {
    count: request.jobs.length,
    jobIds: request.jobs.map((job) => job.id)
  }
  request.diagnostics.push({
    id: request.code,
    source: "memory",
    severity: request.severity,
    code: request.code,
    message: request.message,
    at,
    detail
  })
  request.activity.push({
    id: `activity:${request.code}`,
    source: "memory",
    severity: request.severity,
    message: request.message,
    at,
    detail
  })
}
