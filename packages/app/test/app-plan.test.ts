import { createServer, type Server } from "node:http"
import { describe, expect, it } from "vitest"
import { SecretResolver, StaticSecretProvider } from "@wanex/runtime/secrets"
import { createStorageTestStore } from "@wanex/storage/testing"
import { createWanexApp } from "../src/internal-index.js"
import { createStoreDir, serviceBin } from "./helpers.js"
import { appTestModelEndpoint } from "./model-endpoint-fixture.js"

describe("@wanex/app Plan commands", () => {
  it("binds generation and execution to independently resolved active Providers", async () => {
    const storeDir = await createStoreDir()
    const provider = await listenPlanProvider()
    const secretRef = "static://app-plan-provider"
    const secretResolver = new SecretResolver([
      new StaticSecretProvider({ values: { [secretRef]: "plan-test-key" } })
    ])
    const app = await createWanexApp({
      storage: { kind: "local-system-service", storeDir },
      artifacts: { explicitPath: serviceBin },
      modelEndpoint: appTestModelEndpoint({
        endpointId: "plan-provider-a",
        protocolId: "openai-chat-completions",
        providerId: "provider-a",
        modelId: "model-a",
        baseUrl: provider.baseUrl,
        secretRef
      }),
      secretResolver
    })
    const storage = createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin
    })

    try {
      await storage.createSession({
        id: "ses_app_plan_provider_switch",
        title: "Plan Provider switch",
        kind: "agent"
      })
      const proposal = await app.commands.generatePlanProposal({
        sessionId: "ses_app_plan_provider_switch",
        planningRequest: [
          {
            id: "part_app_plan_request",
            type: "text",
            text: "Plan the implementation"
          }
        ],
        idempotencyKey: "app-plan-generate"
      })
      expect(proposal.generation).toMatchObject({
        endpointId: "plan-provider-a",
        protocolId: "openai-chat-completions",
        providerId: "provider-a",
        modelId: "model-a"
      })

      await app.commands.upsertModelEndpoint({
        modelEndpoint: appTestModelEndpoint({
          endpointId: "plan-provider-b",
          protocolId: "openai-chat-completions",
          providerId: "provider-b",
          modelId: "model-b",
          baseUrl: provider.baseUrl,
          secretRef
        }),
        makeActive: true
      })
      const decision = await app.commands.approvePlanProposal({
        proposalId: proposal.id,
        expectedRevision: proposal.revision,
        actorId: "app-plan-reviewer",
        idempotencyKey: "app-plan-approve"
      })
      const receipt = await app.commands.executePlanProposal({
        proposalId: proposal.id,
        expectedRevision: decision.toRevision,
        idempotencyKey: "app-plan-execute"
      })

      expect(receipt.submission.turn.executionBinding.modelEndpoint).toMatchObject({
        endpointId: "plan-provider-b",
        protocol: { id: "openai-chat-completions" },
        connection: { providerId: "provider-b" },
        model: { id: "model-b" }
      })
      await expect(
        app.commands.readPlanProposal({ proposalId: proposal.id })
      ).resolves.toMatchObject({
        proposal: {
          id: proposal.id,
          state: "approved",
          generation: { endpointId: "plan-provider-a" },
          execution: {
            inputId: receipt.submission.admission.inputId,
            turnId: receipt.submission.turn.id,
            jobId: receipt.submission.job.id
          }
        },
        execution: {
          turn: {
            executionBinding: {
              modelEndpoint: { endpointId: "plan-provider-b" }
            }
          }
        }
      })
    } finally {
      await storage.dispose()
      await app.dispose()
      await closeServer(provider.server)
    }
  })
})

async function listenPlanProvider(): Promise<{
  readonly server: Server
  readonly baseUrl: string
}> {
  const server = createServer(async (request, response) => {
    for await (const _chunk of request) {
      // Consume the request before responding.
    }
    const content = JSON.stringify({
      title: "Provider-bound Plan",
      summary: "Execute the reviewed implementation",
      steps: [{ id: "implement", title: "Implement the change" }]
    })
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
  const address = server.address()
  if (address === null || typeof address === "string") {
    throw new Error("Plan Provider fixture did not expose a TCP address")
  }
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}/v1`
  }
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
