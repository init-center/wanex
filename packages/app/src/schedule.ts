import type {
  JsonValue,
  SchedulerJobRecord,
  SchedulerJobState,
  SessionInputRecord
} from "@wanex/protocol"
import { runWanexAppShellAgentTurn } from "./agent.js"
import type { BootstrappedWanexAppShellRuntime } from "./runtime.js"
import type {
  WanexAppShellScheduleJobSummary,
  WanexAppShellScheduledTickResult,
  WanexAppShellSubmitScheduledTickRequest
} from "./types-schedule.js"

const ACTIVE_JOB_STATES = new Set<SchedulerJobState>([
  "pending",
  "ready",
  "running",
  "retry_scheduled"
])

const DEFAULT_ACTIVE_JOB_SCAN_LIMIT = 50

export async function submitWanexAppShellScheduledTick(
  runtime: BootstrappedWanexAppShellRuntime,
  options: {
    readonly request: WanexAppShellSubmitScheduledTickRequest
    readonly providerProfileId: string
  }
): Promise<WanexAppShellScheduledTickResult> {
  const request = validateScheduledTick(options.request)
  const previousJob = await resolvePreviousActiveJob(runtime, request)
  if (previousJob !== null) {
    return {
      status: "skipped",
      reason: "previous_job_active",
      scheduleId: request.scheduleId,
      tickId: request.tickId,
      previousJob: projectJobSummary(previousJob)
    }
  }

  const result = await runWanexAppShellAgentTurn(runtime, {
    request: {
      text: request.text,
      ...(request.sessionId === undefined ? {} : { sessionId: request.sessionId }),
      ...(request.principalId === undefined
        ? {}
        : { principalId: request.principalId }),
      ...(request.inputId === undefined ? {} : { inputId: request.inputId }),
      ...(request.idempotencyKey === undefined
        ? {}
        : { idempotencyKey: request.idempotencyKey }),
      ...(request.jobId === undefined ? {} : { jobId: request.jobId }),
      ...(request.jobIdempotencyKey === undefined
        ? {}
        : { jobIdempotencyKey: request.jobIdempotencyKey }),
      origin: {
        kind: "scheduler",
        sourceRef: request.scheduleId,
        metadata: compactMetadata({
          scheduleId: request.scheduleId,
          tickId: request.tickId,
          nonOverlap: request.nonOverlap,
          ...(request.classifier === undefined
            ? {}
            : {
                classifierId: request.classifier.classifierId,
                classifierLabel: request.classifier.label,
                classifierConfidence: request.classifier.confidence
              })
        })
      },
      intent: "normal"
    },
    providerProfileId: options.providerProfileId
  })

  return {
    status: "submitted",
    scheduleId: request.scheduleId,
    tickId: request.tickId,
    sessionId: result.sessionId,
    ...(request.inputId === undefined ? {} : { inputId: request.inputId }),
    ...(request.jobId === undefined ? {} : { jobId: request.jobId }),
    providerProfileId: options.providerProfileId,
    assistantText: result.assistantText,
    jobStatuses: result.jobStatuses
  }
}

async function resolvePreviousActiveJob(
  runtime: BootstrappedWanexAppShellRuntime,
  request: WanexAppShellSubmitScheduledTickRequest
): Promise<SchedulerJobRecord | null> {
  if (request.nonOverlap !== true) {
    return null
  }
  if (request.previousJobId !== undefined) {
    const previousJob = await runtime.storage.getJob({
      jobId: request.previousJobId
    })
    return previousJob !== null && isActiveJob(previousJob) ? previousJob : null
  }
  const scanLimit =
    request.activeJobScanLimit ?? DEFAULT_ACTIVE_JOB_SCAN_LIMIT
  if (!Number.isInteger(scanLimit) || scanLimit < 1) {
    throw new Error("schedule active job scan limit must be a positive integer")
  }
  const jobs = await runtime.storage.listJobs({
    kind: "session.run",
    limit: scanLimit
  })
  for (const job of jobs) {
    if (!isActiveJob(job)) {
      continue
    }
    if (await jobBelongsToSchedule(runtime, job, request)) {
      return job
    }
  }
  return null
}

function isActiveJob(job: SchedulerJobRecord): boolean {
  return job.kind === "session.run" && ACTIVE_JOB_STATES.has(job.state)
}

async function jobBelongsToSchedule(
  runtime: BootstrappedWanexAppShellRuntime,
  job: SchedulerJobRecord,
  request: WanexAppShellSubmitScheduledTickRequest
): Promise<boolean> {
  const payload = objectValue(job.payload)
  if (payload === undefined) {
    return false
  }
  const sessionId =
    typeof payload.sessionId === "string" ? payload.sessionId : undefined
  if (sessionId === undefined) {
    return false
  }
  const inputs = await runtime.storage.listSessionInputs({ sessionId })
  return inputs.some((input) => inputBelongsToSchedule(input, request))
}

function inputBelongsToSchedule(
  input: SessionInputRecord,
  request: WanexAppShellSubmitScheduledTickRequest
): boolean {
  const metadata = input.origin?.metadata
  return (
    input.origin?.kind === "scheduler" &&
    input.origin.sourceRef === request.scheduleId &&
    metadata?.scheduleId === request.scheduleId &&
    metadata.tickId !== request.tickId
  )
}

function validateScheduledTick(
  request: WanexAppShellSubmitScheduledTickRequest
): WanexAppShellSubmitScheduledTickRequest {
  validateNonEmpty(request.scheduleId, "schedule id")
  validateNonEmpty(request.tickId, "schedule tick id")
  validateNonEmpty(request.text, "schedule tick text")
  if (request.previousJobId !== undefined) {
    validateNonEmpty(request.previousJobId, "previous schedule job id")
  }
  if (request.classifier !== undefined) {
    validateNonEmpty(request.classifier.classifierId, "schedule classifier id")
    validateNonEmpty(request.classifier.label, "schedule classifier label")
    if (
      !Number.isFinite(request.classifier.confidence) ||
      request.classifier.confidence < 0 ||
      request.classifier.confidence > 1
    ) {
      throw new Error("schedule classifier confidence must be between 0 and 1")
    }
  }
  return {
    ...request,
    text: request.text.trim()
  }
}

function validateNonEmpty(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${label} must not be empty`)
  }
}

function projectJobSummary(
  job: SchedulerJobRecord
): WanexAppShellScheduleJobSummary {
  return {
    jobId: job.id,
    state: job.state,
    kind: "session.run",
    scheduledAt: job.scheduledAt,
    updatedAt: job.updatedAt
  }
}

function objectValue(value: unknown): Record<string, JsonValue> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined
  }
  return value as Record<string, JsonValue>
}

function compactMetadata(
  value: Record<string, string | number | boolean | undefined>
): Record<string, JsonValue> {
  const metadata: Record<string, JsonValue> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) {
      metadata[key] = item
    }
  }
  return metadata
}
