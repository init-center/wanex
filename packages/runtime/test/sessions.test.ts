import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createStorageTestStore, type StorageTestStore } from "@wanex/storage/testing"
import { WanexSessionCore } from "../src/sessions/index.js"

const serviceBin = join(
  import.meta.dirname,
  "../../../target/debug/wanex-system-service"
)

const tempDirs: string[] = []

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

describe("@wanex/runtime/sessions", () => {
  it("admits input durably and claims/completes it through storage-client", async () => {
    const core = await createSessionCore()
    const session = await core.create({
      id: "ses_core_1",
      title: "Core Session"
    })

    const receipt = await core.admit({
      id: "inp_core_1",
      sessionId: session.id,
      principalId: "user_core",
      idempotencyKey: "idem_core_1",
      content: [{ type: "text", id: "part_core", text: "hello" }]
    })

    expect(receipt).toEqual({
      inputId: "inp_core_1",
      sessionId: "ses_core_1",
      durability: "local-durable",
      status: "admitted"
    })

    const claim = await core.claimRunner({
      sessionId: session.id,
      runnerId: "runner_core",
      leaseMs: 60_000
    })

    expect(claim?.inputId).toBe(receipt.inputId)
    await expect(
      core.claimRunner({
        sessionId: session.id,
        runnerId: "runner_core_2",
        leaseMs: 60_000
      })
    ).resolves.toBeNull()

    await expect(
      core.completeRun({
        sessionId: session.id,
        runId: claim!.runId,
        inputId: claim!.inputId,
        runnerId: claim!.runnerId,
        leaseToken: claim!.leaseToken,
        assistantMessage: [{ type: "text", id: "part_done", text: "done" }]
      })
    ).resolves.toBe(true)

    const inputs = await core.listInputs({ sessionId: session.id })
    expect(inputs).toHaveLength(1)
    const [input] = inputs
    expect(input?.status).toBe("completed")
    await expect(core.list({ kind: "chat", limit: 10 })).resolves.toEqual([
      expect.objectContaining({
        id: session.id,
        kind: "chat"
      })
    ])
  })

  it("returns the original receipt for duplicate idempotency keys", async () => {
    const core = await createSessionCore()
    const session = await core.create({ id: "ses_core_idem" })

    const first = await core.admit({
      id: "inp_core_idem_1",
      sessionId: session.id,
      principalId: "user_core",
      idempotencyKey: "same",
      content: [{ type: "text", id: "part_1", text: "one" }]
    })
    const second = await core.admit({
      id: "inp_core_idem_2",
      sessionId: session.id,
      principalId: "user_core",
      idempotencyKey: "same",
      content: [{ type: "text", id: "part_2", text: "two" }]
    })

    expect(second.inputId).toBe(first.inputId)
    const inputs = await core.listInputs({ sessionId: session.id })
    expect(inputs).toHaveLength(1)
  })

  it("submits input and enqueues session.run through storage", async () => {
    const core = await createSessionCore()
    const session = await core.create({ id: "ses_core_submit", kind: "agent" })

    const receipt = await core.submitRun({
      id: "inp_core_submit",
      sessionId: session.id,
      principalId: "user_core",
      idempotencyKey: "idem_core_submit",
      content: [{ type: "text", id: "part_submit", text: "hello" }],
      mode: "to_completion",
      maxSteps: 3,
      providerProfileId: "fake-profile"
    })

    expect(receipt.admission.inputId).toBe("inp_core_submit")
    expect(receipt.job.kind).toBe("session.run")
    expect(receipt.job.payload).toEqual({
      sessionId: session.id,
      mode: "to_completion",
      maxSteps: 3,
      providerProfileId: "fake-profile"
    })
    await expect(
      core.submitRun({
        sessionId: session.id,
        principalId: "user_core",
        idempotencyKey: "bad_empty",
        content: []
      })
    ).rejects.toThrow("session input content must not be empty")
  })

  it("exposes run-control requests through the session facade", async () => {
    const core = await createSessionCore()
    const session = await core.create({
      id: "ses_core_run_control",
      kind: "agent"
    })
    await core.admit({
      id: "inp_core_run_control",
      sessionId: session.id,
      principalId: "user_core",
      idempotencyKey: "idem_core_run_control_input",
      content: [{ type: "text", id: "part_run_control", text: "work" }]
    })
    const claim = await core.claimRunner({
      sessionId: session.id,
      runnerId: "runner_core_run_control",
      leaseMs: 60_000
    })
    expect(claim).not.toBeNull()

    await expect(
      core.steerRun({
        sessionId: session.id,
        principalId: "user_core",
        expectedRunId: claim!.runId,
        idempotencyKey: "idem_core_steer_empty",
        content: []
      })
    ).rejects.toThrow("steer content must not be empty")

    const interrupt = await core.interruptRun({
      sessionId: session.id,
      runId: claim!.runId,
      reason: "user requested stop",
      principalId: "user_core",
      idempotencyKey: "idem_core_interrupt"
    })
    expect(interrupt.status).toBe("interrupt_requested")

    const steer = await core.steerRun({
      sessionId: session.id,
      principalId: "user_core",
      expectedRunId: claim!.runId,
      idempotencyKey: "idem_core_steer",
      content: [{ type: "text", id: "part_steer", text: "narrow scope" }],
      origin: { kind: "interactive" }
    })
    expect(steer.status).toBe("accepted")

    const controls = await core.listRunControls({
      sessionId: session.id,
      runId: claim!.runId,
      status: "pending"
    })
    expect(controls.map((control) => control.kind).sort()).toEqual([
      "interrupt",
      "steer"
    ])
  })

  it("applies run-control records through the session facade", async () => {
    const core = await createSessionCore()
    const session = await core.create({
      id: "ses_core_apply_run_control",
      kind: "agent"
    })
    await core.admit({
      id: "inp_core_apply_run_control",
      sessionId: session.id,
      principalId: "user_core",
      idempotencyKey: "idem_core_apply_run_control_input",
      content: [{ type: "text", id: "part_apply", text: "work" }]
    })
    const claim = await core.claimRunner({
      sessionId: session.id,
      runnerId: "runner_core_apply_run_control",
      leaseMs: 60_000
    })
    expect(claim).not.toBeNull()

    await core.steerRun({
      sessionId: session.id,
      principalId: "user_core",
      expectedRunId: claim!.runId,
      idempotencyKey: "idem_core_apply_steer",
      content: [{ type: "text", id: "part_steer", text: "be concise" }]
    })
    const [steer] = await core.listRunControls({
      sessionId: session.id,
      runId: claim!.runId,
      kind: "steer",
      status: "pending"
    })
    expect(steer).toBeDefined()
    await expect(
      core.applyRunControl({
        sessionId: session.id,
        runId: claim!.runId,
        controlId: steer!.id,
        runnerId: "wrong_runner",
        leaseToken: claim!.leaseToken
      })
    ).resolves.toBeNull()

    const appliedSteer = await core.applyRunControl({
      sessionId: session.id,
      runId: claim!.runId,
      controlId: steer!.id,
      runnerId: claim!.runnerId,
      leaseToken: claim!.leaseToken
    })
    expect(appliedSteer).toMatchObject({
      effect: "steer_completed_input",
      control: {
        id: steer!.id,
        status: "applied",
        kind: "steer"
      }
    })
    let inputs = await core.listInputs({ sessionId: session.id })
    expect(inputs.find((input) => input.intent === "steer")).toMatchObject({
      status: "completed",
      runControlPolicy: "steer_at_safe_point"
    })

    await core.interruptRun({
      sessionId: session.id,
      runId: claim!.runId,
      reason: "user stop after steer",
      principalId: "user_core",
      idempotencyKey: "idem_core_apply_interrupt"
    })
    const [interrupt] = await core.listRunControls({
      sessionId: session.id,
      runId: claim!.runId,
      kind: "interrupt",
      status: "pending"
    })
    expect(interrupt).toBeDefined()
    const appliedInterrupt = await core.applyRunControl({
      sessionId: session.id,
      runId: claim!.runId,
      controlId: interrupt!.id,
      runnerId: claim!.runnerId,
      leaseToken: claim!.leaseToken
    })
    expect(appliedInterrupt).toMatchObject({
      effect: "interrupt_cancelled_run",
      control: {
        id: interrupt!.id,
        status: "applied",
        kind: "interrupt"
      }
    })
    inputs = await core.listInputs({ sessionId: session.id })
    expect(inputs.find((input) => input.id === claim!.inputId)?.status).toBe(
      "cancelled"
    )
    await expect(
      core.applyRunControl({
        sessionId: session.id,
        runId: claim!.runId,
        controlId: interrupt!.id,
        runnerId: claim!.runnerId,
        leaseToken: claim!.leaseToken
      })
    ).resolves.toMatchObject({
      effect: "already_resolved"
    })
  })

  it("forwards budget grants and run cancellation through storage", async () => {
    const core = await createSessionCore()
    const session = await core.create({ id: "ses_core_cancel" })
    await core.admit({
      id: "inp_core_cancel",
      sessionId: session.id,
      principalId: "user_core",
      idempotencyKey: "idem_core_cancel",
      content: [{ type: "text", id: "part_cancel", text: "cancel" }]
    })
    const grant = await core.reserveBudget({
      scope: { kind: "session", ownerId: session.id },
      limit: { tokens: 100 },
      requested: { tokens: 10 },
      principalId: "user_core",
      reason: "agent.run",
      idempotencyKey: "idem_core_budget"
    })
    expect(grant.state).toBe("reserved")
    await core.recordBudgetUsage({
      grantId: grant.id,
      usage: { tokens: 8 },
      source: "test",
      sourceId: "sessions",
      idempotencyKey: "usage_sessions"
    })
    await expect(
      core.commitBudget({ grantId: grant.id })
    ).resolves.toMatchObject({ state: "committed" })
    const scope = await core.getBudgetScope(grant.scopeId)
    expect(scope?.usage.tokens).toBe(8)

    const claim = await core.claimRunner({
      sessionId: session.id,
      runnerId: "runner_core_cancel",
      leaseMs: 60_000
    })
    expect(claim).not.toBeNull()
    await expect(
      core.cancelRun({
        sessionId: session.id,
        runId: claim!.runId,
        inputId: claim!.inputId,
        reason: "test stop"
      })
    ).resolves.toBe(true)
    const inputs = await core.listInputs({ sessionId: session.id })
    expect(inputs[0]?.status).toBe("cancelled")
  })

  it("forwards scheduler job lifecycle through storage", async () => {
    const core = await createSessionCore()
    const job = await core.enqueueJob({
      id: "job_core_1",
      kind: "resource.cleanup",
      principalId: "user_core",
      payload: { logicalPath: "tmp" },
      priority: 1
    })
    expect(job.state).toBe("ready")

    const claim = await core.claimJob({
      workerId: "worker_core",
      leaseMs: 60_000
    })
    expect(claim?.id).toBe(job.id)
    const heartbeat = await core.heartbeatJob({
      jobId: job.id,
      workerId: "worker_core",
      leaseToken: claim!.leaseToken!,
      leaseMs: 60_000
    })
    expect(heartbeat?.state).toBe("running")

    const cancelled = await core.cancelJob({
      jobId: job.id,
      reason: "test cleanup cancelled"
    })
    expect(cancelled?.state).toBe("cancelled")
    await expect(core.listJobs({ state: "cancelled" })).resolves.toHaveLength(1)
  })

  it("forwards resource ticket cleanup through storage", async () => {
    const core = await createSessionCore()
    const storage = createStorageTestStore({ kind: "local-system-service", mode: "oneshot",
      storeDir: await mkdtemp(join(tmpdir(), "wanex-session-core-resource-")),
      serviceBin
    })
    tempDirs.push(storage.storeDir)
    const resourceCore = new WanexSessionCore({ storage })
    const file = await storage.writeAtomicFile({
      logicalPath: "core/cleanup.txt",
      content: new TextEncoder().encode("cleanup")
    })
    const ticket = await storage.createResourceTicket({
      principalId: "user_core",
      resourceId: file.resourceId,
      capability: "write",
      expiresAt: 10
    })

    const receipt = await resourceCore.cleanupExpiredResourceTickets({
      nowMs: 20,
      limit: 1
    })

    expect(receipt.revokedTicketIds).toEqual([ticket.id])
    expect(receipt.revokedCount).toBe(1)
    await expect(
      core.cleanupExpiredResourceTickets({ limit: 0 })
    ).rejects.toThrow("resource cleanup limit must be positive")
  })
})

async function createSessionCore(): Promise<WanexSessionCore> {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-session-core-"))
  tempDirs.push(storeDir)
  return new WanexSessionCore({
    storage: createStorageTestStore({ kind: "local-system-service", mode: "oneshot",
      storeDir,
      serviceBin
    })
  })
}
