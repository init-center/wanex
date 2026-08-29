import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import type {
  WanexAppScheduledTickResult,
  WanexAppSubmitScheduledTickRequest,
} from "@wanex/app"
import type {
  ScheduleDefinition,
  ScheduleDefinitionSpec,
} from "@wanex/assistant/schedule"
import {
  createStorageTestStore,
  type StorageTestStore,
} from "@wanex/storage/testing"
import { createLocalScheduleAdapter } from "../src/schedule/adapter.js"
import {
  createLocalScheduleController,
  type LocalScheduleController,
  type LocalScheduleControllerFailure,
  type LocalScheduleTimerDriver,
} from "../src/schedule/controller.js"
import { LOCAL_SCHEDULE_DEFINITION_PREFIX } from "../src/schedule/identity.js"
import type { LocalScheduleAdapter } from "../src/schedule/model.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`,
)
const tempDirs: string[] = []
const stores: StorageTestStore[] = []
const adapters: LocalScheduleAdapter[] = []
const controllers: LocalScheduleController[] = []

afterEach(async () => {
  while (controllers.length > 0) await controllers.pop()?.dispose()
  while (adapters.length > 0) adapters.pop()?.dispose()
  while (stores.length > 0) await stores.pop()?.dispose()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir !== undefined) await rm(dir, { recursive: true, force: true })
  }
})

