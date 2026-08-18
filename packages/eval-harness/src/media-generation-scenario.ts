import { join } from "node:path"
import { createWanexApp } from "@wanex/app"
import type {
  MediaGenerationModelEndpoint,
  ModelEndpoint
} from "@wanex/protocol"
import { SecretResolver, StaticSecretProvider } from "@wanex/runtime/secrets"
import { AllowAllToolsPolicy } from "@wanex/runtime/tools"
import type {
  MediaGenerationAdapter,
  MediaGenerationAdapterRequest,
  MediaGenerationMaterializedOutput,
  MediaGenerationPollResult,
  MediaGenerationSubmitResult
} from "@wanex/runtime/media-generation"
import { createStorageTestStore } from "@wanex/storage/testing"
import { createEvalScenario } from "./runner.js"
import {
  assert,
  evalOpenAICompatibleModelEndpoint
} from "./scenario-utils.js"

export const mediaGenerationAppPathScenario = createEvalScenario({
  id: "media-generation.app-path",
  title: "App media generation persists checkpoints and materializes provider references",
  tags: ["app", "media", "provider", "resource"],
  async run(context) {
    const modelEndpoint = evalMediaGenerationEndpoint()
    const adapter = new EvalMediaGenerationAdapter(modelEndpoint.protocol.id)
    const app = await createWanexApp({
      storage: {
        kind: "local-system-service",
        mode: "persistent",
        storeDir: join(context.storeDir, "media-generation-app")
      },
      artifacts: { explicitPath: context.serviceBin },
      mediaGenerationAdapters: [adapter],
      mediaGenerationPollInitialDelayMs: 20,
      mediaGenerationPollMaxDelayMs: 20
    })
    try {
      await app.commands.upsertModelEndpoint({
        modelEndpoint,
        makeActive: false
      })
      const receipt = await app.commands.submitMediaGeneration({
        operation: "image.generate",
        prompt: "eval generated image",
        outputModality: "image",
        idempotencyKey: "eval-media-generation"
      })
      const operation = await waitForMediaGeneration(app, receipt.operationId)
      assert(operation.state === "succeeded", "media generation should succeed")
      assert(
        operation.externalOperationId === "eval-provider-operation",
        "provider acceptance must be durable"
      )
      assert(
        operation.outputReferences[0]?.providerFileId === "eval-provider-file",
        "provider file reference must remain operation evidence"
      )
      assert(operation.pollCount === 2, "each provider poll must be durable")
      assert(
        operation.consecutivePollFailures === 0,
        "successful polling must clear transient failure state"
      )
      const resourceId = operation.outputResourceIds[0]
      assert(resourceId !== undefined, "generation should publish one resource")
      const resource = await app.commands.readResource({ resourceId })
      assert(resource?.state === "available", "generated resource must be available")
      assert(resource.sha256.length === 64, "generated resource must have sha256 evidence")
      return {
        operationId: operation.id,
        operationState: operation.state,
        externalOperationId: operation.externalOperationId,
        outputReferenceCount: operation.outputReferences.length,
        outputResourceId: resource.id,
        resourceState: resource.state,
        pollCount: adapter.pollCount,
        materializeCount: adapter.materializeCount
      }
    } finally {
      await app.dispose()
    }
  }
})

