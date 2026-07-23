import { describe, expect, it } from "vitest"
import {
  ActiveExecutionAbortRegistry,
  type ActiveAbortReason
} from "../src/jobs/active-abort.js"

describe("active execution abort registry", () => {
  it("aborts one exact active job and removes it with its registration", () => {
    const registry = new ActiveExecutionAbortRegistry()
    const controller = new AbortController()
    const registration = registry.register({ jobId: "job_a" }, controller)
    const reason: ActiveAbortReason = {
      kind: "cancel",
      message: "user cancelled"
    }

    expect(registry.size).toBe(1)
    expect(registry.abort({ jobId: "job_a" }, reason)).toBe(true)
    expect(controller.signal.aborted).toBe(true)
    expect(controller.signal.reason).toEqual(reason)
    expect(registry.abort({ jobId: "job_a" }, reason)).toBe(false)

    registration.unregister()
    expect(registry.size).toBe(0)
    expect(registry.abort({ jobId: "job_a" }, reason)).toBe(false)
  })

  it("does not let a stale attempt abort a different physical owner", () => {
    const registry = new ActiveExecutionAbortRegistry()
    const controller = new AbortController()
    const registration = registry.register({ jobId: "job_b" }, controller)
    registration.bindAttempt("attempt_current")
    const reason: ActiveAbortReason = {
      kind: "interrupt",
      message: "interrupt current work"
    }

    expect(
      registry.abort(
        { jobId: "job_b", attemptId: "attempt_stale" },
        reason
      )
    ).toBe(false)
    expect(registry.abortAttempt("attempt_stale", reason)).toBe(false)
    expect(controller.signal.aborted).toBe(false)

    expect(registry.abortAttempt("attempt_current", reason)).toBe(true)
    expect(controller.signal.reason).toEqual(reason)
    registration.unregister()
  })

  it("aborts all live entries without retaining closed registrations", () => {
    const registry = new ActiveExecutionAbortRegistry()
    const first = new AbortController()
    const second = new AbortController()
    const firstRegistration = registry.register({ jobId: "job_first" }, first)
    const secondRegistration = registry.register({ jobId: "job_second" }, second)
    const reason: ActiveAbortReason = {
      kind: "host_shutdown",
      message: "host is stopping"
    }

    expect(registry.abortAll(reason)).toBe(2)
    expect(first.signal.reason).toEqual(reason)
    expect(second.signal.reason).toEqual(reason)
    expect(registry.abortAll(reason)).toBe(0)

    firstRegistration.unregister()
    secondRegistration.unregister()
    expect(registry.size).toBe(0)
  })
})
