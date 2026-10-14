import { afterEach, describe, expect, it, vi } from "vitest"
import {
  RemoteMultiOwnerCoordinator,
  ScenarioRunScope
} from "../src/runtime-host/remote-multi-owner-coordination.js"
import { waitForParallelWave } from "../src/runtime-host/remote-multi-owner-scenario.js"

afterEach(() => vi.useRealTimers())

describe("remote multi-owner Eval coordination", () => {
  it("reports a missed gate with joined worker failure evidence and its original deadline cause", async () => {
    vi.useFakeTimers()
    const coordinator = new RemoteMultiOwnerCoordinator()
    const gate = coordinator.armGate(2)
    const runs = new ScenarioRunScope()
    const running = runs.track(coordinator.enter("host-a", "parallel-00").then((leave) => {
      leave()
      throw new Error("planned storage timeout")
    }))
    const waiting = waitForParallelWave(coordinator, gate.ready, running, 3)
    const failure = expect(waiting).rejects.toMatchObject({
      message: expect.stringContaining('active=1; workers=[{"error":"Error: planned storage timeout"}]'),
      cause: expect.objectContaining({ message: "parallel wave 3 did not fill all workers" })
    })
    await vi.advanceTimersByTimeAsync(30_000)
    await failure
    await runs.join()
    expect(coordinator.active).toBe(0)
    expect(() => gate.release()).toThrow("provider gate released before its exact capacity")
    expect(vi.getTimerCount()).toBe(0)
  })

  it("observes readiness without releasing the gate or changing successful worker execution", async () => {
    const coordinator = new RemoteMultiOwnerCoordinator()
    const gate = coordinator.armGate(2)
    const running = Promise.all([
      coordinator.enter("host-a", "parallel-00"),
      coordinator.enter("host-b", "parallel-01")
    ]).then((leaves) => {
      for (const leave of leaves) leave()
      return []
    })
    await waitForParallelWave(coordinator, gate.ready, running, 0)
    expect(coordinator.active).toBe(2)
    gate.release()
    await running
    expect(coordinator.active).toBe(0)
  })

  it("aborts an incomplete provider gate without leaving entrants blocked", async () => {
    const coordinator = new RemoteMultiOwnerCoordinator()
    const gate = coordinator.armGate(2)
    const entered = coordinator.enter("host-a", "parallel-00")

    await Promise.resolve()
    expect(coordinator.active).toBe(1)
    coordinator.abortGate()

    const leave = await entered
    leave()
    expect(coordinator.active).toBe(0)
    expect(() => gate.release()).toThrow(
      "provider gate released before its exact capacity"
    )
  })

  it("joins all tracked runs without hiding their result from the caller", async () => {
    const runs = new ScenarioRunScope()
    const completed = runs.track(Promise.resolve("completed"))
    const failed = runs.track(Promise.reject(new Error("planned failure")))

    await expect(runs.join()).resolves.toBeUndefined()
    await expect(completed).resolves.toBe("completed")
    await expect(failed).rejects.toThrow("planned failure")
  })
})
