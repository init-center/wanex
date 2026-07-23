import type {
  SchedulerJobRecord,
  SchedulerJobState
} from "@wanex/protocol"
import type {
  WanexAppExecutionFailureCategory,
  WanexAppExecutionReference,
  WanexAppExecutionReferenceFoundResult,
  WanexAppJobExecutionActivityReadModel,
  WanexAppReadExecutionReferenceRequest
} from "./types-execution-reference.js"

export function normalizeWanexAppExecutionReference(
  request: WanexAppReadExecutionReferenceRequest
): WanexAppExecutionReference {
  return {
    kind: normalizeRequiredString(request.kind, "execution reference kind"),
    id: normalizeRequiredString(request.id, "execution reference id")
  }
}

export function projectWanexAppJobExecutionReference(
  job: SchedulerJobRecord
): WanexAppExecutionReferenceFoundResult {
  return {
    kind: "found",
    reference: {
      kind: "job",
      id: job.id
    },
    activity: projectJobActivity(job)
  }
}

function projectJobActivity(
  job: SchedulerJobRecord
): WanexAppJobExecutionActivityReadModel {
  const failureCategory = projectFailureCategory(job.state)
  return {
    kind: "wanex-app.execution.job",
    jobKind: job.kind,
    state: job.state,
    attempt: job.attempt,
    maxAttempts: job.maxAttempts,
    scheduledAt: job.scheduledAt,
    ...(job.notBefore === undefined ? {} : { notBefore: job.notBefore }),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    ...(job.finishedAt === undefined ? {} : { finishedAt: job.finishedAt }),
    ...(failureCategory === undefined ? {} : { failureCategory })
  }
}

function projectFailureCategory(
  state: SchedulerJobState
): WanexAppExecutionFailureCategory | undefined {
  switch (state) {
    case "retry_scheduled":
      return "retry_pending"
    case "failed":
      return "terminal_failure"
    case "cancelled":
      return "cancelled"
    case "pending":
    case "ready":
    case "running":
    case "succeeded":
      return undefined
  }
}

function normalizeRequiredString(value: string, label: string): string {
  const normalized = value.trim()
  if (normalized.length === 0) {
    throw new Error(`${label} must be a non-empty string`)
  }
  return normalized
}
