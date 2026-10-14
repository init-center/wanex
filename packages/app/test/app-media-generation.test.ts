import { afterEach, describe, expect, it, vi } from "vitest"
import type {
  MediaGenerationModelEndpoint,
  ModelOptionDescriptor,
  ModelEndpoint
} from "@wanex/protocol"
import type {
  MediaGenerationAdapter,
  MediaGenerationPollResult,
  MediaGenerationSubmitResult
} from "@wanex/runtime/media-generation"
import { createMediaGenerationCapability } from "@wanex/runtime/media-generation"
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
import {
  createWanexAppImageGenerationTool
} from "../src/image-generation-tool.js"
import { createStoreDir, serviceBin } from "./helpers.js"
import { appTestModelEndpoint } from "./model-endpoint-fixture.js"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("@wanex/app media generation facade", () => {
  it("prepares a bounded deferred image request from the frozen capability route", async () => {
    const generationOptions = [{ name: "quality", description: "Test image quality", type: "string", enum: ["high", "low"] }] as const
    const adapter = new ImmediateImageAdapter("image-standard-tool", "app-image-protocol", false, generationOptions)
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
    const tool = createWanexAppImageGenerationTool({ generationOptions })
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
    expect(tool.inputSchema).toMatchObject({
      properties: { prompt: expect.anything(), options: {
        properties: { quality: { type: "string", enum: ["high", "low"] } },
        additionalProperties: false
      } }
    })
    expect(tool.inputSchema).not.toHaveProperty("properties.images")
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
    for (const invalidOptions of [{ quality: "auto" }, { unknown: true }, { quality: 1 }]) {
      await expect(tool.invoke({
        principalId: "principal", sessionId: "session", inputId: "input", turnId: "turn", attemptId: "attempt",
        toolCallId: "invalid-option", toolName: tool.name, input: { prompt: "draw", options: invalidOptions },
        idempotencyKey: "invalid-option", capabilityRoutes: [route], resources: unavailableToolResources
      })).rejects.toThrow("model option")
    }
    expect(createWanexAppImageGenerationTool().inputSchema).not.toHaveProperty("properties.options")
    await expect(createWanexAppImageGenerationTool().invoke({
      principalId: "principal", sessionId: "session", inputId: "input", turnId: "turn", attemptId: "attempt",
      toolCallId: "mismatched-options", toolName: tool.name, input: { prompt: "draw" },
      idempotencyKey: "mismatched-options", capabilityRoutes: [route], resources: unavailableToolResources
    })).rejects.toThrow("do not match the frozen route")
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

  it("prepares reference image generation only from exact image resources on the generation route", async () => {
    const base = new ImmediateImageAdapter("image-edit-tool").modelEndpoint
    const modelEndpoint = {
      ...base,
      model: { ...base.model, operations: ["image.generate"], inputModalities: ["text", "image"] }
    } as typeof base
    const route = createModelCapabilityRouteExecutionBinding({
      requirement: {
        operation: "image.generate",
        inputModalities: ["text"],
        outputModalities: ["image"],
        features: []
      },
      source: "single_candidate",
      modelEndpoint
    })
    const evidence = {
      res_photo: { resourceId: "res_photo", sha256: "a".repeat(64), sizeBytes: 9, kind: "image" as const, mediaType: "image/png" },
      res_notes: { resourceId: "res_notes", sha256: "b".repeat(64), sizeBytes: 4, kind: "document" as const, mediaType: "application/pdf" }
    }
    const resources = {
      async publish(): Promise<never> {
        throw new Error("image_generate must not publish resources")
      },
      async reference(resourceId: string) {
        const found = evidence[resourceId as keyof typeof evidence]
        if (found === undefined) throw new Error(`tool resource not found: ${resourceId}`)
        return { type: "resource" as const, ...found }
      }
    }
    const tool = createWanexAppImageGenerationTool({ acceptsReferenceImages: true })
    const invoke = (input: Record<string, unknown>, capabilityRoutes = [route]) => tool.invoke({
      principalId: "principal",
      sessionId: "session",
      inputId: "input",
      turnId: "turn",
      attemptId: "attempt",
      toolCallId: "call-edit",
      toolName: tool.name,
      input: input as never,
      idempotencyKey: "tool:call-edit",
      capabilityRoutes,
      resources
    })

    expect(tool).toMatchObject({
      name: "image_generate",
      resultMode: "deferred",
      requiredCapabilities: [{ operation: "image.generate", inputModalities: ["text"] }]
    })
    expect(tool.inputSchema).toHaveProperty("properties.images")
    await expect(invoke({ prompt: " make it blue ", images: ["res_photo"] })).resolves.toMatchObject({
      outcome: "deferred",
      operation: {
        kind: "media_generation",
        binding: {
          request: {
            operation: "image.generate",
            prompt: "make it blue",
            inputResources: [evidence.res_photo]
          }
        }
      }
    })
    await expect(invoke({ prompt: "x", images: ["res_notes"] })).rejects.toThrow("not an image")
    await expect(invoke({ prompt: "x", images: [] })).rejects.toThrow("distinct resource ids")
    await expect(invoke({ prompt: "x", images: ["res_photo", "res_photo"] })).rejects.toThrow("distinct resource ids")
    await expect(invoke({ prompt: "x", images: ["res_missing"] })).rejects.toThrow("not found")
    await expect(invoke({ prompt: "x", images: ["res_photo"] }, [])).rejects.toThrow("no frozen image generation route")
    await expect(invoke({ prompt: "x" })).resolves.toMatchObject({
      operation: { binding: { request: { inputResources: [] } } }
    })
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
      mediaGeneration: createMediaGenerationCapability({ adapters: [adapter] })
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
      mediaGeneration: createMediaGenerationCapability({ adapters: [adapter] })
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
        tools: [
          { type: "function", function: { name: "image_generate" } }
        ]
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

  it("generates from a user attachment through the routed image_generate Tool", async () => {
    const storeDir = await createStoreDir()
    const adapter = new ImmediateImageAdapter("image-chat-edit", "app-image-protocol", true)
    const storage = createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin
    })
    const providerRequests: Record<string, unknown>[] = []
    let attachedId = ""
    vi.stubGlobal("fetch", async (_input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      providerRequests.push(body)
      const messages = Array.isArray(body.messages) ? body.messages : []
      return messages.some((message) => (message as { role?: unknown }).role === "tool")
        ? openAITextResponse("The edited image is ready.")
        : openAIImageToolResponse("image_generate", { prompt: "make it blue", images: [attachedId] })
    })
    const secretRef = "static://app-image-edit"
    const app = await createWanexApp({
      storage: { kind: "local-system-service", storeDir },
      artifacts: { explicitPath: serviceBin },
      modelEndpoint: appTestModelEndpoint({
        endpointId: "app-image-edit-provider",
        protocolId: "openai-chat-completions",
        providerId: "openai-compatible",
        modelId: "app-image-edit-model",
        baseUrl: "https://image-edit.example.test/v1",
        secretRef,
        inputModalities: ["text", "image"]
      }),
      secretResolver: new SecretResolver([
        new StaticSecretProvider({ values: { [secretRef]: "test-key" } })
      ]),
      runtimeContext: { toolPermissionPolicy: new AllowAllToolsPolicy() },
      mediaGeneration: createMediaGenerationCapability({ adapters: [adapter] })
    })

    try {
      await app.commands.upsertModelEndpoint({ modelEndpoint: adapter.modelEndpoint, makeActive: false })
      const attached = await storage.ingestResource({
        content: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
        kind: "image",
        mediaType: "image/png",
        origin: "user_upload"
      })
      attachedId = attached.id
      const submitted = await app.commands.submitConversationOperation({
        sessionId: "session-image-edit",
        content: [
          { type: "text", text: "Make this blue." },
          { type: "resource", resourceId: attached.id }
        ]
      })
      await eventually(async () => {
        await expect(app.commands.readConversationOperation(submitted)).resolves.toMatchObject({
          kind: "found",
          operation: { state: "succeeded" }
        })
      })

      expect(providerRequests[0]).toMatchObject({
        tools: [
          { type: "function", function: { name: "image_generate" } }
        ]
      })
      // The model sees the attachment's id next to its pixels.
      expect(JSON.stringify(providerRequests[0])).toContain(`[image ${attached.id}]`)
      expect(adapter.submittedInputs).toEqual([[{ resourceId: attached.id, bytes: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=" }]])
      const operations = await storage.listMediaGenerationOperations({ principalId: "wanex-app-user" })
      expect(operations[0]).toMatchObject({
        state: "succeeded",
        binding: { request: { operation: "image.generate", inputResources: [{ resourceId: attached.id }] } }
      })
      // The edited image reaches the model after the tool result.
      expect(JSON.stringify(providerRequests[1])).toContain("Images returned by the tool calls above:")
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
      mediaGeneration: createMediaGenerationCapability({ adapters: [adapter] })
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
      mediaGeneration: createMediaGenerationCapability({ adapters: [configured] })
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
      mediaGeneration: createMediaGenerationCapability({ adapters: [fallback] })
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
    const firstOptions = [{ name: "quality", description: "First route quality", type: "string", enum: ["high", "low"] }] as const
    const secondOptions = [{ name: "n", description: "Second route count", type: "integer", minimum: 1, maximum: 2 }] as const
    const firstEndpoint = new ImmediateImageAdapter("image-turn-a", "app-image-protocol", false, firstOptions).modelEndpoint
    const secondEndpoint = new ImmediateImageAdapter("image-turn-b", "app-image-protocol", false, secondOptions).modelEndpoint
    const app = await createWanexApp({
      storage: { kind: "local-system-service", storeDir },
      artifacts: { explicitPath: serviceBin },
      modelEndpoint: appTestModelEndpoint(),
      runtimeContext: { tools },
      mediaGeneration: createMediaGenerationCapability({ adapters: [adapter] })
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
      expect(firstTurn?.executionBinding.capabilityRoutes[0]?.modelEndpoint.model.generationOptions).toEqual(firstOptions)
      expect(secondTurn?.executionBinding.capabilityRoutes[0]?.modelEndpoint.model.generationOptions).toEqual(secondOptions)
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
        resultMode: "deferred",
        inputSchema: { properties: { options: { properties: { quality: { enum: ["high", "low"] } }, additionalProperties: false } } }
      })
      const secondSnapshot = secondTurn?.executionBinding.toolSnapshot as { tools?: { descriptor?: { name?: string; inputSchema?: unknown } }[] }
      expect(secondSnapshot.tools?.find((tool) => tool.descriptor?.name === "image_generate")?.descriptor?.inputSchema).toMatchObject({ properties: { options: { properties: { n: { minimum: 1, maximum: 2 } } } } })
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
  readonly submittedInputs: Array<readonly { readonly resourceId: string; readonly bytes: string }[]> = []

  constructor(
    endpointId = "app-image-profile",
    protocolId = "app-image-protocol",
    edits = false,
    generationOptions?: readonly ModelOptionDescriptor[]
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
        ...(generationOptions === undefined ? {} : { generationOptions }),
        operations: ["image.generate"],
        inputModalities: edits ? ["text", "image"] : ["text"],
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
    this.submittedInputs.push(request.inputs.map((input) => ({
      resourceId: input.resource.resourceId,
      bytes: Buffer.from(input.bytes).toString("base64")
    })))
    return {
      status: "completed",
      outputs: [
        {
          kindOfOutput: "inline_bytes",
          bytes: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
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

function openAIImageToolResponse(
  name = "image_generate",
  input: Record<string, unknown> = { prompt: "a durable red triangle" }
) {
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
              id: `call_${name}`,
              function: {
                name,
                arguments: JSON.stringify(input)
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