export const imageGenerationConversationScenario = createEvalScenario({
  id: "media-generation.conversation-tool-resume",
  title: "Conversation image Tool suspends and resumes one durable Turn",
  tags: ["app", "conversation", "media", "tool", "resource", "durable"],
  async run(context) {
    const storeDir = join(context.storeDir, "image-generation-conversation")
    const imageEndpoint = evalDeferredImageEndpoint()
    const adapter = new EvalDeferredImageAdapter(imageEndpoint.protocol.id)
    const providerRequests: Record<string, unknown>[] = []
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
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
        ? openAITextResponse("The durable generated image is ready.")
        : openAIImageToolResponse()
    }) as unknown as typeof globalThis.fetch

    const secretRef = "static://eval-image-generation-conversation"
    const app = await createWanexApp({
      storage: {
        kind: "local-system-service",
        mode: "persistent",
        storeDir
      },
      artifacts: { explicitPath: context.serviceBin },
      modelEndpoint: evalOpenAICompatibleModelEndpoint({
        id: "eval-image-conversation-provider",
        modelId: "eval-image-conversation-model",
        baseUrl: "https://image-conversation.example.test/v1",
        secretRef
      }),
      secretResolver: new SecretResolver([
        new StaticSecretProvider({ values: { [secretRef]: "eval-secret" } })
      ]),
      runtimeContext: {
        toolPermissionPolicy: new AllowAllToolsPolicy()
      },
      mediaGenerationAdapters: [adapter],
      mediaGenerationPollInitialDelayMs: 20,
      mediaGenerationPollMaxDelayMs: 20
    })
    const storage = createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin: context.serviceBin
    })

    try {
      await app.commands.upsertModelEndpoint({
        modelEndpoint: imageEndpoint,
        makeActive: false
      })
      const submitted = await app.commands.submitConversationOperation({
        sessionId: "session_eval_image_conversation",
        content: [{
          type: "text",
          text: "Generate a durable red triangle image."
        }]
      })
      const waiting = await waitForConversationState(
        app,
        submitted,
        "waiting"
      )
      assert(
        waiting.operation.state === "waiting",
        "conversation should durably wait for media settlement"
      )

      const waitingTurns = await storage.listSessionTurns({
        sessionId: submitted.sessionId
      })
      assert(waitingTurns.length === 1, "conversation should own one logical Turn")
      const waitingAttempts = await storage.listSessionAttempts({
        turnId: submitted.turnId
      })
      assert(
        waitingAttempts.length === 1 &&
          waitingAttempts[0]?.state === "suspended" &&
          waitingAttempts[0].finishedAt !== undefined,
        "deferred handoff should end the first physical Session attempt"
      )
      const waitingJob = await storage.getJob({ jobId: submitted.jobId })
      assert(
        waitingJob?.state === "waiting" &&
          waitingJob.leaseOwner === undefined &&
          waitingJob.leaseToken === undefined &&
          waitingJob.leaseExpiresAt === undefined,
        "waiting Session Job must release its scheduler lease"
      )
      const waitingExecutions = await storage.listToolExecutions({
        turnId: submitted.turnId
      })
      assert(
        waitingExecutions.length === 1 &&
          waitingExecutions[0]?.toolName === "image_generate" &&
          waitingExecutions[0].state === "waiting" &&
          waitingExecutions[0].attemptCount === 1,
        "standard image Tool should hand off exactly once"
      )
      const waitingToolAttempts = await storage.listToolExecutionAttempts({
        executionId: waitingExecutions[0]!.id
      })
      assert(
        waitingToolAttempts.length === 1 &&
          waitingToolAttempts[0]?.state === "suspended",
        "deferred handoff should suspend the physical Tool invocation"
      )

      adapter.allowCompletion = true
      const completed = await waitForConversationState(
        app,
        submitted,
        "succeeded"
      )
      const attempts = await storage.listSessionAttempts({
        turnId: submitted.turnId
      })
      assert(
        attempts.map((attempt) => attempt.state).join(",") ===
          "suspended,succeeded",
        "one logical Turn should use suspended then succeeded physical attempts"
      )
      const executions = await storage.listToolExecutions({
        turnId: submitted.turnId
      })
      assert(
        executions.length === 1 &&
          executions[0]?.state === "succeeded" &&
          executions[0].attemptCount === 1 &&
          executions[0].content?.[0]?.type === "resource",
        "resumption should reuse one settled Resource-bearing Tool execution"
      )
      const operations = await storage.listMediaGenerationOperations({
        principalId: "wanex-app-user"
      })
      assert(
        operations.length === 1 &&
          operations[0]?.state === "succeeded" &&
          operations[0].conversation?.sessionId === submitted.sessionId &&
          operations[0].conversation.turnId === submitted.turnId &&
          operations[0].conversation.toolExecutionId === executions[0].id &&
          operations[0].conversation.toolCallId === "call_eval_image_generate",
        "media operation should retain the exact conversation relation"
      )
      const resourceId = operations[0].outputResourceIds[0]
      assert(resourceId !== undefined, "media completion should publish a Resource")
      const resource = await app.commands.readResource({ resourceId })
      assert(
        resource?.state === "available" &&
          resource.kind === "image" &&
          resource.mediaType === "image/png" &&
          resource.sha256.length === 64,
        "generated Resource should retain immutable media evidence"
      )
      const content = await app.commands.readResourceContent({
        resourceId,
        expectedSha256: resource.sha256,
        offset: 0,
        limit: resource.sizeBytes
      })
      assert(
        content !== null &&
          content.offset === 0 &&
          content.totalSizeBytes === EVAL_DEFERRED_IMAGE_BYTES.byteLength &&
          content.eof &&
          Buffer.from(content.content).equals(EVAL_DEFERRED_IMAGE_BYTES),
        "trusted App reads should recover exact generated bytes"
      )
      const roles = completed.operation.transcript.rows.map((row) => row.role)
      assert(
        roles.join(",") === "user,assistant,tool,assistant",
        "resumed transcript should preserve one canonical Tool exchange"
      )
      const toolRow = completed.operation.transcript.rows.find(
        (row) => row.role === "tool"
      )
      assert(
        toolRow?.parts.some(
          (part) => part.type === "resource" && part.resourceId === resourceId
        ) === true,
        "App transcript should project generated Resource evidence"
      )
      const finalAssistant = completed.operation.transcript.rows.at(-1)
      assert(
        finalAssistant?.role === "assistant" &&
          finalAssistant.text === "The durable generated image is ready.",
        "conversation should continue with a canonical assistant reply"
      )
      assert(
        adapter.submitCount === 1 && adapter.materializeCount === 1,
        "media Provider submission and materialization must each run once"
      )
      assert(
        providerRequests.length === 2,
        "conversation Provider should run once before and once after suspension"
      )
      assert(
        secondRequestHasToolResult(providerRequests[1]),
        "second Provider request should contain the canonical Tool result"
      )

      return {
        turnId: submitted.turnId,
        turnState: completed.operation.state,
        sessionAttemptStates: attempts.map((attempt) => attempt.state),
        toolAttemptCount: executions[0].attemptCount,
        mediaSubmitCount: adapter.submitCount,
        providerRequestCount: providerRequests.length,
        resourceId,
        resourceSizeBytes: content.totalSizeBytes,
        resourceMediaType: resource.mediaType
      }
    } finally {
      await storage.dispose()
      await app.dispose()
      globalThis.fetch = originalFetch
    }
  }
})

