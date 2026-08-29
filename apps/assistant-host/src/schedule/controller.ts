import type { WanexAppTrustedExecutionHost } from "@wanex/app"
import type { ScheduleDefinition } from "@wanex/assistant/schedule"
import type { CoreStore } from "@wanex/storage"
import {
  deliverLocalScheduleOccurrence,
  skipLocalScheduleMisfire,
} from "./delivery.js"
import type {
  ClaimLocalScheduleOccurrenceResult,
  LocalScheduleAdapter,
  LocalScheduleOccurrence,
} from "./model.js"
import {
  DEFAULT_SCHEDULE_MISFIRE_GRACE_MS,
  planLocalScheduleRecurrence,
} from "./recurrence.js"

const PAGE_LIMIT = 100
const FIRST_CONTROL_RETRY_MS = 1_000
const MAX_CONTROL_RETRY_MS = 60_000
const DEFAULT_MAX_TIMER_DELAY_MS = 2_147_483_647

export interface LocalScheduleTimerDriver {
  set(callback: () => void, delayMs: number): unknown
  clear(handle: unknown): void
}

export interface LocalScheduleControllerFailure {
  readonly kind:
    | "definition_invalid"
    | "definition_record_invalid"
    | "occurrence_failed"
    | "refresh_failed"
  readonly at: number
  readonly scheduleId?: string
}

export interface LocalScheduleControllerStatus {
  readonly started: boolean
  readonly disposed: boolean
  readonly refreshing: boolean
  readonly dirty: boolean
  readonly timerArmed: boolean
  readonly deadline?: number
}

export interface LocalScheduleController {
  start(): Promise<void>
  wake(): void
  idle(): Promise<void>
  stop(): Promise<void>
  dispose(): Promise<void>
  status(): LocalScheduleControllerStatus
}

export function createLocalScheduleController(options: {
  readonly adapter: LocalScheduleAdapter
  readonly storage: CoreStore
  readonly submitScheduledTick: WanexAppTrustedExecutionHost["submitScheduledTick"]
  readonly now?: () => number
  readonly timer?: LocalScheduleTimerDriver
  readonly misfireGraceMs?: number
  readonly maxTimerDelayMs?: number
  readonly onFailure?: (failure: LocalScheduleControllerFailure) => void
}): LocalScheduleController {
  return new LocalScheduleControllerImpl(options)
}

class LocalScheduleControllerImpl implements LocalScheduleController {
  readonly #adapter: LocalScheduleAdapter
  readonly #storage: CoreStore
  readonly #submitScheduledTick: WanexAppTrustedExecutionHost["submitScheduledTick"]
  readonly #now: () => number
  readonly #timerDriver: LocalScheduleTimerDriver
  readonly #misfireGraceMs: number
  readonly #maxTimerDelayMs: number
  readonly #onFailure: ((failure: LocalScheduleControllerFailure) => void) | undefined
  #started = false
  #disposed = false
  #dirty = false
  #refresh: Promise<void> | null = null
  #timer: { readonly handle: unknown; readonly deadline: number } | null = null
  #unsubscribe: (() => void) | undefined
  #controlFailures = 0

