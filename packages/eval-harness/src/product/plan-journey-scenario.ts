import { rm } from "node:fs/promises"
import {
  createMemoryStateStore,
  createShell,
  createSurfaceAdapter,
  type Shell
} from "@wanex/product"
import {
  createMessageSurfaceClientTransport,
  createSurfaceClient,
  handleSurfaceTransportRequest
} from "@wanex/product/surface"
import { EnvSecretProvider, SecretResolver } from "@wanex/runtime/secrets"
import { createStorageTestStore } from "@wanex/storage/testing"
import { mktemp } from "../product-bootstrap/helpers.js"
import { createEvalScenario } from "../runner.js"
import { assert, evalOpenAICompatibleModelEndpoint } from "../scenario-utils.js"

const SESSION_ID = "ses_eval_product_plan"
const PROFILE_A = "eval-product-plan-provider-a"
const PROFILE_B = "eval-product-plan-provider-b"
const MODEL_A = "eval-product-plan-model-a"
const MODEL_B = "eval-product-plan-model-b"

export const planJourneyScenario = createEvalScenario({
  id: "product.plan-review-execution-operational",
  title:
    "Product Plan review enters canonical execution through one Surface transport",
  tags: [
    "product",
    "plan",
    "provider-binding",
    "surface",
    "conversation",
    "product-path"
  ],
  async run(context) {
    const storeDir = await mktemp("wanex-eval-product-plan-")
    const seedStorage = createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin: context.serviceBin
    })
    await seedStorage.createSession({
      id: SESSION_ID,
      title: "Eval Product Plan",
      kind: "agent"
    })
    await seedStorage.dispose()

    const provider = createProviderFixture()
    const originalFetch = globalThis.fetch
    globalThis.fetch = provider.fetch
    const stateStore = createMemoryStateStore()
    let app: Shell | undefined
    let surface: ReturnType<typeof createSurfaceAdapter> | undefined

    try {
      app = await createShell({
        storage: { kind: "local-system-service", storeDir },
        artifacts: { explicitPath: context.serviceBin },
        modelEndpoint: modelEndpoint({
          id: PROFILE_A,
          modelId: MODEL_A,
          baseUrl: "https://provider-a.plan.example.test/v1",
          secretRef: "env://WANEX_EVAL_PRODUCT_PLAN_A_KEY"
        }),
        secretResolver: new SecretResolver([
          new EnvSecretProvider({
            WANEX_EVAL_PRODUCT_PLAN_A_KEY: "eval-product-plan-secret-a",
            WANEX_EVAL_PRODUCT_PLAN_B_KEY: "eval-product-plan-secret-b"
          })
        ]),
        stateStore
      })
      await app.modelEndpoints.upsertModelEndpoint({
        modelEndpoint: modelEndpoint({
          id: PROFILE_B,
          modelId: MODEL_B,
          baseUrl: "https://provider-b.plan.example.test/v1",
          secretRef: "env://WANEX_EVAL_PRODUCT_PLAN_B_KEY"
        })
      })
      await app.selectSession({ sessionId: SESSION_ID })

      surface = createSurfaceAdapter(app, {
        streamId: "eval-product-plan-stream"
      })
      const transport = createMessageSurfaceClientTransport({
        send: async (request) =>
          await handleSurfaceTransportRequest(surface!, request),
        subscribe: (listener) => surface!.subscribeSurfaceEvents(listener)
      })
      const client = createSurfaceClient(transport)

      const started = await client.startPlanGeneration({
        text: "Plan the canonical Eval execution journey",
        idempotencyKey: "eval-product-plan-generate"
      })
      assert(
        started.ok && started.value.state === "running",
        "Surface should return a non-blocking Plan generation receipt"
      )
      const generation = await readTerminalGeneration(
        client,
        started.value.operationId
      )
      assert(
        generation.state === "succeeded" && generation.proposalId !== undefined,
        "Plan generation should settle with one canonical proposal"
      )
      const proposalId = generation.proposalId
      const open = await client.readPlanProposal({ proposalId })
      assert(
        open.ok &&
          open.value.kind === "product.plan-proposal.found" &&
          open.value.proposal.revision === 1 &&
          open.value.proposal.state === "open" &&
          open.value.proposal.generation.endpointId === PROFILE_A,
        "canonical proposal should retain generation Provider evidence"
      )

      const stale = await client.revisePlanProposal({
        proposalId,
        expectedRevision: 2,
        title: "Stale proposal",
        summary: "must fail",
        steps: [{ id: "stale", title: "Stale" }]
      })
      assert(
        !stale.ok,
        "stale proposal revision must fail closed at the Surface"
      )
      const revised = await client.revisePlanProposal({
        proposalId,
        expectedRevision: 1,
        title: "Reviewed Eval Plan",
        summary: "Execute only through the canonical Turn path",
        steps: [{ id: "execute", title: "Execute canonically" }],
        idempotencyKey: "eval-product-plan-revise"
      })
      assert(
        revised.ok &&
          revised.value.kind === "product.plan-proposal.found" &&
          revised.value.proposal.revision === 2,
        "exact revision should update the canonical proposal"
      )
      const approved = await client.decidePlanProposal({
        proposalId,
        expectedRevision: 2,
        decision: "approve",
        idempotencyKey: "eval-product-plan-approve"
      })
      assert(
        approved.ok &&
          approved.value.kind === "product.plan-proposal.found" &&
          approved.value.proposal.revision === 3 &&
          approved.value.proposal.state === "approved",
        "exact review decision should approve the canonical proposal"
      )

      await app.modelEndpoints.setActiveModelEndpoint({
        endpointId: PROFILE_B
      })
      const executed = await client.executePlanProposal({
        proposalId,
        expectedRevision: 3,
        idempotencyKey: "eval-product-plan-execute"
      })
      assert(
        executed.ok &&
          executed.value.operation.kind ===
            "product.conversation-operation.found" &&
          executed.value.proposal.execution !== undefined,
        "approved Plan should enter the existing Product conversation operation"
      )
      const execution = executed.value.proposal.execution
      const operation = executed.value.operation.operation
      const trustedExecution =
        stateStore.snapshot()?.trackedConversationOperations[SESSION_ID]
      assert(
        trustedExecution?.inputId === execution.inputId &&
          trustedExecution.turnId === execution.turnId &&
          trustedExecution.jobId === execution.jobId,
        "Plan execution and trusted Product tracking must retain one exact binding"
      )
      const terminal = await readTerminalOperation(
        client,
        operation.operationId
      )
      assert(
        terminal.capabilities.terminal && terminal.state === "succeeded",
        "canonical Plan execution should settle through the existing operation path"
      )
      const canonical = await client.readPlanProposal({ proposalId })
      assert(
        canonical.ok &&
          canonical.value.kind === "product.plan-proposal.found" &&
          canonical.value.proposal.execution?.jobState === "succeeded",
        "Plan reads should project execution only from canonical Turn and Job state"
      )

      const events = await client.readSurfaceEvents({
        streamId: "eval-product-plan-stream",
        limit: 100
      })
      assert(events.ok, "Plan Surface event page should be readable")
      const invalidations = events.events.filter(
        (event) => event.type === "product.surface.plan.invalidated"
      )
      assert(
        invalidations.map((event) => event.plan?.cause).join(",") ===
          [
            "generation_started",
            "generation_succeeded",
            "proposal_changed",
            "proposal_changed",
            "execution_submitted"
          ].join(","),
        "Surface should carry bounded Plan invalidations in canonical order"
      )
      assert(
        !JSON.stringify(invalidations).includes("Reviewed Eval Plan") &&
          !JSON.stringify(invalidations).includes(
            "Plan the canonical Eval execution journey"
          ),
        "Plan invalidations must omit proposal content and planning input"
      )

      const trustedState = stateStore.snapshot()
      const trustedJson = JSON.stringify(trustedState)
      assert(
        trustedState?.ui.selectedPlanProposalId === proposalId &&
          !trustedJson.includes("Reviewed Eval Plan") &&
          !trustedJson.includes("Execute only through"),
        "Product persistence should retain only opaque Plan and operation identities"
      )
      assert(
        provider.calls.length === 2 &&
          provider.calls[0]?.model === MODEL_A &&
          provider.calls[1]?.model === MODEL_B,
        "generation and execution should independently resolve active Providers"
      )

      return {
        proposalId,
        proposalRevision: 3,
        generationModelEndpointId: PROFILE_A,
        executionModelEndpointId: PROFILE_B,
        operationState: terminal.state,
        inputId: execution.inputId,
        turnId: execution.turnId,
        jobId: execution.jobId,
        invalidationCount: invalidations.length,
        staleRevisionRejected: !stale.ok,
        opaquePersistenceOnly: !trustedJson.includes("Reviewed Eval Plan")
      }
    } finally {
      await surface?.dispose()
      await app?.dispose()
      globalThis.fetch = originalFetch
      await rm(storeDir, { recursive: true, force: true })
    }
  }
})