class EvalMediaGenerationAdapter implements MediaGenerationAdapter {
  pollCount = 0
  materializeCount = 0

  constructor(readonly protocolId: string) {}

  canExecute(modelEndpoint: ModelEndpoint): boolean {
    return canGenerateImage(modelEndpoint, this.protocolId)
  }

  async submit(): Promise<MediaGenerationSubmitResult> {
    return {
      status: "accepted",
      externalOperationId: "eval-provider-operation",
      providerCheckpoint: { cursor: 0 }
    }
  }

  async poll(): Promise<MediaGenerationPollResult> {
    this.pollCount += 1
    if (this.pollCount === 1) {
      return {
        status: "pending",
        providerCheckpoint: { cursor: 1 },
        progress: { percent: 50 }
      }
    }
    return {
      status: "completed",
      outputs: [
        {
          kindOfOutput: "provider_file",
          provider: "eval-media-provider",
          fileId: "eval-provider-file",
          mediaType: "image/png",
          kind: "image"
        }
      ]
    }
  }

  async materialize(
    _reference: Parameters<NonNullable<MediaGenerationAdapter["materialize"]>>[0],
    _request: MediaGenerationAdapterRequest
  ): Promise<MediaGenerationMaterializedOutput> {
    this.materializeCount += 1
    return {
      bytes: Buffer.from("eval-generated-image"),
      mediaType: "image/png",
      kind: "image"
    }
  }
}

class EvalDeferredImageAdapter implements MediaGenerationAdapter {
  allowCompletion = false
  submitCount = 0
  pollCount = 0
  materializeCount = 0

  constructor(readonly protocolId: string) {}

  canExecute(modelEndpoint: ModelEndpoint): boolean {
    return canGenerateImage(modelEndpoint, this.protocolId)
  }

  async submit(): Promise<MediaGenerationSubmitResult> {
    this.submitCount += 1
    return {
      status: "accepted",
      externalOperationId: "eval-image-conversation-operation"
    }
  }

