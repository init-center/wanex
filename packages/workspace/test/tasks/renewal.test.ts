import { describe, expect, it } from "vitest"
import type { WorkspaceTaskStore } from "../../src/tasks/storage.js"
import { WorkspaceTaskLeaseRenewal } from "../../src/tasks/renewal.js"

describe("WorkspaceTaskLeaseRenewal", () => {
  it("drains an in-flight renewal without scheduling another one after stop", async () => {
    let calls = 0
    let resolveStarted!: () => void
    let resolveRenewal!: () => void
    const started = new Promise<void>((resolve) => {
      resolveStarted = resolve
    })
    const storage = {
      renewWorkspaceTaskRun: () => {
        calls += 1
        resolveStarted()
        return new Promise<never>((resolve) => {
          resolveRenewal = () => resolve(undefined as never)
        })
      }
    } as unknown as WorkspaceTaskStore
    const renewal = new WorkspaceTaskLeaseRenewal({
      storage,
      identity: {
        runId: "wtsk_renewal_test",
        attemptId: "wtat_renewal_test",
        claimToken: "renewal-test-token"
      },
      leaseMs: 30
    })

    renewal.start()
    await started
    const stopping = renewal.stop()
    resolveRenewal()
    await stopping
    await new Promise((resolve) => setTimeout(resolve, 30))

    expect(calls).toBe(1)
  })
})