describe("Local Schedule controller", () => {
  it("hot-recomputes one earliest timer and executes a second-level interval", async () => {
    const intervalAt = Date.now() + 60_000
    const clock = new FakeScheduleClock(intervalAt - 1_000)
    const { adapter, storage } = await createHarness(clock)
    const interval = await createDefinition(adapter, {
      ...scheduleSpec("Interval"),
      trigger: { kind: "interval", anchorAt: intervalAt, intervalMs: 1_000 },
    }, "interval")
    const calls: WanexAppSubmitScheduledTickRequest[] = []
    const controller = trackController(createLocalScheduleController({
      adapter,
      storage,
      now: () => clock.now,
      timer: clock,
      submitScheduledTick: async (request) => {
        calls.push(request)
        return submittedResult(request, clock.now)
      },
    }))
    await controller.start()
    expect(clock.activeCount).toBe(1)
    expect(controller.status()).toMatchObject({
      timerArmed: true,
      deadline: intervalAt,
    })

    const earlier = await createDefinition(adapter, {
      ...scheduleSpec("Earlier once"),
      trigger: { kind: "once", at: intervalAt - 500 },
    }, "earlier")
    await controller.idle()
    expect(clock.activeCount).toBe(1)
    expect(controller.status().deadline).toBe(intervalAt - 500)

    await adapter.port.setEnabled({
      scheduleId: earlier.scheduleId,
      expectedRevision: earlier.revision,
      enabled: false,
    })
    await controller.idle()
    expect(clock.activeCount).toBe(1)
    expect(controller.status().deadline).toBe(intervalAt)

    await clock.advanceTo(intervalAt, controller)
    expect(clock.firedCount).toBe(1)
    expect(controller.status().deadline).not.toBe(intervalAt)
    const intervalOccurrences = await adapter.listOccurrences({
      scheduleId: interval.scheduleId,
      limit: 10,
    })
    expect(intervalOccurrences.occurrences).toMatchObject([
      { record: { occurrenceAt: intervalAt, delivery: { state: "submitted" } } },
    ])
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      scheduleId: interval.scheduleId,
      nonOverlap: true,
      sessionId: `ses_schedule_${interval.scheduleId.slice("schedule_".length)}`,
    })
    expect(clock.activeCount).toBe(1)
    expect(controller.status().deadline).toBe(intervalAt + 1_000)

    await controller.dispose()
    expect(clock.activeCount).toBe(0)
    await adapter.port.setEnabled({
      scheduleId: interval.scheduleId,
      expectedRevision: interval.revision,
      enabled: false,
    })
    await Promise.resolve()
    expect(clock.activeCount).toBe(0)
  })

  it("recovers a failed pending delivery on its exponential retry deadline", async () => {
    const clock = new FakeScheduleClock(10_000)
    const { adapter, storage } = await createHarness(clock)
    const definition = await createDefinition(adapter, {
      ...scheduleSpec("Retry once"),
      trigger: { kind: "once", at: 10_000 },
    }, "retry")
    let attempts = 0
    const controller = trackController(createLocalScheduleController({
      adapter,
      storage,
      now: () => clock.now,
      timer: clock,
      submitScheduledTick: async (request) => {
        attempts += 1
        if (attempts === 1) throw new Error("transient provider failure")
        return submittedResult(request, clock.now)
      },
    }))
    await controller.start()
    expect(attempts).toBe(1)
    expect(controller.status().deadline).toBe(11_000)
    const pending = await adapter.listPendingOccurrences({ limit: 10 })
    expect(pending.occurrences).toMatchObject([
      { record: { scheduleId: definition.scheduleId, delivery: {
        state: "pending",
        attempts: 1,
        nextAttemptAt: 11_000,
      } } },
    ])

    await clock.advanceTo(10_999, controller)
    expect(attempts).toBe(1)
    await clock.advanceTo(11_000, controller)
    expect(attempts).toBe(2)
    expect((await adapter.listPendingOccurrences({ limit: 10 })).occurrences)
      .toEqual([])
    expect(controller.status().timerArmed).toBe(false)
  })

  it("applies skip and fire-once policies after a long offline interval", async () => {
    const clock = new FakeScheduleClock(100_000)
    const { adapter, storage } = await createHarness(clock)
    const skipped = await createDefinition(adapter, {
      ...scheduleSpec("Skip old once"),
      trigger: { kind: "once", at: 1_000 },
      misfirePolicy: "skip",
    }, "skip-old")
    const fired = await createDefinition(adapter, {
      ...scheduleSpec("Fire old once"),
      trigger: { kind: "once", at: 2_000 },
      misfirePolicy: "fire_once",
    }, "fire-old")
    const calls: WanexAppSubmitScheduledTickRequest[] = []
    const controller = trackController(createLocalScheduleController({
      adapter,
      storage,
      now: () => clock.now,
      timer: clock,
      misfireGraceMs: 5_000,
      submitScheduledTick: async (request) => {
        calls.push(request)
        return submittedResult(request, clock.now)
      },
    }))
    await controller.start()
    expect(calls.map((call) => call.scheduleId)).toEqual([fired.scheduleId])
    const history = await adapter.listOccurrences({ limit: 10 })
    expect(history.occurrences).toEqual(expect.arrayContaining([
      expect.objectContaining({
        record: expect.objectContaining({
          scheduleId: skipped.scheduleId,
          delivery: expect.objectContaining({ state: "skipped", reason: "misfire" }),
        }),
      }),
      expect.objectContaining({
        record: expect.objectContaining({
          scheduleId: fired.scheduleId,
          delivery: expect.objectContaining({ state: "submitted" }),
        }),
      }),
    ]))
    expect(controller.status().timerArmed).toBe(false)
  })

  it("chunks long deadlines without executing early", async () => {
    const clock = new FakeScheduleClock(0)
    const { adapter, storage } = await createHarness(clock)
    await createDefinition(adapter, {
      ...scheduleSpec("Long once"),
      trigger: { kind: "once", at: 5_000 },
    }, "long")
    let calls = 0
    const controller = trackController(createLocalScheduleController({
      adapter,
      storage,
      now: () => clock.now,
      timer: clock,
      maxTimerDelayMs: 1_000,
      submitScheduledTick: async (request) => {
        calls += 1
        return submittedResult(request, clock.now)
      },
    }))
    await controller.start()
    expect(controller.status().deadline).toBe(5_000)
    expect(clock.onlyDelay).toBe(1_000)
    for (const at of [1_000, 2_000, 3_000, 4_000]) {
      await clock.advanceTo(at, controller)
      expect(calls).toBe(0)
      expect(clock.activeCount).toBe(1)
    }
    await clock.advanceTo(5_000, controller)
    expect(calls).toBe(1)
    expect(clock.activeCount).toBe(0)
  })

  it("re-arms instead of executing when the wall clock moves backward", async () => {
    const clock = new FakeScheduleClock(10_000)
    const { adapter, storage } = await createHarness(clock)
    await createDefinition(adapter, {
      ...scheduleSpec("Clock rollback"),
      trigger: { kind: "once", at: 15_000 },
    }, "clock-rollback")
    let calls = 0
    const controller = trackController(createLocalScheduleController({
      adapter,
      storage,
      now: () => clock.now,
      timer: clock,
      maxTimerDelayMs: 1_000,
      submitScheduledTick: async (request) => {
        calls += 1
        return submittedResult(request, clock.now)
      },
    }))
    await controller.start()
    await clock.fireCurrentAt(9_500, controller)
    expect(calls).toBe(0)
    expect(controller.status()).toMatchObject({
      timerArmed: true,
      deadline: 15_000,
    })
    expect(clock.onlyDelay).toBe(1_000)
  })

  it("isolates corrupt definitions while scheduling valid records", async () => {
    const clock = new FakeScheduleClock(1_000)
    const { adapter, storage } = await createHarness(clock)
    const valid = await createDefinition(adapter, {
      ...scheduleSpec("Valid"),
      trigger: { kind: "once", at: 2_000 },
    }, "valid")
    await storage.putConfig(`${LOCAL_SCHEDULE_DEFINITION_PREFIX}schedule_ffffffffffffffffffffffffffffffff`, {
      kind: "local.schedule-definition",
      corrupt: true,
    })
    const failures: LocalScheduleControllerFailure[] = []
    const controller = trackController(createLocalScheduleController({
      adapter,
      storage,
      now: () => clock.now,
      timer: clock,
      submitScheduledTick: async (request) => submittedResult(request, clock.now),
      onFailure: (failure) => failures.push(failure),
    }))
    await controller.start()
    expect(failures).toContainEqual({
      kind: "definition_record_invalid",
      at: 1_000,
    })
    expect(controller.status()).toMatchObject({ timerArmed: true, deadline: 2_000 })
    await clock.advanceTo(2_000, controller)
    const occurrence = await adapter.listOccurrences({
      scheduleId: valid.scheduleId,
      limit: 10,
    })
    expect(occurrence.occurrences[0]?.record.delivery.state).toBe("submitted")
  })
})

