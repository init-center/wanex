import { afterEach, describe, expect, it, vi } from "vitest"
import type {
  MediaGenerationModelEndpoint,
  ModelEndpoint
} from "@wanex/protocol"
import type {
  MediaGenerationAdapter,
  MediaGenerationPollResult,
  MediaGenerationSubmitResult
} from "@wanex/runtime/media-generation"
import {
  AllowAllToolsPolicy,
  createToolRuntimeBinding,
  jsonToolResultContent,
  ToolRegistry,
  type ToolDefinition
} from "@wanex/runtime/tools"
import {
  SecretResolver,
  StaticSecretProvider
} from "@wanex/runtime/secrets"
import { createModelCapabilityRouteExecutionBinding } from "@wanex/runtime/provider"
import { createStorageTestStore } from "@wanex/storage/testing"
import { createWanexApp } from "../src/index.js"
import { createWanexAppCapabilityRequestTool } from "../src/capability-request-tool.js"
import { createWanexAppImageGenerationTool } from "../src/image-generation-tool.js"
import { createStoreDir, serviceBin } from "./helpers.js"
import { appTestModelEndpoint } from "./model-endpoint-fixture.js"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("@wanex/app media generation facade", () => {
  it("prepares a bounded deferred image request from the frozen capability route", async () => {
    const adapter = new ImmediateImageAdapter("image-standard-tool")
    const route = createModelCapabilityRouteExecutionBinding({
      requirement: {
        operation: "image.generate",
        inputModalities: ["text"],
        outputModalities: ["image"],
        features: []
      },
      source: "single_candidate",
      modelEndpoint: adapter.modelEndpoint
    })
    const tool = createWanexAppImageGenerationTool()
    const result = await tool.invoke({
      principalId: "principal",
      sessionId: "session",
      inputId: "input",
      turnId: "turn",
      attemptId: "attempt",
      toolCallId: "call-image",
      toolName: tool.name,
      input: {
        prompt: "  a precise red triangle  ",
        options: { quality: "high" }
      },
      idempotencyKey: "tool:call-image",
      capabilityRoutes: [route],
      resources: unavailableToolResources
    })

    expect(tool).toMatchObject({
      name: "image_generate",
      risk: "external",
      idempotent: true,
      concurrency: "exclusive",
      resultMode: "deferred"
    })
    expect(result).toMatchObject({
      outcome: "deferred",
      toolCallId: "call-image",
      operation: {
        kind: "media_generation",
        binding: {
          endpointId: "image-standard-tool",
          endpointDigest: route.modelEndpoint.endpointDigest,
          request: {
            operation: "image.generate",
            prompt: "a precise red triangle",
            outputModality: "image",
            inputResources: [],
            options: { quality: "high" }
          },
          requestDigest: expect.stringMatching(/^[a-f0-9]{64}$/)
        }
      }
    })
    await expect(tool.invoke({
      principalId: "principal",
      sessionId: "session",
      inputId: "input",
      turnId: "turn",
      attemptId: "attempt",
      toolCallId: "call-missing-route",
      toolName: tool.name,
      input: { prompt: "no mutable fallback" },
      idempotencyKey: "tool:call-missing-route",
      resources: unavailableToolResources
    })).rejects.toThrow("no frozen image generation route")
    await expect(tool.invoke({
      principalId: "principal",
      sessionId: "session",
      inputId: "input",
      turnId: "turn",
      attemptId: "attempt",
      toolCallId: "call-options-bound",
      toolName: tool.name,
      input: { prompt: "bounded", options: { value: "x".repeat(16_384) } },
      idempotencyKey: "tool:call-options-bound",
      capabilityRoutes: [route],
      resources: unavailableToolResources
    })).rejects.toThrow("options exceed")
  })

  it("returns only bounded redacted evidence from capability_request", async () => {
    const requirement = {
      operation: "image.generate" as const,
      inputModalities: ["text" as const],
      outputModalities: ["image" as const],
      features: []
    }
    const tool = createWanexAppCapabilityRequestTool({
      requirements: [requirement],
      async resolve() {
        return {
          requirement,
          status: "selection_required",
          reason: "r".repeat(700),
          candidates: [
            {
              id: "image-redacted",
              connection: {
                id: "image-redacted-connection",
                providerId: "image-provider"
              },
              protocol: { id: "image-protocol" },
              model: new ImmediateImageAdapter("image-redacted").modelEndpoint.model,
              credentialConfigured: true,
              active: false
            }
          ],
          candidatesTruncated: true,
          recommendedModelEndpointId: "image-redacted"
        }
      }
    })
    const result = await tool.invoke({
      principalId: "principal",
      sessionId: "session",
      inputId: "input",
      turnId: "turn",
      attemptId: "attempt",
      toolCallId: "capability-call",
      toolName: tool.name,
      input: { operation: "image.generate" },
      idempotencyKey: "capability-call",
      resources: unavailableToolResources
    })
    expect(result).toMatchObject({
      outcome: "succeeded",
      content: [{ value: {
        kind: "capability.request",
        requirements: [{
          candidateModelEndpointIds: ["image-redacted"],
          candidateModelEndpointIdsTruncated: true
        }]
      } }]
    })
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain("secretRef")
    expect(serialized).not.toContain("credentialConfigured")
    if (result.outcome === "succeeded") {
      const part = result.content[0]
      if (part?.type !== "json") throw new Error("missing capability JSON evidence")
      const evidence = part.value as unknown as {
        readonly requirements: readonly { readonly reason: string }[]
      }
      expect(evidence.requirements[0]?.reason).toHaveLength(512)
    }
  })

  it("submits, reads, and cancels through the public app commands", async () => {
    const adapter = new ImmediateImageAdapter()
    const app = await createWanexApp({
      storage: {
        kind: "local-system-service",
        storeDir: await createStoreDir()
      },
      artifacts: { explicitPath: serviceBin },
      mediaGenerationAdapters: [adapter]
    })

    try {
      await app.commands.upsertModelEndpoint({
        modelEndpoint: adapter.modelEndpoint,
        makeActive: false
      })
      const submitted = await app.commands.submitMediaGeneration({
        operation: "image.generate",
        prompt: "public app image",
        outputModality: "image"
      })
      expect(submitted).toMatchObject({
        operationId: expect.any(String),
        jobId: expect.any(String),
        state: "queued"
      })

      await eventually(async () => {
        await expect(
          app.commands.readMediaGenerationOperation(submitted)
        ).resolves.toMatchObject({
          kind: "found",
          operation: {
            state: "succeeded",
            outputResourceIds: [expect.any(String)]
          }
        })
      })

      await app.stop()
      const queued = await app.commands.submitMediaGeneration({
        operation: "image.generate",
        prompt: "cancel before dispatch",
        outputModality: "image"
      })
      await expect(
        app.commands.cancelMediaGeneration({
          operationId: queued.operationId,
          reason: "no longer needed"
        })
      ).resolves.toEqual({
        operationId: queued.operationId,
        status: "cancelled",
        state: "cancelled"
      })
      await expect(
        app.commands.readMediaGenerationOperation(queued)
      ).resolves.toMatchObject({
        kind: "found",
        operation: { state: "cancelled" }
      })
    } finally {
      await app.dispose()
    }
  })

  it("completes ordinary chat through the standard image Tool and resumes one logical Turn", async () => {
    const storeDir = await createStoreDir()
    const adapter = new ImmediateImageAdapter("image-chat-standard")
    const providerRequests: Record<string, unknown>[] = []
    vi.stubGlobal("fetch", async (_input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      providerRequests.push(body)
      const messages = Array.isArray(body.messages) ? body.messages : []
      const hasToolResult = messages.some(
        (message) =>
          typeof message === "object" &&
          message !== null &&
          (message as { readonly role?: unknown }).role === "tool"
      )
      return hasToolResult
        ? openAITextResponse("The generated image is ready.")
        : openAIImageToolResponse()
    })
    const secretRef = "static://app-image-chat"
    const app = await createWanexApp({
      storage: { kind: "local-system-service", storeDir },
      artifacts: { explicitPath: serviceBin },
      modelEndpoint: appTestModelEndpoint({
        endpointId: "app-image-chat-provider",
        protocolId: "openai-chat-completions",
        providerId: "openai-compatible",
        modelId: "app-image-chat-model",
        baseUrl: "https://image-chat.example.test/v1",
        secretRef
      }),
      secretResolver: new SecretResolver([
        new StaticSecretProvider({ values: { [secretRef]: "test-key" } })
      ]),
      runtimeContext: {
        toolPermissionPolicy: new AllowAllToolsPolicy()
      },
      mediaGenerationAdapters: [adapter]
    })
    const storage = createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin
    })

    try {
      await app.commands.upsertModelEndpoint({
        modelEndpoint: adapter.modelEndpoint,
        makeActive: false
      })
      const submitted = await app.commands.submitConversationOperation({
        sessionId: "session-standard-image-chat",
        content: [{ type: "text", text: "Generate a durable red triangle." }]
      })
      await eventually(async () => {
        await expect(
          app.commands.readConversationOperation(submitted)
        ).resolves.toMatchObject({
          kind: "found",
          operation: {
            state: "succeeded",
            transcript: {
              rows: [
                { role: "user" },
                { role: "assistant" },
                { role: "tool" },
                { role: "assistant", text: "The generated image is ready." }
              ]
            }
          }
        })
      })

      const turns = await storage.listSessionTurns({
        sessionId: submitted.sessionId
      })
      expect(turns).toHaveLength(1)
      expect(turns[0]).toMatchObject({
        id: submitted.turnId,
        state: "succeeded",
        executionBinding: {
          capabilityRoutes: [{
            requirement: { operation: "image.generate" },
            modelEndpoint: { endpointId: "image-chat-standard" }
          }]
        }
      })
      const attempts = await storage.listSessionAttempts({
        turnId: submitted.turnId
      })
      expect(attempts.map((attempt) => attempt.state)).toEqual([
        "suspended",
        "succeeded"
      ])
      const executions = await storage.listToolExecutions({
        turnId: submitted.turnId
      })
      expect(executions).toMatchObject([{
        toolName: "image_generate",
        state: "succeeded",
        attemptCount: 1,
        content: [{
          type: "resource",
          kind: "image",
          mediaType: "image/png"
        }]
      }])
      const operations = await storage.listMediaGenerationOperations({
        principalId: "wanex-app-user"
      })
      expect(operations).toHaveLength(1)
      expect(operations[0]).toMatchObject({
        state: "succeeded",
        conversation: {
          sessionId: submitted.sessionId,
          turnId: submitted.turnId,
          toolExecutionId: executions[0]?.id,
          toolCallId: "call_image_generate"
        },
        outputResourceIds: [expect.any(String)]
      })
      expect(adapter.submitCount).toBe(1)
      expect(providerRequests).toHaveLength(2)
      expect(providerRequests[0]).toMatchObject({
        tools: [{
          type: "function",
          function: { name: "image_generate" }
        }]
      })
      expect(providerRequests[1]).toMatchObject({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: "tool",
            tool_call_id: "call_image_generate"
          })
        ])
      })
    } finally {
      await storage.dispose()
      await app.dispose()
    }
  })

  it("requires explicit selection for multiple executable endpoints and routes exactly", async () => {
    const adapter = new ImmediateImageAdapter("image-protocol-adapter")
    const firstEndpoint = new ImmediateImageAdapter("image-a").modelEndpoint
    const secondEndpoint = new ImmediateImageAdapter("image-b").modelEndpoint
    const app = await createWanexApp({
      storage: {
        kind: "local-system-service",
        storeDir: await createStoreDir()
      },
      artifacts: { explicitPath: serviceBin },
      mediaGenerationAdapters: [adapter]
    })

    try {
      await app.commands.upsertModelEndpoint({
        modelEndpoint: firstEndpoint,
        makeActive: false
      })
      await app.commands.upsertModelEndpoint({
        modelEndpoint: secondEndpoint,
        makeActive: false
      })
      const requirement = {
        operation: "image.generate" as const,
        inputModalities: ["text" as const],
        outputModalities: ["image" as const],
        features: []
      }
      await expect(
        app.commands.readModelCapabilityReadiness({ requirement })
      ).resolves.toMatchObject({
        status: "selection_required",
        candidates: [{ id: "image-a" }, { id: "image-b" }],
        recommendedModelEndpointId: "image-a"
      })
      await expect(
        app.commands.submitMediaGeneration({
          operation: "image.generate",
          prompt: "must select first",
          outputModality: "image"
        })
      ).rejects.toThrow("selection_required")

      await expect(
        app.commands.setModelCapabilityRoute({
          operation: "image.generate",
          modelEndpointId: "image-b"
        })
      ).resolves.toMatchObject({
        status: "ready",
        selectedEndpoint: { id: "image-b" },
        selectedSource: "configured"
      })
      await expect(app.commands.listModelCapabilityRoutes()).resolves.toEqual({
        routes: [
          { operation: "image.generate", modelEndpointId: "image-b" }
        ]
      })

      const submitted = await app.commands.submitMediaGeneration({
        operation: "image.generate",
        prompt: "route to image b",
        outputModality: "image"
      })
      await eventually(async () => {
        await expect(
          app.commands.readMediaGenerationOperation(submitted)
        ).resolves.toMatchObject({
          kind: "found",
          operation: {
            state: "succeeded",
            binding: { endpointId: "image-b" }
          }
        })
      })
      expect(adapter.submittedEndpointIds).toEqual(["image-b"])

      await expect(
        app.commands.clearModelCapabilityRoute({
          operation: "image.generate"
        })
      ).resolves.toMatchObject({ status: "selection_required" })
    } finally {
      await app.dispose()
    }
  })

  it("preserves a configured route but fails closed when its executor is absent", async () => {
    const storeDir = await createStoreDir()
    const configured = new ImmediateImageAdapter(
      "image-configured",
      "image-configured-protocol"
    )
    const first = await createWanexApp({
      storage: { kind: "local-system-service", storeDir },
      artifacts: { explicitPath: serviceBin },
      mediaGenerationAdapters: [configured]
    })
    await first.commands.upsertModelEndpoint({
      modelEndpoint: configured.modelEndpoint,
      makeActive: false
    })
    await first.commands.setModelCapabilityRoute({
      operation: "image.generate",
      modelEndpointId: configured.modelEndpoint.id
    })
    await first.dispose()

    const fallback = new ImmediateImageAdapter(
      "image-fallback",
      "image-fallback-protocol"
    )
    const restarted = await createWanexApp({
      storage: { kind: "local-system-service", storeDir },
      artifacts: { explicitPath: serviceBin },
      mediaGenerationAdapters: [fallback]
    })
    try {
      await restarted.commands.upsertModelEndpoint({
        modelEndpoint: fallback.modelEndpoint,
        makeActive: false
      })
      const requirement = {
        operation: "image.generate" as const,
        inputModalities: ["text" as const],
        outputModalities: ["image" as const],
        features: []
      }
      await expect(
        restarted.commands.readModelCapabilityReadiness({ requirement })
      ).resolves.toMatchObject({
        status: "configured_endpoint_unavailable",
        candidates: [{ id: "image-fallback" }],
        recommendedModelEndpointId: "image-fallback"
      })
      await expect(
        restarted.commands.submitMediaGeneration({
          operation: "image.generate",
          prompt: "do not silently cross-route",
          outputModality: "image"
        })
      ).rejects.toThrow("configured_endpoint_unavailable")
      expect(fallback.submitCount).toBe(0)
    } finally {
      await restarted.dispose()
    }
  })

  it("freezes the resolved capability route per admitted turn", async () => {
    const storeDir = await createStoreDir()
    const tools = new ToolRegistry()
    tools.register(imageCapabilityTool())
    const adapter = new ImmediateImageAdapter("image-turn-protocol-adapter")
    const firstEndpoint = new ImmediateImageAdapter("image-turn-a").modelEndpoint
    const secondEndpoint = new ImmediateImageAdapter("image-turn-b").modelEndpoint
    const app = await createWanexApp({
      storage: { kind: "local-system-service", storeDir },
      artifacts: { explicitPath: serviceBin },
      modelEndpoint: appTestModelEndpoint(),
      runtimeContext: { tools },
      mediaGenerationAdapters: [adapter]
    })
    const storage = createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin
    })
    try {
      await app.commands.upsertModelEndpoint({
        modelEndpoint: firstEndpoint,
        makeActive: false
      })
      await app.commands.upsertModelEndpoint({
        modelEndpoint: secondEndpoint,
        makeActive: false
      })
      await app.stop()
      await app.commands.setModelCapabilityRoute({
        operation: "image.generate",
        modelEndpointId: "image-turn-a"
      })
      const first = await app.commands.submitConversationOperation({
        sessionId: "session-capability-route-a",
        content: [{ type: "text", text: "freeze route a" }]
      })
      await app.commands.setModelCapabilityRoute({
        operation: "image.generate",
        modelEndpointId: "image-turn-b"
      })
      const second = await app.commands.submitConversationOperation({
        sessionId: "session-capability-route-b",
        content: [{ type: "text", text: "freeze route b" }]
      })

      const [firstTurn] = await storage.listSessionTurns({
        sessionId: first.sessionId
      })
      const [secondTurn] = await storage.listSessionTurns({
        sessionId: second.sessionId
      })
      expect(
        firstTurn?.executionBinding.capabilityRoutes[0]?.modelEndpoint.endpointId
      ).toBe("image-turn-a")
      expect(
        secondTurn?.executionBinding.capabilityRoutes[0]?.modelEndpoint.endpointId
      ).toBe("image-turn-b")
      const standardImageTool = (
        firstTurn?.executionBinding.toolSnapshot as {
          readonly tools?: readonly {
            readonly descriptor?: {
              readonly name?: string
              readonly resultMode?: string
            }
          }[]
        } | undefined
      )?.tools?.find((tool) => tool.descriptor?.name === "image_generate")
      expect(standardImageTool?.descriptor).toMatchObject({
        name: "image_generate",
        resultMode: "deferred"
      })
    } finally {
      await storage.dispose()
      await app.dispose()
    }
  })
})