  async poll(): Promise<MediaGenerationPollResult> {
    this.pollCount += 1
    if (!this.allowCompletion) {
      return {
        status: "pending",
        providerCheckpoint: { poll: this.pollCount }
      }
    }
    return {
      status: "completed",
      outputs: [{
        kindOfOutput: "provider_file",
        provider: "eval-image-generation-provider",
        fileId: "eval-image-conversation-file",
        mediaType: "image/png",
        kind: "image"
      }]
    }
  }

  async materialize(): Promise<MediaGenerationMaterializedOutput> {
    this.materializeCount += 1
    return {
      bytes: EVAL_DEFERRED_IMAGE_BYTES,
      mediaType: "image/png",
      kind: "image"
    }
  }
}

function evalMediaGenerationEndpoint(): MediaGenerationModelEndpoint {
  return {
    id: "eval-media-profile",
    connection: {
      id: "eval-media-connection",
      providerId: "eval-media-provider"
    },
    protocol: { id: "eval-media-generation" },
    model: {
      id: "eval-media-model",
      operations: ["image.generate"],
      inputModalities: ["text"],
      outputModalities: ["image"],
      features: [],
      catalog: {
        source: "builtin",
        catalogId: "eval.media-generation",
        revision: "1"
      }
    }
  }
}

function evalDeferredImageEndpoint(): MediaGenerationModelEndpoint {
  return {
    id: "eval-image-generation-endpoint",
    connection: {
      id: "eval-image-generation-connection",
      providerId: "eval-image-generation-provider"
    },
    protocol: { id: "eval-image-generation" },
    model: {
      id: "eval-image-generation-model",
      operations: ["image.generate"],
      inputModalities: ["text"],
      outputModalities: ["image"],
      features: [],
      catalog: {
        source: "builtin",
        catalogId: "eval.image-generation.conversation",
        revision: "1"
      }
    }
  }
}

function canGenerateImage(
  modelEndpoint: ModelEndpoint,
  protocolId: string
): boolean {
  return modelEndpoint.protocol.id === protocolId &&
    modelEndpoint.model.operations.includes("image.generate") &&
    modelEndpoint.model.inputModalities.includes("text") &&
    modelEndpoint.model.outputModalities.includes("image")
}

const EVAL_DEFERRED_IMAGE_BYTES = Buffer.from("eval-durable-generated-image")

async function waitForMediaGeneration(
  app: Awaited<ReturnType<typeof createWanexApp>>,
  operationId: string
) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const result = await app.commands.readMediaGenerationOperation({ operationId })
    if (
      result.kind === "found" &&
      ["succeeded", "failed", "cancelled", "recovery_required"].includes(
        result.operation.state
      )
    ) {
      return result.operation
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error("Eval media generation did not reach terminal state")
}

async function waitForConversationState(
  app: Awaited<ReturnType<typeof createWanexApp>>,
  reference: Parameters<
    Awaited<ReturnType<typeof createWanexApp>>["commands"]["readConversationOperation"]
  >[0],
  state: "waiting" | "succeeded"
) {
  let lastState: string | undefined
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const result = await app.commands.readConversationOperation(reference)
    if (result.kind === "found") {
      lastState = result.operation.state
      if (result.operation.state === state) return result
      if (
        result.operation.state === "failed" ||
        result.operation.state === "cancelled" ||
        result.operation.state === "interrupted" ||
        result.operation.state === "recovery_required"
      ) {
        throw new Error(
          `Eval image conversation reached ${result.operation.state} while waiting for ${state}`
        )
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(
    `Eval image conversation did not reach ${state}; last state was ${String(lastState)}`
  )
}

function openAIImageToolResponse(): Response {
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
              id: "call_eval_image_generate",
              function: {
                name: "image_generate",
                arguments: JSON.stringify({
                  prompt: "a durable red triangle image"
                })
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
  } as unknown as Response
}

function openAITextResponse(text: string): Response {
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

function secondRequestHasToolResult(
  request: Record<string, unknown> | undefined
): boolean {
  if (request === undefined || !Array.isArray(request.messages)) return false
  return request.messages.some(
    (message) =>
      typeof message === "object" &&
      message !== null &&
      (message as { readonly role?: unknown }).role === "tool" &&
      (message as { readonly tool_call_id?: unknown }).tool_call_id ===
        "call_eval_image_generate"
  )
}
