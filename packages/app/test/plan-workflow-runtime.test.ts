import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createStorageTestStore, type StorageTestStore } from "@wanex/storage/testing"
import { PlanWorkflow } from "../src/workflows/plan/index.js"

const serviceBin = join(
  import.meta.dirname,
  "../../../target/debug/wanex-system-service"
)

const tempDirs: string[] = []
const clients: StorageTestStore[] = []

afterEach(async () => {
  while (clients.length > 0) {
    await clients.pop()?.dispose()
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

describe("@wanex/app-plan-workflow", () => {
  it("creates an idempotent proposal and records approve/execution history", async () => {
    const { runtime, storage } = await createRuntime()
    await storage.createSession({
      id: "ses_plan_runtime",
      kind: "agent",
      title: "Plan runtime source"
    })

    const proposal = await runtime.createProposal({
      id: "planp_runtime",
      title: "Runtime plan",
      summary: "Review before execution",
      steps: [
        { id: "step_1", title: "Inspect", status: "pending" },
        {
          id: "step_2",
          title: "Implement",
          detail: "runtime facade"
        }
      ],
      references: [{ kind: "session", id: "ses_plan_runtime", role: "source" }],
      metadata: { source: "runtime-test" },
      idempotencyKey: "runtime-plan-key"
    })
    const duplicate = await runtime.createProposal({
      title: "Runtime plan",
      summary: "Review before execution",
      steps: [
        { id: "step_1", title: "Inspect", status: "pending" },
        {
          id: "step_2",
          title: "Implement",
          detail: "runtime facade"
        }
      ],
      references: [{ kind: "session", id: "ses_plan_runtime", role: "source" }],
      metadata: { source: "runtime-test" },
      idempotencyKey: "runtime-plan-key"
    })

    expect(duplicate.id).toBe(proposal.id)
    expect(proposal).toMatchObject({
      id: "planp_runtime",
      principalId: "agent_plan_runtime",
      state: "open",
      metadata: { source: "runtime-test" }
    })

    await expect(
      runtime.requestExecution({
        proposalId: proposal.id,
        actorId: "reviewer_plan_runtime"
      })
    ).rejects.toThrow(/invalid plan proposal transition/)

    await expect(
      runtime.approveProposal({
        proposalId: proposal.id,
        actorId: "reviewer_plan_runtime",
        reason: "approved"
      })
    ).resolves.toMatchObject({
      operation: "approve",
      fromState: "open",
      toState: "approved"
    })

    await expect(
      runtime.requestExecution({
        proposalId: proposal.id,
        actorId: "reviewer_plan_runtime",
        metadata: { target: "scheduler" }
      })
    ).resolves.toMatchObject({
      operation: "request_execution",
      fromState: "approved",
      toState: "execution_requested"
    })

    await expect(
      runtime.markExecuted({
        proposalId: proposal.id,
        actorId: "runtime_plan_runtime",
        metadata: { jobId: "job_plan_runtime" }
      })
    ).resolves.toMatchObject({
      operation: "mark_executed",
      fromState: "execution_requested",
      toState: "executed"
    })

    await expect(runtime.getProposal(proposal.id)).resolves.toMatchObject({
      id: proposal.id,
      state: "executed"
    })
    await expect(
      runtime.listProposals({
        referenceKind: "session",
        referenceId: "ses_plan_runtime",
        state: "executed"
      })
    ).resolves.toEqual([expect.objectContaining({ id: proposal.id })])

    const history = await runtime.getHistory(proposal.id)
    expect(history?.proposal.id).toBe(proposal.id)
    expect(history?.operations.map((operation) => operation.operation)).toEqual([
      "approve",
      "request_execution",
      "mark_executed"
    ])

    const events = await storage.queryEvents({
      scope: { planProposalId: proposal.id },
      limit: 10
    })
    expect(events.map((event) => event.type)).toEqual([
      "plan.proposal.created",
      "plan.proposal.operation_recorded",
      "plan.proposal.operation_recorded",
      "plan.proposal.operation_recorded"
    ])
  })

  it("records terminal reject and withdraw decisions without execution intent", async () => {
    const { runtime } = await createRuntime()
    const rejected = await runtime.createProposal({
      id: "planp_reject_runtime",
      steps: [{ id: "step_reject", title: "Reject", status: "pending" }]
    })
    const withdrawn = await runtime.createProposal({
      id: "planp_withdraw_runtime",
      steps: [{ id: "step_withdraw", title: "Withdraw", status: "pending" }]
    })

    await expect(
      runtime.rejectProposal({
        proposalId: rejected.id,
        actorId: "reviewer_plan_runtime",
        reason: "not safe"
      })
    ).resolves.toMatchObject({
      operation: "reject",
      fromState: "open",
      toState: "rejected"
    })
    await expect(
      runtime.withdrawProposal({
        proposalId: withdrawn.id,
        actorId: "agent_plan_runtime",
        reason: "superseded"
      })
    ).resolves.toMatchObject({
      operation: "withdraw",
      fromState: "open",
      toState: "withdrawn"
    })

    await expect(runtime.getProposal(rejected.id)).resolves.toMatchObject({
      state: "rejected",
      closedAt: expect.any(Number)
    })
    await expect(runtime.getProposal(withdrawn.id)).resolves.toMatchObject({
      state: "withdrawn",
      closedAt: expect.any(Number)
    })
    await expect(
      runtime.requestExecution({
        proposalId: rejected.id,
        actorId: "reviewer_plan_runtime"
      })
    ).rejects.toThrow(/invalid plan proposal transition/)
  })

  it("records execution failure after approved execution request", async () => {
    const { runtime } = await createRuntime()
    const proposal = await runtime.createProposal({
      id: "planp_failed_runtime",
      steps: [{ id: "step_failed", title: "Run", status: "pending" }],
      references: [
        {
          kind: "scheduler_job",
          id: "job_failed_runtime",
          role: "execution_target"
        }
      ]
    })

    await runtime.approveProposal({
      proposalId: proposal.id,
      actorId: "reviewer_plan_runtime"
    })
    await runtime.requestExecution({
      proposalId: proposal.id,
      actorId: "reviewer_plan_runtime"
    })

    await expect(
      runtime.markExecutionFailed({
        proposalId: proposal.id,
        actorId: "runtime_plan_runtime",
        reason: "job failed",
        metadata: { jobId: "job_failed_runtime" }
      })
    ).resolves.toMatchObject({
      operation: "mark_execution_failed",
      fromState: "execution_requested",
      toState: "execution_failed"
    })

    await expect(
      runtime.listProposals({
        referenceKind: "scheduler_job",
        referenceId: "job_failed_runtime",
        state: "execution_failed"
      })
    ).resolves.toEqual([expect.objectContaining({ id: proposal.id })])
  })
})

async function createRuntime(): Promise<{
  readonly storeDir: string
  readonly storage: StorageTestStore
  readonly runtime: PlanWorkflow
}> {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-plan-proposal-"))
  tempDirs.push(storeDir)
  const storage = createStorageTestStore({ kind: "local-system-service", mode: "persistent",
    storeDir,
    serviceBin
  })
  clients.push(storage)
  const runtime = new PlanWorkflow({
    storage,
    principalId: "agent_plan_runtime"
  })
  return { storeDir, storage, runtime }
}