class ImmediateImageAdapter implements MediaGenerationAdapter {
  readonly modelEndpoint: MediaGenerationModelEndpoint
  submitCount = 0
  readonly submittedEndpointIds: string[] = []

  constructor(
    endpointId = "app-image-profile",
    protocolId = "app-image-protocol"
  ) {
    this.modelEndpoint = {
      id: endpointId,
      connection: {
        id: `${endpointId}-connection`,
        providerId: "app-image-provider"
      },
      protocol: { id: protocolId },
      model: {
        id: `${endpointId}-model`,
        operations: ["image.generate"],
        inputModalities: ["text"],
        outputModalities: ["image"],
        features: [],
        catalog: {
          source: "custom",
          catalogId: `test.${endpointId}`,
          revision: "1"
        }
      }
    }
  }

  get protocolId(): string {
    return this.modelEndpoint.protocol.id
  }

  canExecute(modelEndpoint: ModelEndpoint): boolean {
    return modelEndpoint.protocol.id === this.protocolId
  }

  async submit(
    request: Parameters<MediaGenerationAdapter["submit"]>[0]
  ): Promise<MediaGenerationSubmitResult> {
    this.submitCount += 1
    this.submittedEndpointIds.push(request.binding.endpointId)
    return {
      status: "completed",
      outputs: [
        {
          kindOfOutput: "inline_bytes",
          bytes: Buffer.from("app-generated-image"),
          mediaType: "image/png",
          kind: "image"
        }
      ]
    }
  }

