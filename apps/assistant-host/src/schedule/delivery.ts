import type { WanexAppTrustedExecutionHost } from "@wanex/app"
import type { CoreStore } from "@wanex/storage"
import type {
  LocalScheduleAdapter,
  LocalScheduleOccurrence,
  LocalScheduleOccurrenceDelivery,
  LocalScheduleSubmittedDelivery,
} from "./model.js"

const FIRST_RETRY_DELAY_MS = 1_000
const MAX_RETRY_DELAY_MS = 5 * 60_000
const OCCURRENCE_SCAN_LIMIT = 199

export type LocalScheduleDeliveryResult =
  | {
      readonly kind: "submitted" | "skipped" | "retry_scheduled" | "superseded"
      readonly occurrence: LocalScheduleOccurrence
    }
  | {
      readonly kind: "not_due" | "already_settled" | "raced"
      readonly occurrence: LocalScheduleOccurrence
    }

export async function deliverLocalScheduleOccurrence(request: {
  readonly adapter: LocalScheduleAdapter
  readonly storage: CoreStore
  readonly occurrence: LocalScheduleOccurrence
  readonly submitScheduledTick: WanexAppTrustedExecutionHost["submitScheduledTick"]
  readonly now?: () => number
}): Promise<LocalScheduleDeliveryResult> {
  const now = safeNow(request.now ?? Date.now)
  const occurrence = request.occurrence
  const pending = occurrence.record.delivery
  if (pending.state !== "pending") {
    return { kind: "already_settled", occurrence }
  }

  const existingJob = await request.storage.getJob({
    jobId: occurrence.record.execution.jobId,
  })
  if (existingJob !== null) {
    assertMatchingDurableJob(occurrence, existingJob)
    return await settleSubmitted(request.adapter, occurrence, {
      ...submittedDelivery(occurrence, existingJob.createdAt, now),
    })
  }

  const currentDefinition = await request.adapter.port.readDefinition(
    occurrence.record.scheduleId
  )
  if (
    currentDefinition === null ||
    !currentDefinition.enabled ||
    currentDefinition.revision !== occurrence.record.definitionRevision
  ) {
    return await settle(request.adapter, occurrence, {
      state: "skipped",
      reason: "superseded",
      settledAt: now,
    }, "superseded")
  }
  if (pending.nextAttemptAt > now) return { kind: "not_due", occurrence }

  const previousJobId = await findPreviousSubmittedJobId(
    request.adapter,
    occurrence
  )
  let result: Awaited<ReturnType<
    WanexAppTrustedExecutionHost["submitScheduledTick"]
  >>
  try {
    result = await request.submitScheduledTick({
      scheduleId: occurrence.record.scheduleId,
      tickId: occurrence.record.execution.tickId,
      text: occurrence.record.definition.prompt,
      sessionId: occurrence.record.execution.sessionId,
      inputId: occurrence.record.execution.inputId,
      turnId: occurrence.record.execution.turnId,
      jobId: occurrence.record.execution.jobId,
      idempotencyKey: occurrence.record.execution.idempotencyKey,
      jobIdempotencyKey: occurrence.record.execution.jobIdempotencyKey,
      nonOverlap: true,
      ...(previousJobId === undefined ? {} : { previousJobId }),
      ...(occurrence.record.definition.modelPolicy.kind === "active"
        ? {}
        : {
            modelEndpointId:
              occurrence.record.definition.modelPolicy.endpointId,
          }),
    })
  } catch {
    const attempts = pending.attempts + 1
    const nextAttemptAt = safeAdd(now, retryDelayMs(attempts))
    return await settle(request.adapter, occurrence, {
      state: "pending",
      attempts,
      nextAttemptAt,
      lastFailure: { kind: "submission_failed", at: now },
    }, "retry_scheduled")
  }
  if (result.status === "skipped") {
    return await settle(request.adapter, occurrence, {
      state: "skipped",
      reason: "previous_job_active",
      settledAt: now,
      previousJobId: result.previousJob.jobId,
    }, "skipped")
  }
  assertMatchingReceipt(occurrence, result.receipt)
  return await settleSubmitted(
    request.adapter,
    occurrence,
    submittedDelivery(occurrence, result.receipt.submittedAt, now)
  )
}

