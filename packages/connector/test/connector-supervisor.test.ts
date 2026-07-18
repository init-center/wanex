import { describe, expect, it } from "vitest"
import {
  ConnectorSupervisor,
  backoffMs,
  type ConnectorHostLike,
  type ConnectorHostRun,
  type ConnectorSupervisorState
} from "../src/index.js"

describe("@wanex/connector supervisor", () => {
  it("starts a host and stops it gracefully", async () => {
    const run = new FakeHostRun("connses_supervisor_success")
    const states: ConnectorSupervisorState[] = []
    const supervisor = new ConnectorSupervisor({
      hostFactory: () => new FakeHost(run),
      initialBackoffMs: 0,
      sleep: immediateSleep,
      onStateChange: (state) => states.push(state)
    })

    const loop = supervisor.runUntilStopped()
    await eventually(() => {
      expect(supervisor.state.status).toBe("running")
    })
    await supervisor.stop()
    const final = await loop

    expect(final.status).toBe("stopped")
    expect(run.stopCount).toBe(1)
    expect(states.map((state) => state.status)).toContain("starting")
    expect(states.map((state) => state.status)).toContain("running")
    expect(states.at(-1)?.status).toBe("stopped")
  })

  it("retries startup failure with deterministic backoff", async () => {
    const sleeps: number[] = []
    const states: ConnectorSupervisorState[] = []
    let attempts = 0
    const supervisor = new ConnectorSupervisor({
      hostFactory: () => ({
        start: async () => {
          attempts += 1
          if (attempts === 1) {
            throw new Error("login unavailable")
          }
          return new FakeHostRun("connses_supervisor_retry")
        }
      }),
      maxFailures: 3,
      initialBackoffMs: 5,
      maxBackoffMs: 20,
      sleep: async (ms) => {
        sleeps.push(ms)
      },
      onStateChange: (state) => states.push(state)
    })

    const loop = supervisor.runUntilStopped()
    await eventually(() => {
      expect(supervisor.state.status).toBe("running")
    })
    await supervisor.stop()
    await loop

    expect(attempts).toBe(2)
    expect(sleeps).toEqual([5])
    expect(states).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "backing_off",
          attempts: 1,
          lastError: expect.objectContaining({ message: "login unavailable" })
        })
      ])
    )
  })

  it("enters failed state after maximum startup failures", async () => {
    const supervisor = new ConnectorSupervisor({
      hostFactory: () => ({
        start: async () => {
          throw new Error("bad credential")
        }
      }),
      maxFailures: 2,
      initialBackoffMs: 0,
      sleep: immediateSleep
    })

    const final = await supervisor.runUntilStopped()

    expect(final).toMatchObject({
      status: "failed",
      attempts: 2,
      lastError: expect.objectContaining({ message: "bad credential" })
    })
  })

  it("restarts when a live host aborts unexpectedly", async () => {
    const runs = [
      new FakeHostRun("connses_supervisor_first"),
      new FakeHostRun("connses_supervisor_second")
    ]
    let index = 0
    const supervisor = new ConnectorSupervisor({
      hostFactory: () => new FakeHost(runs[index++] ?? new FakeHostRun("extra")),
      maxFailures: 3,
      initialBackoffMs: 0,
      sleep: immediateSleep
    })

    const loop = supervisor.runUntilStopped()
    await eventually(() => {
      expect(supervisor.state.currentSessionId).toBe("connses_supervisor_first")
    })
    runs[0]?.abort()
    await eventually(() => {
      expect(supervisor.state.currentSessionId).toBe("connses_supervisor_second")
    })
    await supervisor.stop()
    const final = await loop

    expect(final.status).toBe("stopped")
    expect(index).toBe(2)
  })

  it("restarts when the active run loop fails", async () => {
    const runs = [
      new FakeHostRun("connses_supervisor_loop_first"),
      new FakeHostRun("connses_supervisor_loop_second")
    ]
    let index = 0
    let loopAttempts = 0
    const supervisor = new ConnectorSupervisor({
      hostFactory: () => new FakeHost(runs[index++] ?? new FakeHostRun("extra")),
      maxFailures: 3,
      initialBackoffMs: 0,
      sleep: immediateSleep,
      runLoop: async (_run, signal) => {
        loopAttempts += 1
        if (loopAttempts === 1) {
          throw new Error("delivery loop failed")
        }
        await waitForSignalAbort(signal)
      }
    })

    const loop = supervisor.runUntilStopped()
    await eventually(() => {
      expect(supervisor.state.currentSessionId).toBe(
        "connses_supervisor_loop_second"
      )
    })
    await supervisor.stop()
    const final = await loop

    expect(final.status).toBe("stopped")
    expect(index).toBe(2)
    expect(runs[0]?.stopCount).toBe(1)
  })

  it("stops when requested while a run loop is active", async () => {
    const run = new FakeHostRun("connses_supervisor_loop_stop")
    let aborted = false
    const supervisor = new ConnectorSupervisor({
      hostFactory: () => new FakeHost(run),
      initialBackoffMs: 0,
      sleep: immediateSleep,
      runLoop: async (_run, signal) => {
        await new Promise<void>((resolve) => {
          signal.addEventListener(
            "abort",
            () => {
              aborted = true
              resolve()
            },
            { once: true }
          )
        })
      }
    })

    const loop = supervisor.runUntilStopped()
    await eventually(() => {
      expect(supervisor.state.status).toBe("running")
    })
    await supervisor.stop()
    const final = await loop

    expect(final.status).toBe("stopped")
    expect(aborted).toBe(true)
  })

  it("calculates capped exponential backoff", () => {
    expect(backoffMs(0, 10, 100)).toBe(0)
    expect(backoffMs(1, 10, 100)).toBe(10)
    expect(backoffMs(2, 10, 100)).toBe(20)
    expect(backoffMs(5, 10, 100)).toBe(100)
  })
})

class FakeHost implements ConnectorHostLike {
  constructor(private readonly run: FakeHostRun) {}

  async start(): Promise<ConnectorHostRun> {
    return this.run
  }
}

class FakeHostRun implements ConnectorHostRun {
  readonly #controller = new AbortController()
  stopCount = 0

  constructor(readonly sessionId: string) {}

  get session(): ConnectorHostRun["session"] {
    return {
      id: this.sessionId,
      connectorId: "connector.test",
      credentialId: "conncred_test",
      ownerId: "supervisor",
      leaseToken: "lease_test",
      leaseExpiresAt: Date.now() + 60_000,
      state: "connected",
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
  }

  get signal(): AbortSignal {
    return this.#controller.signal
  }

  async runDeliveryOnce(): Promise<Awaited<ReturnType<ConnectorHostRun["runDeliveryOnce"]>>> {
    return { status: "idle" }
  }

  async stop(): Promise<ConnectorHostRun["session"]> {
    this.stopCount += 1
    this.abort()
    return {
      ...this.session,
      state: "disconnected"
    }
  }

  abort(): void {
    this.#controller.abort()
  }
}

async function immediateSleep(): Promise<void> {}

async function waitForSignalAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return
  }
  await new Promise<void>((resolve) => {
    signal.addEventListener("abort", () => resolve(), { once: true })
  })
}

async function eventually(assertion: () => void): Promise<void> {
  const started = Date.now()
  let lastError: unknown
  while (Date.now() - started < 1_000) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
  }
  throw lastError
}
