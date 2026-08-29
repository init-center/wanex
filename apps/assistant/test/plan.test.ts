import { createServer, type Server } from "node:http"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { afterEach, describe, expect, it } from "vitest"
import { SecretResolver, StaticSecretProvider } from "@wanex/runtime/secrets"
import { createStorageTestStore } from "@wanex/storage/testing"
import {
  createMemoryStateStore,
  createShell,
  createSurfaceAdapter
} from "../src/index.js"
import {
  createInProcessSurfaceClientTransport,
  createSurfaceClient
} from "../src/surface/client.js"
import { assistantTestModelEndpoint } from "./model-endpoint-fixture.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)
const tempDirs: string[] = []
const servers: Server[] = []

afterEach(async () => {
  while (servers.length > 0) {
    await closeServer(servers.pop()!)
  }
  while (tempDirs.length > 0) {
    await rm(tempDirs.pop()!, { recursive: true, force: true })
  }
})

describe("@wanex/assistant Plan journey", () => {
  it("generates, reviews, executes, and retains only opaque Assistant identities", async () => {
    const storeDir = await createStoreDir()
    const provider = await listenPlanProvider()
    const storage = createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin
    })
    await storage.createSession({
      id: "ses_assistant_plan",
      title: "Assistant Plan",
      kind: "agent"
    })
    await storage.dispose()
    const stateStore = createMemoryStateStore()
    const app = await createShell({
      storage: { kind: "local-system-service", storeDir },
      artifacts: { explicitPath: serviceBin },
      modelEndpoint: modelEndpoint(provider.baseUrl),
      secretResolver: secretResolver(),
      stateStore
    })

    try {
      await app.selectSession({ sessionId: "ses_assistant_plan" })
      const started = await app.startPlanGeneration({
        text: "Plan a canonical Assistant journey",
        idempotencyKey: "assistant-plan-generation"
      })
      expect(started.state).toBe("running")
      expect(stateStore.snapshot()?.ui.selectedPlanProposalId).toBeUndefined()

      const generation = await waitForPlanGeneration(app, started.operationId)
      expect(generation).toMatchObject({
        state: "succeeded",
        sessionId: "ses_assistant_plan",
        proposalId: expect.any(String)
      })
      const proposalId = generation.proposalId!
      const trustedAfterGeneration = stateStore.snapshot()
      expect(trustedAfterGeneration?.ui.selectedPlanProposalId).toBe(proposalId)
      expect(JSON.stringify(trustedAfterGeneration)).not.toContain(
        "Canonical Assistant Plan"
      )

      const open = await app.readPlanProposal()
      expect(open).toMatchObject({
        kind: "assistant.plan-proposal.found",
        proposal: {
          proposalId,
          revision: 1,
          state: "open",
          title: "Canonical Assistant Plan",
          generation: { modelId: "assistant-plan-model" }
        }
      })
      expect(JSON.stringify(open)).not.toContain("outputDigest")
      expect(JSON.stringify(open)).not.toContain("planningRequest")

      await expect(
        app.revisePlanProposal({
          expectedRevision: 2,
          title: "Stale revision",
          summary: "Must fail",
          steps: [{ id: "stale", title: "Stale" }]
        })
      ).rejects.toThrow("plan proposal revision changed")

      const revised = await app.revisePlanProposal({
        expectedRevision: 1,
        title: "Reviewed Assistant Plan",
        summary: "Use the canonical execution path",
        steps: [{ id: "execute", title: "Execute canonically" }],
        idempotencyKey: "assistant-plan-revise"
      })
      expect(revised).toMatchObject({
        kind: "assistant.plan-proposal.found",
        proposal: { revision: 2, state: "open" }
      })
      const approved = await app.decidePlanProposal({
        expectedRevision: 2,
        decision: "approve",
        idempotencyKey: "assistant-plan-approve"
      })
      expect(approved).toMatchObject({
        kind: "assistant.plan-proposal.found",
        proposal: { revision: 3, state: "approved" }
      })

      const executed = await app.executePlanProposal({
        expectedRevision: 3,
        idempotencyKey: "assistant-plan-execute"
      })
      expect(executed).toMatchObject({
        kind: "assistant.plan-execution.submitted",
        proposal: {
          proposalId,
          state: "approved",
          execution: {
            inputId: expect.any(String),
            turnId: expect.any(String),
            jobId: expect.any(String)
          }
        },
        operation: {
          kind: "assistant.conversation-operation.found",
          operation: {
            sessionId: "ses_assistant_plan",
            operationId: expect.any(String)
          }
        }
      })
      const trustedAfterExecution = stateStore.snapshot()
      expect(trustedAfterExecution?.ui.selectedPlanProposalId).toBe(proposalId)
      expect(
        trustedAfterExecution?.trackedConversationOperations.ses_assistant_plan
      ).toMatchObject({
        sessionId: "ses_assistant_plan",
        inputId: executed.proposal.execution?.inputId,
        turnId: executed.proposal.execution?.turnId,
        jobId: executed.proposal.execution?.jobId
      })
      expect(JSON.stringify(trustedAfterExecution)).not.toContain(
        "Reviewed Assistant Plan"
      )
    } finally {
      await app.dispose()
    }
  })

  it("carries Plan review, execution, and bounded invalidations through one Surface client", async () => {
    const storeDir = await createStoreDir()
    const provider = await listenPlanProvider()
    const storage = createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin
    })
    await storage.createSession({
      id: "ses_assistant_plan_surface",
      title: "Assistant Plan Surface",
      kind: "agent"
    })
    await storage.dispose()
    const app = await createShell({
      storage: { kind: "local-system-service", storeDir },
      artifacts: { explicitPath: serviceBin },
      modelEndpoint: modelEndpoint(provider.baseUrl),
      secretResolver: secretResolver(),
      state: {
        selection: {
          kind: "session",
          sessionId: "ses_assistant_plan_surface"
        }
      }
    })
    const surface = createSurfaceAdapter(app, {
      streamId: "assistant-plan-surface"
    })
    const client = createSurfaceClient(
      createInProcessSurfaceClientTransport(surface)
    )

    try {
      const started = await client.startPlanGeneration(
        {
          text: "Plan through the Assistant Surface",
          idempotencyKey: "assistant-plan-surface-generation"
        },
        { requestId: "req_assistant_plan_surface_generation" }
      )
      expect(started).toMatchObject({
        ok: true,
        command: "startPlanGeneration",
        value: {
          state: "running",
          sessionId: "ses_assistant_plan_surface"
        },
        event: { requestId: "req_assistant_plan_surface_generation" }
      })
      if (!started.ok) throw new Error("expected Plan generation admission")

      const generation = await waitForClientPlanGeneration(
        client,
        started.value.operationId
      )
      expect(generation).toMatchObject({
        state: "succeeded",
        proposalId: expect.any(String)
      })
      const proposalId = generation.proposalId!
      const open = await client.readPlanProposal({ proposalId })
      expect(open).toMatchObject({
        ok: true,
        value: {
          kind: "assistant.plan-proposal.found",
          proposal: { proposalId, revision: 1, state: "open" }
        }
      })

      const approved = await client.decidePlanProposal({
        proposalId,
        expectedRevision: 1,
        decision: "approve",
        idempotencyKey: "assistant-plan-surface-approve"
      })
      expect(approved).toMatchObject({
        ok: true,
        value: {
          proposal: { proposalId, revision: 2, state: "approved" }
        }
      })
      const executed = await client.executePlanProposal({
        proposalId,
        expectedRevision: 2,
        idempotencyKey: "assistant-plan-surface-execute"
      })
      expect(executed).toMatchObject({
        ok: true,
        value: {
          kind: "assistant.plan-execution.submitted",
          proposal: {
            proposalId,
            execution: {
              inputId: expect.any(String),
              turnId: expect.any(String),
              jobId: expect.any(String)
            }
          },
          operation: {
            kind: "assistant.conversation-operation.found"
          }
        }
      })

      const events = await client.readSurfaceEvents({
        streamId: "assistant-plan-surface",
        limit: 100
      })
      expect(events.ok).toBe(true)
      if (!events.ok) throw new Error("expected Plan Surface event page")
      const invalidations = events.events.filter(
        (event) => event.type === "assistant.surface.plan.invalidated"
      )
      expect(invalidations.map((event) => event.plan?.cause)).toEqual([
        "generation_started",
        "generation_succeeded",
        "proposal_changed",
        "execution_submitted"
      ])
      expect(JSON.stringify(invalidations)).not.toContain(
        "Canonical Assistant Plan"
      )
      expect(JSON.stringify(invalidations)).not.toContain(
        "Plan execution completed"
      )
    } finally {
      await surface.dispose()
      await app.dispose()
    }
  })
})

