import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createStorageTestStore } from "@wanex/storage/testing"
import { createTurnExecutionBinding } from "../src/execution/turn-binding.js"
import { WanexSessionCore } from "../src/sessions/index.js"
import {
  createStartedTurn,
  fakeProfile
} from "./durable-turn-test-fixture.js"

const serviceBin = join(
  import.meta.dirname,
  "../../../target/debug/wanex-system-service"
)
const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

describe("WanexSessionCore durable turn contract", () => {
  it("submits input, turn, and scheduler job atomically", async () => {
    const storage = await createStore()
    const core = new WanexSessionCore({ storage })
    await core.create({ id: "ses_core_submit", kind: "agent" })

    const receipt = await core.submitTurn({
      id: "inp_core_submit",
      turnId: "turn_core_submit",
      sessionId: "ses_core_submit",
      principalId: "principal_core",
      idempotencyKey: "idem_core_submit",
      content: [{
        type: "text",
        id: "part_core_submit",
        text: "hello"
      }],
      jobId: "job_core_submit",
      executionBinding: createTurnExecutionBinding({
        profile: fakeProfile("core_submit"),
        createdAt: 1
      })
    })

    expect(receipt.admission.inputId).toBe("inp_core_submit")
    expect(receipt.turn).toMatchObject({
      id: "turn_core_submit",
      primaryInputId: "inp_core_submit",
      jobId: "job_core_submit",
      state: "queued"
    })
    expect(receipt.job).toMatchObject({
      id: "job_core_submit",
      kind: "session.turn",
      concurrencyKey: "session:ses_core_submit",
      maxAttempts: 1,
      retryPolicy: { strategy: "none" }
    })
    await expect(
      core.listMessages({ sessionId: "ses_core_submit" })
    ).resolves.toEqual([])
  })

  it("exposes exact attempts, messages, controls, and settlement", async () => {
    const storage = await createStore()
    const fixture = await createStartedTurn(storage, {
      suffix: "core_control"
    })
    await fixture.session.steerTurn({
      sessionId: fixture.execution.sessionId,
      principalId: fixture.execution.principalId,
      expectedTurnId: fixture.execution.turnId,
      expectedAttemptId: fixture.execution.attemptId,
      idempotencyKey: "steer_core",
      content: [{
        type: "text",
        id: "part_steer_core",
        text: "focus tests"
      }]
    })
    const [control] = await fixture.session.listTurnControls({
      sessionId: fixture.execution.sessionId,
      turnId: fixture.execution.turnId,
      attemptId: fixture.execution.attemptId,
      kind: "steer",
      status: "pending"
    })
    const applied = await fixture.session.applyTurnControl({
      sessionId: fixture.execution.sessionId,
      turnId: fixture.execution.turnId,
      attemptId: fixture.execution.attemptId,
      controlId: control!.id,
      jobId: fixture.execution.jobId,
      workerId: fixture.execution.workerId,
      leaseToken: fixture.execution.leaseToken
    })
    expect(applied?.effect).toBe("steer_promoted_input")

    const appended = await fixture.session.appendMessage({
      ...fixture.execution,
      idempotencyKey: "assistant_core",
      role: "assistant",
      content: [{
        type: "text",
        id: "assistant_core",
        text: "working"
      }]
    })
    expect(appended?.sequence).toBe(3)
    const invocation = await fixture.session.beginProviderInvocation({
      ...fixture.execution,
      step: 1,
      invocationNumber: 1,
      requestDigest: "core-control-request"
    })

    const settled = await fixture.session.settleTurn({
      ...fixture.execution,
      outcome: "succeeded",
      providerInvocationId: invocation.id,
      assistantMessage: [{
        type: "text",
        id: "assistant_core_final",
        text: "done"
      }]
    })
    expect(settled.turn.state).toBe("succeeded")
    expect(settled.attempt.state).toBe("succeeded")
    expect(settled.job.state).toBe("succeeded")
    await expect(
      fixture.session.listAttempts({ turnId: fixture.execution.turnId })
    ).resolves.toHaveLength(1)
  })

  it("keeps running cancellation non-terminal until owner settlement", async () => {
    const storage = await createStore()
    const fixture = await createStartedTurn(storage, {
      suffix: "core_cancel"
    })
    const requested = await fixture.session.requestTurnCancel({
      sessionId: fixture.execution.sessionId,
      turnId: fixture.execution.turnId,
      inputId: fixture.execution.inputId,
      jobId: fixture.execution.jobId,
      reason: "cancel"
    })
    expect(requested.status).toBe("cancel_requested")
    expect(requested.turn?.state).toBe("cancel_requested")
    expect(requested.job?.state).toBe("running")

    const settled = await fixture.session.settleTurn({
      ...fixture.execution,
      outcome: "cancelled",
      reason: "cancel"
    })
    expect(settled.turn.state).toBe("cancelled")
    expect(settled.job.state).toBe("cancelled")
  })

  it("rejects generic orphan session.turn jobs", async () => {
    const storage = await createStore()
    const core = new WanexSessionCore({ storage })
    await expect(
      core.enqueueJob({
        kind: "session.turn",
        principalId: "principal_orphan",
        payload: {
          sessionId: "ses_orphan",
          turnId: "turn_orphan",
          inputId: "inp_orphan"
        }
      })
    ).rejects.toThrow(
      "session.turn jobs must be created by submit_session_turn"
    )
  })
})

async function createStore() {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-sessions-"))
  tempDirs.push(storeDir)
  return createStorageTestStore({
    kind: "local-system-service",
    mode: "oneshot",
    storeDir,
    serviceBin
  })
}
