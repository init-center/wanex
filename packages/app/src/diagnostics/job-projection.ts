import type { JsonValue, SchedulerJobRecord } from "@wanex/protocol"
import type {
  AppActivityEntry,
  AppDiagnosticEntry,
  AppDiagnosticSeverity,
  AppDiagnosticSource,
  JobDiagnosticDetailMode
} from "./diagnostics-types.js"

export function schedulerJobProjection(
  job: SchedulerJobRecord,
  detailMode: JobDiagnosticDetailMode
): {
  readonly diagnostic: AppDiagnosticEntry
  readonly activity: AppActivityEntry
} {
  return {
    diagnostic: jobDiagnostic({
      job,
      source: "scheduler",
      codePrefix: "scheduler.job",
      messagePrefix: "Scheduler job",
      detailMode
    }),
    activity: jobActivity({
      job,
      source: "scheduler",
      messagePrefix: "Scheduler job"
    })
  }
}

export function memoryJobProjection(
  job: SchedulerJobRecord,
  detailMode: JobDiagnosticDetailMode
): {
  readonly diagnostic: AppDiagnosticEntry
  readonly activity: AppActivityEntry
} {
  return {
    diagnostic: jobDiagnostic({
      job,
      source: "memory",
      codePrefix: "memory.compaction",
      messagePrefix: "Memory compaction",
      detailMode
    }),
    activity: jobActivity({
      job,
      source: "memory",
      messagePrefix: "Memory compaction"
    })
  }
}

function jobDiagnostic(request: {
  readonly job: SchedulerJobRecord
  readonly source: AppDiagnosticSource
  readonly codePrefix: string
  readonly messagePrefix: string
  readonly detailMode: JobDiagnosticDetailMode
}): AppDiagnosticEntry {
  const { job } = request
  const severity: AppDiagnosticSeverity =
    job.state === "failed" ? "error" : job.state === "retry_scheduled" ? "warning" : "info"
  return {
    id: `${request.source}-job:${job.id}`,
    source: request.source,
    severity,
    code: `${request.codePrefix}.${job.state}`,
    message: `${request.messagePrefix} ${job.state}`,
    at: job.updatedAt,
    detail: jobDetail(job, request.detailMode)
  }
}

function jobActivity(request: {
  readonly job: SchedulerJobRecord
  readonly source: AppDiagnosticSource
  readonly messagePrefix: string
}): AppActivityEntry {
  const { job } = request
  return {
    id: `${request.source}-job-activity:${job.id}`,
    source: request.source,
    severity:
      job.state === "failed"
        ? "error"
        : job.state === "retry_scheduled"
          ? "warning"
          : "info",
    message: `${request.messagePrefix} ${job.state}`,
    at: job.updatedAt,
    detail: {
      jobId: job.id,
      kind: job.kind,
      state: job.state,
      attempt: job.attempt
    }
  }
}

function jobDetail(
  job: SchedulerJobRecord,
  mode: JobDiagnosticDetailMode
): JsonValue {
  const detail: { [key: string]: JsonValue } = {
    id: job.id,
    kind: job.kind,
    state: job.state,
    principalId: job.principalId,
    attempt: job.attempt,
    maxAttempts: job.maxAttempts,
    priority: job.priority,
    scheduledAt: job.scheduledAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    retryPolicy: {
      strategy: job.retryPolicy.strategy,
      ...(job.retryPolicy.initialDelayMs === undefined
        ? {}
        : { initialDelayMs: job.retryPolicy.initialDelayMs }),
      ...(job.retryPolicy.maxDelayMs === undefined
        ? {}
        : { maxDelayMs: job.retryPolicy.maxDelayMs })
    }
  }
  if (job.notBefore !== undefined) {
    detail.notBefore = job.notBefore
  }
  if (job.budgetGrantId !== undefined) {
    detail.budgetGrantId = job.budgetGrantId
  }
  if (job.leaseOwner !== undefined) {
    detail.leaseOwner = job.leaseOwner
  }
  if (job.leaseExpiresAt !== undefined) {
    detail.leaseExpiresAt = job.leaseExpiresAt
  }
  if (job.finishedAt !== undefined) {
    detail.finishedAt = job.finishedAt
  }
  if (mode === "raw") {
    detail.payload = job.payload
    if (job.result !== undefined) {
      detail.result = job.result
    }
    if (job.lastError !== undefined) {
      detail.lastError = job.lastError
    }
    return detail
  }
  detail.payloadSummary = summarizeJson(job.payload)
  if (job.result !== undefined) {
    detail.resultSummary = summarizeJson(job.result)
  }
  if (job.lastError !== undefined) {
    detail.lastErrorSummary = summarizeJson(job.lastError)
  }
  return detail
}

function summarizeJson(value: JsonValue): JsonValue {
  if (value === null) {
    return { kind: "null" }
  }
  if (Array.isArray(value)) {
    return {
      kind: "array",
      length: value.length
    }
  }
  switch (typeof value) {
    case "string":
      return {
        kind: "string",
        length: value.length
      }
    case "number":
      return {
        kind: "number"
      }
    case "boolean":
      return {
        kind: "boolean"
      }
    case "object":
      return {
        kind: "object",
        keyCount: Object.keys(value).length
      }
  }
}