function assertMatchingDurableJob(
  occurrence: LocalScheduleOccurrence,
  job: {
    readonly kind: string
    readonly payload: unknown
  }
): void {
  const payload = recordValue(job.payload)
  const expected = occurrence.record.execution
  if (
    job.kind !== "session.turn" ||
    payload?.sessionId !== expected.sessionId ||
    payload.turnId !== expected.turnId ||
    payload.inputId !== expected.inputId
  ) {
    throw new Error("Scheduled occurrence Job identity is inconsistent")
  }
}

export async function skipLocalScheduleMisfire(request: {
  readonly adapter: LocalScheduleAdapter
  readonly occurrence: LocalScheduleOccurrence
  readonly now?: () => number
}): Promise<LocalScheduleDeliveryResult> {
  if (request.occurrence.record.delivery.state !== "pending") {
    return { kind: "already_settled", occurrence: request.occurrence }
  }
  return await settle(request.adapter, request.occurrence, {
    state: "skipped",
    reason: "misfire",
    settledAt: safeNow(request.now ?? Date.now),
  }, "skipped")
}

async function settleSubmitted(
  adapter: LocalScheduleAdapter,
  occurrence: LocalScheduleOccurrence,
  delivery: LocalScheduleSubmittedDelivery
): Promise<LocalScheduleDeliveryResult> {
  return await settle(adapter, occurrence, delivery, "submitted")
}

async function settle(
  adapter: LocalScheduleAdapter,
  occurrence: LocalScheduleOccurrence,
  delivery: LocalScheduleOccurrenceDelivery,
  successKind: "submitted" | "skipped" | "retry_scheduled" | "superseded"
): Promise<LocalScheduleDeliveryResult> {
  const result = await adapter.updateOccurrenceDelivery({ occurrence, delivery })
  if (result.kind === "conflict") {
    return {
      kind:
        result.current?.record.delivery.state === "pending"
          ? "raced"
          : "already_settled",
      occurrence: result.current ?? occurrence,
    }
  }
  if (delivery.state !== "pending") {
    await adapter.pruneSettledOccurrences(occurrence.record.scheduleId).catch(() => {})
  }
  return { kind: successKind, occurrence: result.occurrence }
}

async function findPreviousSubmittedJobId(
  adapter: LocalScheduleAdapter,
  occurrence: LocalScheduleOccurrence
): Promise<string | undefined> {
  const page = await adapter.listOccurrences({
    scheduleId: occurrence.record.scheduleId,
    limit: OCCURRENCE_SCAN_LIMIT,
  })
  const previous = page.occurrences
    .filter((candidate) =>
      candidate.record.occurrenceAt < occurrence.record.occurrenceAt &&
      candidate.record.delivery.state === "submitted"
    )
    .sort((left, right) =>
      right.record.occurrenceAt - left.record.occurrenceAt
    )[0]
  const delivery = previous?.record.delivery
  return delivery?.state === "submitted" ? delivery.jobId : undefined
}

function submittedDelivery(
  occurrence: LocalScheduleOccurrence,
  submittedAt: number,
  settledAt: number
): LocalScheduleSubmittedDelivery {
  return {
    state: "submitted",
    settledAt,
    sessionId: occurrence.record.execution.sessionId,
    inputId: occurrence.record.execution.inputId,
    turnId: occurrence.record.execution.turnId,
    jobId: occurrence.record.execution.jobId,
    submittedAt,
  }
}

function assertMatchingReceipt(
  occurrence: LocalScheduleOccurrence,
  receipt: {
    readonly sessionId: string
    readonly inputId: string
    readonly turnId: string
    readonly jobId: string
  }
): void {
  const expected = occurrence.record.execution
  if (
    receipt.sessionId !== expected.sessionId ||
    receipt.inputId !== expected.inputId ||
    receipt.turnId !== expected.turnId ||
    receipt.jobId !== expected.jobId
  ) {
    throw new Error("Scheduled tick admission returned a conflicting identity")
  }
}

function retryDelayMs(attempts: number): number {
  const exponent = Math.min(Math.max(attempts - 1, 0), 20)
  return Math.min(FIRST_RETRY_DELAY_MS * 2 ** exponent, MAX_RETRY_DELAY_MS)
}

function safeNow(now: () => number): number {
  const value = now()
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("Schedule delivery clock must be a non-negative safe integer")
  }
  return value
}

function safeAdd(left: number, right: number): number {
  const value = left + right
  return Number.isSafeInteger(value) ? value : Number.MAX_SAFE_INTEGER
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}