async function waitForPlanGeneration(
  app: Awaited<ReturnType<typeof createShell>>,
  operationId: string
) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = app.readPlanGeneration({ operationId })
    if (
      result.kind === "assistant.plan-generation.found" &&
      result.generation.state !== "running"
    ) {
      return result.generation
    }
    await delay(10)
  }
  throw new Error("Plan generation did not settle")
}

async function waitForClientPlanGeneration(
  client: ReturnType<typeof createSurfaceClient>,
  operationId: string
) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await client.readPlanGeneration({ operationId })
    if (
      result.ok &&
      result.value.kind === "assistant.plan-generation.found" &&
      result.value.generation.state !== "running"
    ) {
      return result.value.generation
    }
    await delay(10)
  }
  throw new Error("Surface Plan generation did not settle")
}

async function listenPlanProvider(): Promise<{ readonly baseUrl: string }> {
  let requestCount = 0
  const server = createServer(async (request, response) => {
    for await (const _chunk of request) {
      // Consume request bytes before replying.
    }
    requestCount += 1
    const content =
      requestCount === 1
        ? JSON.stringify({
            title: "Canonical Assistant Plan",
            summary: "Review before canonical execution",
            steps: [{ id: "review", title: "Review the Plan" }]
          })
        : "Plan execution completed"
    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache"
    })
    response.end(
      [
        `data: ${JSON.stringify({
          choices: [{ delta: { content }, finish_reason: null }]
        })}\n\n`,
        `data: ${JSON.stringify({
          choices: [{ delta: {}, finish_reason: "stop" }]
        })}\n\n`,
        "data: [DONE]\n\n"
      ].join("")
    )
  })
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  servers.push(server)
  const address = server.address()
  if (address === null || typeof address === "string") {
    throw new Error("Assistant Plan Provider fixture did not expose an address")
  }
  return { baseUrl: `http://127.0.0.1:${address.port}/v1` }
}

function modelEndpoint(baseUrl: string) {
  return assistantTestModelEndpoint({
    endpointId: "assistant-plan-provider",
    protocolId: "openai-chat-completions",
    providerId: "assistant-plan-provider",
    modelId: "assistant-plan-model",
    baseUrl,
    secretRef: "static://assistant-plan-provider"
  })
}

function secretResolver(): SecretResolver {
  return new SecretResolver([
    new StaticSecretProvider({
      values: { "static://assistant-plan-provider": "assistant-plan-test-key" }
    })
  ])
}

async function createStoreDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "wanex-assistant-plan-"))
  tempDirs.push(dir)
  return dir
}

async function closeServer(server: Server): Promise<void> {
  server.closeAllConnections()
  if (!server.listening) return
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) resolve()
      else reject(error)
    })
  })
}
