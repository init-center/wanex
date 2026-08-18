import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { WanexRuntimeHost } from "@wanex/runtime/host"
import { writeModelEndpoint } from "@wanex/runtime/provider"
import {
  createStorageTestStore,
  type StorageTestStore
} from "@wanex/storage/testing"
import {
  PlanWorkflow,
  type PlanWorkflowRuntimePort
} from "../src/workflows/plan/index.js"
import { appTestModelEndpoint } from "./model-endpoint-fixture.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)
const generatedPlan = JSON.stringify({
  title: "Runtime plan",
  summary: "Review before execution",
  steps: [
    { id: "step_1", title: "Inspect" },
    { id: "step_2", title: "Implement", detail: "Use the App workflow" }
  ]
})

const tempDirs: string[] = []
const clients: StorageTestStore[] = []
const hosts: WanexRuntimeHost[] = []
const workflows: PlanWorkflow[] = []

afterEach(async () => {
  while (workflows.length > 0) {
    workflows.pop()?.dispose()
  }
  while (hosts.length > 0) {
    await hosts.pop()?.dispose()
  }
  while (clients.length > 0) {
    await clients.pop()?.dispose()
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

describe("@wanex/app-plan-workflow", () => {
  it("generates a durable proposal with exact source and Provider evidence", async () => {
    const { workflow, storage } = await createRuntime()
    await createSourceSession(storage, "ses_plan_generate")

    const proposal = await generateProposal(
      workflow,
      "ses_plan_generate",
      "planp_generate"
    )

    expect(proposal).toMatchObject({
      id: "planp_generate",
      principalId: "agent_plan_runtime",
      revision: 1,
      state: "open",
      title: "Runtime plan",
      source: {
        sessionId: "ses_plan_generate",
        headSequence: 0,
        planningRequest: [
          expect.objectContaining({ type: "text", text: "Plan this work" })
        ]
      },
      generation: {
        endpointId: "direct:fake:fake-model",
        protocolId: "fake",
        providerId: "fake",
        modelId: "fake-model",
        output: [expect.objectContaining({ type: "text", text: generatedPlan })]
      },
      steps: [
        { id: "step_1", title: "Inspect" },
        {
          id: "step_2",
          title: "Implement",
          detail: "Use the App workflow"
        }
      ],
      references: [
        {
          kind: "resource",
          id: "resource_plan_input",
          role: "input"
        }
      ]
    })
    expect(proposal.source.analysisInputDigest).toMatch(/^[0-9a-f]{64}$/)
    expect(proposal.generation.endpointDigest).toMatch(/^[0-9a-f]{64}$/)
    expect(proposal.generation.outputDigest).toMatch(/^[0-9a-f]{64}$/)

    await expect(
      workflow.listProposals({
        sourceSessionId: "ses_plan_generate",
        referenceKind: "resource",
        referenceId: "resource_plan_input",
        state: "open"
      })
    ).resolves.toEqual([expect.objectContaining({ id: proposal.id })])
  })

  it("does not persist malformed generation output", async () => {
    const { workflow, storage } = await createRuntime("not valid JSON")
    await createSourceSession(storage, "ses_plan_malformed")

    await expect(
      generateProposal(workflow, "ses_plan_malformed", "planp_malformed")
    ).rejects.toThrow("plan generation output must be one JSON object")
    await expect(workflow.listProposals()).resolves.toEqual([])
  })

  it("revises with revision CAS and records an explicit human approval", async () => {
    const { workflow, storage } = await createRuntime()
    await createSourceSession(storage, "ses_plan_review")
    const proposal = await generateProposal(
      workflow,
      "ses_plan_review",
      "planp_review"
    )
    const content = {
      title: "Revised runtime plan",
      summary: "Human-reviewed plan",
      steps: [{ id: "step_review", title: "Implement atomically" }],
      references: proposal.references
    }

    const revised = await workflow.reviseProposal({
      proposalId: proposal.id,
      expectedRevision: 1,
      actorId: "reviewer_plan_runtime",
      content,
      reason: "tighten the plan",
      idempotencyKey: "plan-review-revise"
    })
    expect(revised).toMatchObject({
      operation: "revise",
      actor: { kind: "human", id: "reviewer_plan_runtime" },
      fromRevision: 1,
      toRevision: 2,
      fromState: "open",
      toState: "open"
    })

    await expect(
      workflow.reviseProposal({
        proposalId: proposal.id,
        expectedRevision: 1,
        actorId: "reviewer_plan_runtime",
        content,
        idempotencyKey: "plan-review-stale"
      })
    ).rejects.toThrow("plan proposal revision changed")

    const approved = await workflow.approveProposal({
      proposalId: proposal.id,
      expectedRevision: 2,
      actorId: "reviewer_plan_runtime",
      reason: "approved",
      idempotencyKey: "plan-review-approve"
    })
    expect(approved).toMatchObject({
      operation: "approve",
      actor: { kind: "human", id: "reviewer_plan_runtime" },
      fromRevision: 2,
      toRevision: 3,
      fromState: "open",
      toState: "approved"
    })

    const history = await workflow.getHistory(proposal.id)
    expect(history?.view.proposal).toMatchObject({
      revision: 3,
      state: "approved",
      title: "Revised runtime plan"
    })
    expect(history?.operations.map((operation) => operation.operation)).toEqual([
      "revise",
      "approve"
    ])
  })

  it("atomically binds approved execution and projects canonical records", async () => {
    const { workflow, storage, host } = await createRuntime()
    await createSourceSession(storage, "ses_plan_execute")
    await writeModelEndpoint(storage, appTestModelEndpoint({
      endpointId: "execution-endpoint",
      providerId: "execution-provider",
      modelId: "execution-model"
    }))
    const proposal = await generateProposal(
      workflow,
      "ses_plan_execute",
      "planp_execute"
    )
    await workflow.approveProposal({
      proposalId: proposal.id,
      expectedRevision: 1,
      actorId: "reviewer_plan_runtime",
      idempotencyKey: "plan-execute-approve"
    })

    const request = {
      proposalId: proposal.id,
      expectedRevision: 2,
      modelEndpointId: "execution-endpoint",
      idempotencyKey: "plan-execute-admit",
      maxSteps: 7
    }
    const executed = await workflow.executeProposal(request)
    expect(executed).toMatchObject({
      proposal: {
        id: proposal.id,
        revision: 2,
        state: "approved",
        execution: {
          inputId: expect.any(String),
          turnId: expect.any(String),
          jobId: expect.any(String)
        }
      },
      submission: {
        turn: {
          state: "queued",
          maxSteps: 7,
          executionBinding: {
            modelEndpoint: {
              endpointId: "execution-endpoint",
              connection: { providerId: "execution-provider" },
              model: { id: "execution-model" }
            }
          }
        },
        job: { state: "ready" }
      }
    })
    expect(executed.proposal.generation.endpointId).toBe(
      "direct:fake:fake-model"
    )

    const duplicate = await workflow.executeProposal(request)
    expect(duplicate.proposal.execution).toEqual(executed.proposal.execution)
    expect(duplicate.submission.turn.id).toBe(executed.submission.turn.id)
    expect(duplicate.submission.job.id).toBe(executed.submission.job.id)
    await expect(
      workflow.executeProposal({
        ...request,
        idempotencyKey: "plan-execute-conflict"
      })
    ).rejects.toThrow("plan proposal already has an execution binding")

    await host.runOnce()
    const view = await workflow.getProposal(proposal.id)
    expect(view?.execution).toMatchObject({
      input: {
        id: executed.submission.admission.inputId,
        origin: { kind: "plan", sourceRef: proposal.id },
        status: "completed"
      },
      turn: {
        id: executed.submission.turn.id,
        jobId: executed.submission.job.id,
        state: "succeeded"
      },
      job: { id: executed.submission.job.id, state: "succeeded" }
    })
    expect(view?.proposal.state).toBe("approved")
  })

  it("keeps reject and withdraw terminal without execution state", async () => {
    const { workflow, storage } = await createRuntime()
    await createSourceSession(storage, "ses_plan_terminal")
    const rejected = await generateProposal(
      workflow,
      "ses_plan_terminal",
      "planp_reject"
    )
    const withdrawn = await generateProposal(
      workflow,
      "ses_plan_terminal",
      "planp_withdraw"
    )

    await expect(
      workflow.rejectProposal({
        proposalId: rejected.id,
        expectedRevision: 1,
        actorId: "reviewer_plan_runtime",
        reason: "not safe",
        idempotencyKey: "plan-reject"
      })
    ).resolves.toMatchObject({ toState: "rejected", toRevision: 2 })
    await expect(
      workflow.withdrawProposal({
        proposalId: withdrawn.id,
        expectedRevision: 1,
        actorId: "reviewer_plan_runtime",
        reason: "superseded",
        idempotencyKey: "plan-withdraw"
      })
    ).resolves.toMatchObject({ toState: "withdrawn", toRevision: 2 })

    await expect(
      workflow.executeProposal({
        proposalId: rejected.id,
        expectedRevision: 2,
        idempotencyKey: "plan-reject-execute"
      })
    ).rejects.toThrow("plan proposal is not approved")
    const withdrawnView = await workflow.getProposal(withdrawn.id)
    expect(withdrawnView?.proposal.state).toBe("withdrawn")
    expect(withdrawnView?.proposal.execution).toBeUndefined()
  })

  it("aborts active generation on disposal and rejects later operations", async () => {
    const { host, storage } = await createRuntime()
    await createSourceSession(storage, "ses_plan_dispose")
    let notifyStarted: (() => void) | undefined
    const started = new Promise<void>((resolve) => {
      notifyStarted = resolve
    })
    const delayedRuntime: PlanWorkflowRuntimePort = {
      async runEphemeralQuery(request) {
        notifyStarted?.()
        return await new Promise<never>((_resolve, reject) => {
          const abort = (): void => reject(new DOMException("aborted", "AbortError"))
          if (request.signal?.aborted === true) {
            abort()
          } else {
            request.signal?.addEventListener("abort", abort, { once: true })
          }
        })
      },
      prepareUserTurn: (request) => host.prepareUserTurn(request),
      wake: () => host.wake()
    }
    const workflow = trackWorkflow(
      new PlanWorkflow({
        storage,
        runtime: delayedRuntime,
        principalId: "agent_plan_runtime"
      })
    )
    const generating = generateProposal(
      workflow,
      "ses_plan_dispose",
      "planp_dispose"
    )
    await started

    workflow.dispose()

    await expect(generating).rejects.toThrow(/aborted/i)
    await expect(storage.listPlanProposals({})).resolves.toEqual([])
    await expect(workflow.getProposal("planp_dispose")).rejects.toThrow(
      "plan workflow is disposed"
    )
  })
})

async function createRuntime(responseText = generatedPlan): Promise<{
  readonly storage: StorageTestStore
  readonly host: WanexRuntimeHost
  readonly workflow: PlanWorkflow
}> {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-plan-proposal-"))
  tempDirs.push(storeDir)
  const storage = createStorageTestStore({
    kind: "local-system-service",
    mode: "persistent",
    storeDir,
    serviceBin
  })
  clients.push(storage)
  const host = new WanexRuntimeHost({
    storage,
    workerCount: 1,
    fakeResponseText: responseText
  })
  hosts.push(host)
  const workflow = trackWorkflow(
    new PlanWorkflow({
      storage,
      runtime: host,
      principalId: "agent_plan_runtime"
    })
  )
  return { storage, host, workflow }
}

async function createSourceSession(
  storage: StorageTestStore,
  id: string
): Promise<void> {
  await storage.createSession({ id, kind: "agent", title: "Plan source" })
}

async function generateProposal(
  workflow: PlanWorkflow,
  sessionId: string,
  id: string
) {
  return await workflow.generateProposal({
    id,
    sessionId,
    planningRequest: [
      { id: `part_${id}_request`, type: "text", text: "Plan this work" }
    ],
    references: [
      { kind: "resource", id: "resource_plan_input", role: "input" }
    ],
    idempotencyKey: `generate:${id}`
  })
}

function trackWorkflow(workflow: PlanWorkflow): PlanWorkflow {
  workflows.push(workflow)
  return workflow
}
