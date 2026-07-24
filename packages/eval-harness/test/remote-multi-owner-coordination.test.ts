import { describe, expect, it } from "vitest"
import {
  RemoteMultiOwnerCoordinator,
  ScenarioRunScope
} from "../src/runtime-host/remote-multi-owner-coordination.js"

describe("remote multi-owner Eval coordination", () => {
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
