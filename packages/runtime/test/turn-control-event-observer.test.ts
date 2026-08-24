import { createRuntimeEvent, type QueryEventsInput, type RuntimeEvent } from "@wanex/protocol"
import { describe, expect, it } from "vitest"
import { ActiveExecutionAbortRegistry } from "../src/jobs/active-abort.js"
import {
  TurnControlEventObserver,
  type TurnControlObservation
} from "../src/execution/worker/turn-control-observer.js"

describe("turn control event observer", () => {
  it("shares one event query across concurrent active turns", async () => {
    const storage = new ControlledEventStore()
    const observer = new TurnControlEventObserver({ storage })
    const observations: TurnControlObservation[] = []

    for (let index = 0; index < 8; index += 1) {
      observations.push(createObservation(observer, {
        jobId: `job_${index}`,
        attemptId: `attempt_${index}`,
        sessionId: `session_${index}`,
        turnId: `turn_${index}`,
        startedAt: 100 + index
      }).observation)
    }

    expect(storage.requests).toHaveLength(1)
    expect(storage.requests[0]?.query).toEqual({
      after: { occurredAt: 99, eventId: "" },
      limit: 1_000
    })

    const stopping = Promise.all(observations.map(async (item) => await item.stop()))
    storage.requests[0]!.events.resolve([])
    await stopping
    await observer.close()
    expect(storage.requests).toHaveLength(1)
  })

  it("routes durable cancel and interrupt events to exact live owners", async () => {
    const storage = new ControlledEventStore()
    const observer = new TurnControlEventObserver({ storage })
    const cancelled = createObservation(observer, {
      jobId: "job_cancel",
      attemptId: "attempt_cancel",
      sessionId: "session_cancel",
      turnId: "turn_cancel",
      startedAt: 200
    })
    const interrupted = createObservation(observer, {
      jobId: "job_interrupt",
      attemptId: "attempt_interrupt",
      sessionId: "session_interrupt",
      turnId: "turn_interrupt",
      startedAt: 201
    })
    const untouched = createObservation(observer, {
      jobId: "job_untouched",
      attemptId: "attempt_untouched",
      sessionId: "session_untouched",
      turnId: "turn_untouched",
      startedAt: 202
    })

    storage.requests[0]!.events.resolve([
      controlEvent({
        id: "evt_cancel_wrong_turn",
        type: "session.turn.cancel_requested",
        sessionId: "session_cancel",
        turnId: "turn_stale",
        payload: { jobId: "job_cancel", reason: "stale cancellation" }
      }),
      controlEvent({
        id: "evt_interrupt_wrong_session",
        type: "session.turn.interrupt_requested",
        sessionId: "session_stale",
        turnId: "turn_interrupt",
        attemptId: "attempt_interrupt",
        payload: { attemptId: "attempt_interrupt" }
      }),
      controlEvent({
        id: "evt_cancel_exact",
        type: "session.turn.cancel_requested",
        sessionId: "session_cancel",
        turnId: "turn_cancel",
        payload: { jobId: "job_cancel", reason: "remote owner cancelled" }
      }),
      controlEvent({
        id: "evt_interrupt_exact",
        type: "session.turn.interrupt_requested",
        sessionId: "session_interrupt",
        turnId: "turn_interrupt",
        attemptId: "attempt_interrupt",
        payload: { attemptId: "attempt_interrupt" }
      })
    ])
    await settleMicrotasks()

    expect(cancelled.controller.signal.reason).toEqual({
      kind: "cancel",
      message: "remote owner cancelled"
    })
    expect(interrupted.controller.signal.reason).toEqual({
      kind: "interrupt",
      message: "durable turn interruption requested"
    })
    expect(untouched.controller.signal.aborted).toBe(false)

    await Promise.all([
      cancelled.observation.stop(),
      interrupted.observation.stop(),
      untouched.observation.stop()
    ])
    await observer.close()
  })

  it("does not let an older in-flight query advance a new active window", async () => {
    const storage = new ControlledEventStore()
    const observer = new TurnControlEventObserver({ storage })
    const old = createObservation(observer, {
      jobId: "job_old",
      attemptId: "attempt_old",
      sessionId: "session_old",
      turnId: "turn_old",
      startedAt: 100
    })
    const stoppingOld = old.observation.stop()
    const current = createObservation(observer, {
      jobId: "job_current",
      attemptId: "attempt_current",
      sessionId: "session_current",
      turnId: "turn_current",
      startedAt: 200
    })

    storage.requests[0]!.events.resolve([
      createRuntimeEvent({
        id: "evt_old_tail",
        type: "scheduler.job.succeeded",
        scope: {},
        payload: {},
        occurredAt: 500
      })
    ])
    await stoppingOld
    await storage.waitForRequestCount(2)

    expect(storage.requests).toHaveLength(2)
    expect(storage.requests[1]?.query.after).toEqual({
      occurredAt: 199,
      eventId: ""
    })
    storage.requests[1]!.events.resolve([
      controlEvent({
        id: "evt_current_cancel",
        type: "session.turn.cancel_requested",
        sessionId: "session_current",
        turnId: "turn_current",
        payload: { jobId: "job_current", reason: "current cancellation" }
      })
    ])
    await settleMicrotasks()

    expect(current.controller.signal.reason).toEqual({
      kind: "cancel",
      message: "current cancellation"
    })
    await current.observation.stop()
    await observer.close()
  })
})

function createObservation(
  observer: TurnControlEventObserver,
  identity: {
    readonly jobId: string
    readonly attemptId: string
    readonly sessionId: string
    readonly turnId: string
    readonly startedAt: number
  }
): {
  readonly controller: AbortController
  readonly observation: TurnControlObservation
} {
  const registry = new ActiveExecutionAbortRegistry()
  const controller = new AbortController()
  const registration = registry.register({ jobId: identity.jobId }, controller)
  registration.bindAttempt(identity.attemptId)
  return {
    controller,
    observation: observer.observe({ ...identity, registration })
  }
}

function controlEvent(request: {
  readonly id: string
  readonly type:
    | "session.turn.cancel_requested"
    | "session.turn.interrupt_requested"
  readonly sessionId: string
  readonly turnId: string
  readonly attemptId?: string
  readonly payload: RuntimeEvent["payload"]
}): RuntimeEvent {
  return createRuntimeEvent({
    id: request.id,
    type: request.type,
    scope: {
      sessionId: request.sessionId,
      turnId: request.turnId,
      ...(request.attemptId === undefined
        ? {}
        : { attemptId: request.attemptId })
    },
    payload: request.payload,
    occurredAt: 300
  })
}

class ControlledEventStore {
  readonly requests: Array<{
    readonly query: QueryEventsInput
    readonly events: Deferred<RuntimeEvent[]>
  }> = []
  private readonly requestWaiters: Array<{
    readonly count: number
    readonly ready: Deferred<void>
  }> = []

  queryEvents(query: QueryEventsInput): Promise<RuntimeEvent[]> {
    const events = deferred<RuntimeEvent[]>()
    this.requests.push({ query, events })
    for (const waiter of this.requestWaiters) {
      if (this.requests.length >= waiter.count) {
        waiter.ready.resolve()
      }
    }
    return events.promise
  }

  async waitForRequestCount(count: number): Promise<void> {
    if (this.requests.length >= count) return
    const ready = deferred<void>()
    this.requestWaiters.push({ count, ready })
    await ready.promise
  }
}

interface Deferred<T> {
  readonly promise: Promise<T>
  resolve(value: T): void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

async function settleMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}