class FakeScheduleClock implements LocalScheduleTimerDriver {
  now: number
  firedCount = 0
  #nextId = 1
  readonly #timers = new Map<number, { callback: () => void; fireAt: number }>()

  constructor(now: number) {
    this.now = now
  }

  get activeCount(): number {
    return this.#timers.size
  }

  get onlyDelay(): number | undefined {
    const fireAt = [...this.#timers.values()][0]?.fireAt
    return fireAt === undefined ? undefined : fireAt - this.now
  }

  set(callback: () => void, delayMs: number): number {
    const id = this.#nextId
    this.#nextId += 1
    this.#timers.set(id, { callback, fireAt: this.now + delayMs })
    return id
  }

  clear(handle: unknown): void {
    if (typeof handle === "number") this.#timers.delete(handle)
  }

  async advanceTo(now: number, controller: LocalScheduleController): Promise<void> {
    if (now < this.now) throw new Error("fake Schedule clock cannot advance backward")
    this.now = now
    const timer = [...this.#timers.entries()][0]
    if (timer === undefined || timer[1].fireAt > now) return
    this.#timers.delete(timer[0])
    this.firedCount += 1
    timer[1].callback()
    await controller.idle()
  }

  async fireCurrentAt(
    wallClockNow: number,
    controller: LocalScheduleController
  ): Promise<void> {
    const timer = [...this.#timers.entries()][0]
    if (timer === undefined) throw new Error("fake Schedule timer is not armed")
    this.now = wallClockNow
    this.#timers.delete(timer[0])
    this.firedCount += 1
    timer[1].callback()
    await controller.idle()
  }
}

async function createHarness(clock: FakeScheduleClock): Promise<{
  readonly adapter: LocalScheduleAdapter
  readonly storage: StorageTestStore
}> {
  const storeDir = await createStoreDir()
  const storage = createStorageTestStore({
    kind: "local-system-service",
    mode: "persistent",
    storeDir,
    serviceBin,
  })
  stores.push(storage)
  const adapter = createLocalScheduleAdapter({ storage, now: () => clock.now })
  adapters.push(adapter)
  return { adapter, storage }
}

function trackController(
  controller: LocalScheduleController
): LocalScheduleController {
  controllers.push(controller)
  return controller
}

async function createDefinition(
  adapter: LocalScheduleAdapter,
  definition: ScheduleDefinitionSpec,
  idempotencyKey: string
): Promise<ScheduleDefinition> {
  const result = await adapter.port.createDefinition({
    definition,
    idempotencyKey,
  })
  if (result.kind !== "assistant.schedule.applied" || result.operation === "remove") {
    throw new Error("expected applied Schedule definition")
  }
  return result.definition
}

function scheduleSpec(prompt: string): ScheduleDefinitionSpec {
  return {
    prompt,
    enabled: true,
    trigger: { kind: "once", at: 1_000 },
    sessionPolicy: { kind: "isolated" },
    modelPolicy: { kind: "active" },
    overlapPolicy: "skip_if_running",
    misfirePolicy: "fire_once",
  }
}

function submittedResult(
  request: WanexAppSubmitScheduledTickRequest,
  submittedAt: number
): WanexAppScheduledTickResult {
  return {
    status: "submitted",
    scheduleId: request.scheduleId,
    tickId: request.tickId,
    modelEndpointId: request.modelEndpointId ?? "active_schedule_endpoint",
    receipt: {
      sessionId: request.sessionId!,
      inputId: request.inputId!,
      turnId: request.turnId!,
      jobId: request.jobId!,
      state: "queued",
      submittedAt,
    },
  }
}

async function createStoreDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "wanex-schedule-controller-"))
  tempDirs.push(dir)
  return dir
}