  constructor(options: {
    readonly adapter: LocalScheduleAdapter
    readonly storage: CoreStore
    readonly submitScheduledTick: WanexAppTrustedExecutionHost["submitScheduledTick"]
    readonly now?: () => number
    readonly timer?: LocalScheduleTimerDriver
    readonly misfireGraceMs?: number
    readonly maxTimerDelayMs?: number
    readonly onFailure?: (failure: LocalScheduleControllerFailure) => void
  }) {
    this.#adapter = options.adapter
    this.#storage = options.storage
    this.#submitScheduledTick = options.submitScheduledTick
    this.#now = options.now ?? Date.now
    this.#timerDriver = options.timer ?? defaultTimerDriver()
    this.#misfireGraceMs = nonNegativeSafeInteger(
      options.misfireGraceMs ?? DEFAULT_SCHEDULE_MISFIRE_GRACE_MS,
      "Schedule controller misfire grace"
    )
    this.#maxTimerDelayMs = positiveSafeInteger(
      options.maxTimerDelayMs ?? DEFAULT_MAX_TIMER_DELAY_MS,
      "Schedule controller maximum timer delay"
    )
    this.#onFailure = options.onFailure
  }

  async start(): Promise<void> {
    if (this.#disposed) throw new Error("Schedule controller is disposed")
    if (this.#started) return await this.idle()
    this.#started = true
    this.#unsubscribe = this.#adapter.port.subscribeInvalidations(() => this.wake())
    this.wake()
    await this.idle()
  }

  wake(): void {
    if (!this.#started || this.#disposed) return
    this.#dirty = true
    this.#clearTimer()
    this.#launchRefresh()
  }

  async idle(): Promise<void> {
    while (this.#refresh !== null) await this.#refresh
  }

  async stop(): Promise<void> {
    if (!this.#started) return
    this.#started = false
    this.#dirty = false
    this.#unsubscribe?.()
    this.#unsubscribe = undefined
    this.#clearTimer()
    await this.idle()
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return
    await this.stop()
    this.#disposed = true
  }

  status(): LocalScheduleControllerStatus {
    return {
      started: this.#started,
      disposed: this.#disposed,
      refreshing: this.#refresh !== null,
      dirty: this.#dirty,
      timerArmed: this.#timer !== null,
      ...(this.#timer === null ? {} : { deadline: this.#timer.deadline }),
    }
  }

  #launchRefresh(): void {
    if (this.#refresh !== null || !this.#started || this.#disposed) return
    this.#refresh = this.#drain().finally(() => {
      this.#refresh = null
      if (this.#dirty && this.#started && !this.#disposed) this.#launchRefresh()
    })
  }

  async #drain(): Promise<void> {
    while (this.#dirty && this.#started && !this.#disposed) {
      this.#dirty = false
      try {
        await this.#refreshFromDurableTruth()
        this.#controlFailures = 0
      } catch {
        this.#controlFailures += 1
        const now = safeNow(this.#now)
        this.#publishFailure({ kind: "refresh_failed", at: now })
        if (!this.#dirty && this.#started) {
          this.#armTimer(safeAdd(now, controlRetryDelay(this.#controlFailures)))
        }
      }
    }
  }

  async #refreshFromDurableTruth(): Promise<void> {
    const now = safeNow(this.#now)
    const deadlines: number[] = []
    const pendingBySchedule = new Map<string, LocalScheduleOccurrence>()
    for (const occurrence of await this.#readPendingOccurrences()) {
      const processed = await this.#processPending(occurrence, now)
      if (processed.occurrence.record.delivery.state === "pending") {
        pendingBySchedule.set(
          processed.occurrence.record.scheduleId,
          processed.occurrence
        )
        deadlines.push(
          processed.retryAt ??
            processed.occurrence.record.delivery.nextAttemptAt
        )
      }
      if (!this.#started) return
    }

    const { definitions, invalidEntryCount } = await this.#readDefinitions()
    for (let index = 0; index < invalidEntryCount; index += 1) {
      this.#publishFailure({ kind: "definition_record_invalid", at: now })
    }
    for (const definition of definitions) {
      if (!this.#started) return
      if (!definition.enabled || pendingBySchedule.has(definition.scheduleId)) {
        continue
      }
      let plan: ReturnType<typeof planLocalScheduleRecurrence>
      try {
        plan = planLocalScheduleRecurrence({
          definition,
          now,
          misfireGraceMs: this.#misfireGraceMs,
        })
      } catch {
        this.#publishFailure({
          kind: "definition_invalid",
          at: now,
          scheduleId: definition.scheduleId,
        })
        continue
      }

      let blocked = false
      if (plan.due !== undefined) {
        blocked = await this.#processDue(definition, plan.due, now, deadlines)
      }
      if (!blocked && plan.nextAt !== undefined) deadlines.push(plan.nextAt)
    }

    if (!this.#dirty && this.#started) {
      const deadline = earliestDeadline(deadlines)
      if (deadline !== undefined) this.#armTimer(deadline)
    }
  }

  async #processDue(
    definition: ScheduleDefinition,
    due: NonNullable<ReturnType<typeof planLocalScheduleRecurrence>["due"]>,
    now: number,
    deadlines: number[]
  ): Promise<boolean> {
    let claim: ClaimLocalScheduleOccurrenceResult
    try {
      claim = await this.#adapter.claimOccurrence({
        scheduleId: definition.scheduleId,
        expectedDefinitionRevision: definition.revision,
        occurrenceAt: due.occurrenceAt,
      })
    } catch {
      this.#publishFailure({
        kind: "occurrence_failed",
        at: now,
        scheduleId: definition.scheduleId,
      })
      deadlines.push(safeAdd(now, FIRST_CONTROL_RETRY_MS))
      return true
    }
    if (
      claim.kind === "local.schedule-occurrence.definition-missing" ||
      claim.kind === "local.schedule-occurrence.definition-changed" ||
      claim.kind === "local.schedule-occurrence.definition-disabled"
    ) {
      this.#dirty = true
      return true
    }

    const occurrence = claim.occurrence
    if (occurrence.record.delivery.state !== "pending") return false
    if (claim.kind === "local.schedule-occurrence.pending") {
      const processed = await this.#processPending(occurrence, now)
      if (processed.occurrence.record.delivery.state === "pending") {
        deadlines.push(
          processed.retryAt ??
            processed.occurrence.record.delivery.nextAttemptAt
        )
        return true
      }
      return false
    }
    try {
      const result =
        due.kind === "skip"
          ? await skipLocalScheduleMisfire({
              adapter: this.#adapter,
              occurrence,
              now: () => now,
            })
          : await deliverLocalScheduleOccurrence({
              adapter: this.#adapter,
              storage: this.#storage,
              occurrence,
              submitScheduledTick: this.#submitScheduledTick,
              now: () => now,
            })
      if (result.occurrence.record.delivery.state === "pending") {
        deadlines.push(result.occurrence.record.delivery.nextAttemptAt)
        return true
      }
      return false
    } catch {
      this.#publishFailure({
        kind: "occurrence_failed",
        at: now,
        scheduleId: definition.scheduleId,
      })
      deadlines.push(safeAdd(now, FIRST_CONTROL_RETRY_MS))
      return true
    }
  }

  async #processPending(
    occurrence: LocalScheduleOccurrence,
    now: number
  ): Promise<{
    readonly occurrence: LocalScheduleOccurrence
    readonly retryAt?: number
  }> {
    try {
      const result = await deliverLocalScheduleOccurrence({
        adapter: this.#adapter,
        storage: this.#storage,
        occurrence,
        submitScheduledTick: this.#submitScheduledTick,
        now: () => now,
      })
      return { occurrence: result.occurrence }
    } catch {
      this.#publishFailure({
        kind: "occurrence_failed",
        at: now,
        scheduleId: occurrence.record.scheduleId,
      })
      return {
        occurrence,
        retryAt: safeAdd(now, FIRST_CONTROL_RETRY_MS),
      }
    }
  }

  async #readPendingOccurrences(): Promise<LocalScheduleOccurrence[]> {
    const occurrences: LocalScheduleOccurrence[] = []
    let afterKey: string | undefined
    do {
      const page = await this.#adapter.listPendingOccurrences({
        ...(afterKey === undefined ? {} : { afterKey }),
        limit: PAGE_LIMIT,
      })
      occurrences.push(...page.occurrences)
      afterKey = page.nextAfterKey
    } while (afterKey !== undefined)
    return occurrences
  }

  async #readDefinitions(): Promise<{
    readonly definitions: readonly ScheduleDefinition[]
    readonly invalidEntryCount: number
  }> {
    const definitions: ScheduleDefinition[] = []
    let invalidEntryCount = 0
    let afterKey: string | undefined
    do {
      const page = await this.#adapter.listDefinitionRecords({
        ...(afterKey === undefined ? {} : { afterKey }),
        limit: PAGE_LIMIT,
      })
      definitions.push(...page.definitions)
      invalidEntryCount += page.invalidEntryCount
      afterKey = page.nextAfterKey
    } while (afterKey !== undefined)
    return { definitions, invalidEntryCount }
  }

  #armTimer(deadline: number): void {
    if (!this.#started || this.#disposed) return
    this.#clearTimer()
    const now = safeNow(this.#now)
    const delay = Math.min(
      Math.max(deadline - now, 0),
      this.#maxTimerDelayMs
    )
    const handle = this.#timerDriver.set(() => {
      if (this.#timer?.handle !== handle) return
      this.#timer = null
      this.wake()
    }, delay)
    this.#timer = { handle, deadline }
  }

  #clearTimer(): void {
    if (this.#timer === null) return
    this.#timerDriver.clear(this.#timer.handle)
    this.#timer = null
  }

  #publishFailure(failure: LocalScheduleControllerFailure): void {
    try {
      this.#onFailure?.(failure)
    } catch {
      // Diagnostics cannot affect durable Schedule execution.
    }
  }
}

function defaultTimerDriver(): LocalScheduleTimerDriver {
  return {
    set(callback, delayMs) {
      const handle = setTimeout(callback, delayMs)
      handle.unref?.()
      return handle
    },
    clear(handle) {
      clearTimeout(handle as ReturnType<typeof setTimeout>)
    },
  }
}

function earliestDeadline(deadlines: readonly number[]): number | undefined {
  let earliest: number | undefined
  for (const deadline of deadlines) {
    if (!Number.isSafeInteger(deadline) || deadline < 0) continue
    if (earliest === undefined || deadline < earliest) earliest = deadline
  }
  return earliest
}

function controlRetryDelay(failures: number): number {
  const exponent = Math.min(Math.max(failures - 1, 0), 20)
  return Math.min(FIRST_CONTROL_RETRY_MS * 2 ** exponent, MAX_CONTROL_RETRY_MS)
}

function safeNow(now: () => number): number {
  return nonNegativeSafeInteger(now(), "Schedule controller clock")
}

function safeAdd(left: number, right: number): number {
  const value = left + right
  return Number.isSafeInteger(value) ? value : Number.MAX_SAFE_INTEGER
}

function positiveSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive safe integer`)
  }
  return value
}

function nonNegativeSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`)
  }
  return value
}