async function readTerminalGeneration(
  client: ReturnType<typeof createSurfaceClient>,
  operationId: string
) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const result = await client.readPlanGeneration({ operationId })
    assert(result.ok, "Plan generation read should succeed")
    assert(
      result.value.kind === "product.plan-generation.found",
      "Plan generation should remain retained until explicit dismissal"
    )
    if (result.value.generation.state !== "running") {
      return result.value.generation
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`Plan generation did not settle: ${operationId}`)
}

async function readTerminalOperation(
  client: ReturnType<typeof createSurfaceClient>,
  operationId: string
) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const result = await client.readTrackedConversationOperation({
      sessionId: SESSION_ID
    })
    assert(result.ok, "conversation operation read should succeed")
    assert(
      result.value.kind === "product.conversation-operation.found",
      "Plan execution operation should remain canonical"
    )
    assert(
      result.value.operation.operationId === operationId,
      "Product read should retain the exact opaque Plan execution operation"
    )
    if (result.value.operation.capabilities.terminal) {
      return result.value.operation
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`Plan execution did not settle: ${operationId}`)
}

function modelEndpoint(request: {
  readonly id: string
  readonly modelId: string
  readonly baseUrl: string
  readonly secretRef: string
}) {
  return evalOpenAICompatibleModelEndpoint({
    id: request.id,
    modelId: request.modelId,
    baseUrl: request.baseUrl,
    secretRef: request.secretRef
  })
}

function createProviderFixture() {
  const calls: Array<{ readonly model: string; readonly body: string }> = []
  const fetch = (async (
    _input: Parameters<typeof globalThis.fetch>[0],
    init?: Parameters<typeof globalThis.fetch>[1]
  ): Promise<Response> => {
    assert(typeof init?.body === "string", "Provider body should be JSON text")
    const body = init.body
    const parsed = JSON.parse(body) as { readonly model?: unknown }
    assert(
      typeof parsed.model === "string",
      "Provider request should name a model"
    )
    calls.push({ model: parsed.model, body })
    return providerTextResponse(
      parsed.model === MODEL_A
        ? JSON.stringify({
            title: "Generated Eval Plan",
            summary: "Review before execution",
            steps: [{ id: "review", title: "Review the proposal" }]
          })
        : "Eval Plan execution completed"
    )
  }) as typeof globalThis.fetch
  return { calls, fetch }
}

function providerTextResponse(text: string): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    body: (async function* () {
      yield `data: ${JSON.stringify({
        choices: [{ delta: { content: text }, finish_reason: "stop" }]
      })}\n\n`
      yield "data: [DONE]\n\n"
    })(),
    async text() {
      return ""
    }
  } as unknown as Response
}
