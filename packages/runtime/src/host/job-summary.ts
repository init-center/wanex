import type {
  ListJobsRequest,
  SchedulerJobKind,
  SchedulerJobRecord,
  SchedulerJobState
} from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"
import type { RuntimeHostStatus } from "./types.js"

export interface RuntimeHostJobSummaryOptions {
  readonly storage: CoreStore
  readonly status: RuntimeHostStatus
  readonly now?: number
  readonly jobLimit?: number
}

export interface RuntimeHostJobSummary {
  readonly generatedAt: number
  readonly host: RuntimeHostStatus
  readonly totalJobs: number
  readonly stateCounts: readonly RuntimeHostJobStateCount[]
  readonly kindCounts: readonly RuntimeHostJobKindCount[]
  readonly backlogByKind: readonly RuntimeHostJobKindCount[]
  readonly retryingByKind: readonly RuntimeHostJobKindCount[]
  readonly failedByKind: readonly RuntimeHostJobKindCount[]
  readonly runningLeases: readonly RuntimeHostRunningLeaseSummary[]
  readonly staleRunningLeases: readonly RuntimeHostRunningLeaseSummary[]
}

export interface RuntimeHostJobStateCount {
  readonly state: SchedulerJobState
  readonly count: number
}

export interface RuntimeHostJobKindCount {
  readonly kind: SchedulerJobKind
  readonly count: number
}

export interface RuntimeHostRunningLeaseSummary {
  readonly jobId: string
  readonly kind: SchedulerJobKind
  readonly workerId?: string
  readonly attempt: number
  readonly leaseExpiresAt?: number
  readonly stale: boolean
  readonly remainingLeaseMs?: number
}

const jobStates: readonly SchedulerJobState[] = [
  "pending",
  "ready",
  "running",
  "succeeded",
  "retry_scheduled",
  "failed",
  "cancelled"
]

export async function getRuntimeHostJobSummary(
  options: RuntimeHostJobSummaryOptions
): Promise<RuntimeHostJobSummary> {
  const request: ListJobsRequest = {
    limit: options.jobLimit ?? 100
  }
  const jobs = await options.storage.listJobs(request)
  return buildRuntimeHostJobSummary({
    status: options.status,
    jobs,
    ...(options.now === undefined ? {} : { now: options.now })
  })
}

export function buildRuntimeHostJobSummary(options: {
  readonly status: RuntimeHostStatus
  readonly jobs: readonly SchedulerJobRecord[]
  readonly now?: number
}): RuntimeHostJobSummary {
  const generatedAt = options.now ?? Date.now()
  const runningLeases = options.jobs
    .filter((job) => job.state === "running")
    .map((job) => runningLeaseSummary(job, generatedAt))
    .sort((left, right) => left.jobId.localeCompare(right.jobId))
  return {
    generatedAt,
    host: options.status,
    totalJobs: options.jobs.length,
    stateCounts: countByState(options.jobs),
    kindCounts: countByKind(options.jobs),
    backlogByKind: countByKind(
      options.jobs.filter((job) => job.state === "pending" || job.state === "ready")
    ),
    retryingByKind: countByKind(
      options.jobs.filter((job) => job.state === "retry_scheduled")
    ),
    failedByKind: countByKind(options.jobs.filter((job) => job.state === "failed")),
    runningLeases,
    staleRunningLeases: runningLeases.filter((lease) => lease.stale)
  }
}

function countByState(
  jobs: readonly SchedulerJobRecord[]
): RuntimeHostJobStateCount[] {
  const counts = new Map<SchedulerJobState, number>()
  for (const state of jobStates) {
    counts.set(state, 0)
  }
  for (const job of jobs) {
    counts.set(job.state, (counts.get(job.state) ?? 0) + 1)
  }
  return jobStates.map((state) => ({
    state,
    count: counts.get(state) ?? 0
  }))
}

function countByKind(
  jobs: readonly SchedulerJobRecord[]
): RuntimeHostJobKindCount[] {
  const counts = new Map<SchedulerJobKind, number>()
  for (const job of jobs) {
    counts.set(job.kind, (counts.get(job.kind) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([kind, count]) => ({ kind, count }))
    .sort((left, right) => right.count - left.count || left.kind.localeCompare(right.kind))
}

function runningLeaseSummary(
  job: SchedulerJobRecord,
  now: number
): RuntimeHostRunningLeaseSummary {
  const summary: {
    jobId: string
    kind: SchedulerJobKind
    workerId?: string
    attempt: number
    leaseExpiresAt?: number
    stale: boolean
    remainingLeaseMs?: number
  } = {
    jobId: job.id,
    kind: job.kind,
    attempt: job.attempt,
    stale: job.leaseExpiresAt !== undefined && job.leaseExpiresAt <= now
  }
  if (job.leaseOwner !== undefined) {
    summary.workerId = job.leaseOwner
  }
  if (job.leaseExpiresAt !== undefined) {
    summary.leaseExpiresAt = job.leaseExpiresAt
    summary.remainingLeaseMs = Math.max(0, job.leaseExpiresAt - now)
  }
  return summary
}
