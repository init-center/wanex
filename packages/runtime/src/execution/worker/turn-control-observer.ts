import type { EventCursor, JsonValue, RuntimeEvent } from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"
import type { ActiveExecutionRegistration } from "../../jobs/active-abort.js"

const CONTROL_EVENT_LIMIT = 1_000
const CONTROL_OBSERVATION_INTERVAL_MS = 250

export interface TurnControlObservation {
  stop(): Promise<void>
}

export interface ObserveTurnControlsRequest {
  readonly sessionId: string
  readonly turnId: string
  readonly attemptId: string
  readonly jobId: string
  readonly startedAt: number
  readonly registration: ActiveExecutionRegistration
}

export interface TurnControlEventObserverOptions {
  readonly storage: Pick<CoreStore, "queryEvents">
  readonly intervalMs?: number
}

interface ActiveTurnObservation extends ObserveTurnControlsRequest {
  active: boolean
}

export class TurnControlEventObserver {
  private readonly storage: Pick<CoreStore, "queryEvents">
  private readonly intervalMs: number
  private readonly byAttempt = new Map<string, ActiveTurnObservation>()
  private readonly byJob = new Map<string, ActiveTurnObservation>()
  private timer: NodeJS.Timeout | undefined
  private activePoll: Promise<void> | undefined
  private cursor: EventCursor | undefined
  private cursorRevision = 0
  private nextDelayMs: number | undefined
  private closed = false

  constructor(options: TurnControlEventObserverOptions) {
    if (
      options.intervalMs !== undefined &&
      (!Number.isSafeInteger(options.intervalMs) || options.intervalMs <= 0)
    ) {
      throw new Error("turn control observation interval must be a positive integer")
    }
    this.storage = options.storage
    this.intervalMs = options.intervalMs ?? CONTROL_OBSERVATION_INTERVAL_MS
  }

  observe(request: ObserveTurnControlsRequest): TurnControlObservation {
    if (this.closed) {
      throw new Error("turn control event observer is closed")
    }
    if (this.byAttempt.has(request.attemptId) || this.byJob.has(request.jobId)) {
      throw new Error("turn control observation is already active")
    }
    const first = this.byAttempt.size === 0
    const observation: ActiveTurnObservation = { ...request, active: true }
    this.byAttempt.set(request.attemptId, observation)
    this.byJob.set(request.jobId, observation)
    const floor: EventCursor = {
      occurredAt: Math.max(Number.MIN_SAFE_INTEGER, request.startedAt - 1),
      eventId: ""
    }
    if (first || this.cursor === undefined || cursorBefore(floor, this.cursor)) {
      this.cursor = floor
      this.cursorRevision += 1
    }
    this.startPoll()

    let stopped = false
    return {
      stop: async () => {
        if (stopped) return
        stopped = true
        observation.active = false
        if (this.byAttempt.get(request.attemptId) === observation) {
          this.byAttempt.delete(request.attemptId)
        }
        if (this.byJob.get(request.jobId) === observation) {
          this.byJob.delete(request.jobId)
        }
        if (this.byAttempt.size === 0) {
          this.clearTimer()
          await this.activePoll
        }
      }
    }
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    this.clearTimer()
    this.byAttempt.clear()
    this.byJob.clear()
    await this.activePoll
  }

  private startPoll(): void {
    if (
      this.closed ||
      this.byAttempt.size === 0 ||
      this.activePoll !== undefined ||
      this.timer !== undefined
    ) {
      return
    }
    const poll = this.poll()
    this.activePoll = poll
    void poll.finally(() => {
      if (this.activePoll === poll) {
        this.activePoll = undefined
      }
      const delayMs = this.nextDelayMs
      this.nextDelayMs = undefined
      this.schedule(delayMs)
    })
  }

  private schedule(delayMs = this.intervalMs): void {
    if (
      this.closed ||
      this.byAttempt.size === 0 ||
      this.activePoll !== undefined ||
      this.timer !== undefined
    ) {
      return
    }
    this.timer = setTimeout(() => {
      this.timer = undefined
      this.startPoll()
    }, delayMs)
  }

  private async poll(): Promise<void> {
    const cursorRevision = this.cursorRevision
    try {
      const events = await this.storage.queryEvents({
        ...(this.cursor === undefined ? {} : { after: this.cursor }),
        limit: CONTROL_EVENT_LIMIT
      })
      const last = events.at(-1)
      if (last !== undefined && cursorRevision === this.cursorRevision) {
        this.cursor = { occurredAt: last.occurredAt, eventId: last.id }
      }
      for (const event of events) {
        this.apply(event)
      }
      if (
        events.length === CONTROL_EVENT_LIMIT ||
        cursorRevision !== this.cursorRevision
      ) {
        this.nextDelayMs = 0
      }
    } catch {
      // Event observation is advisory. Safe-point reads remain authoritative.
    }
  }

  private apply(event: RuntimeEvent): void {
    if (event.type === "session.turn.cancel_requested") {
      const jobId = payloadString(event.payload, "jobId")
      if (jobId === undefined) return
      const observation = this.byJob.get(jobId)
      if (!matchesEvent(observation, event)) return
      observation.registration.abort({
        kind: "cancel",
        message:
          payloadString(event.payload, "reason") ??
          "durable turn cancellation requested"
      })
      return
    }
    if (event.type !== "session.turn.interrupt_requested") return
    const attemptId = event.scope.attemptId ?? payloadString(event.payload, "attemptId")
    if (attemptId === undefined) return
    const observation = this.byAttempt.get(attemptId)
    if (!matchesEvent(observation, event)) return
    observation.registration.abort({
      kind: "interrupt",
      message: "durable turn interruption requested"
    })
  }

  private clearTimer(): void {
    if (this.timer === undefined) return
    clearTimeout(this.timer)
    this.timer = undefined
  }
}

function matchesEvent(
  observation: ActiveTurnObservation | undefined,
  event: RuntimeEvent
): observation is ActiveTurnObservation {
  return observation?.active === true &&
    event.scope.sessionId === observation.sessionId &&
    event.scope.turnId === observation.turnId
}

function payloadString(payload: JsonValue, key: string): string | undefined {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined
  }
  const value = (payload as Readonly<Record<string, JsonValue>>)[key]
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function cursorBefore(left: EventCursor, right: EventCursor): boolean {
  return left.occurredAt < right.occurredAt ||
    (left.occurredAt === right.occurredAt && left.eventId < right.eventId)
}