  async poll(): Promise<MediaGenerationPollResult> {
    throw new Error("immediate image adapter does not poll")
  }
}

function imageCapabilityTool(): ToolDefinition {
  return {
    name: "generate_image",
    description: "Generate an image.",
    inputSchema: { type: "object" },
    risk: "external",
    idempotent: false,
    concurrency: "exclusive",
    resultMode: "immediate",
    requiredCapabilities: [
      {
        operation: "image.generate",
        inputModalities: ["text"],
        outputModalities: ["image"],
        features: []
      }
    ],
    runtimeBinding: createToolRuntimeBinding({
      implementationId: "wanex.test.image-capability",
      implementationRevision: "1"
    }),
    async invoke(invocation) {
      return {
        outcome: "succeeded",
        toolCallId: invocation.toolCallId,
        content: jsonToolResultContent(null)
      }
    }
  }
}

const unavailableToolResources = {
  async publish(): Promise<never> {
    throw new Error("unexpected resource publication")
  },
  async reference(): Promise<never> {
    throw new Error("unexpected resource lookup")
  }
}

async function eventually(assertion: () => Promise<void>): Promise<void> {
  let lastError: unknown
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      await assertion()
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  }
  throw lastError
}

function openAIImageToolResponse() {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    body: (async function* () {
      yield `data: ${JSON.stringify({
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              id: "call_image_generate",
              function: {
                name: "image_generate",
                arguments: JSON.stringify({ prompt: "a durable red triangle" })
              }
            }]
          },
          finish_reason: "tool_calls"
        }]
      })}\n\n`
      yield "data: [DONE]\n\n"
    })(),
    async text() {
      return ""
    }
  }
}

function openAITextResponse(text: string) {
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
  }
}
