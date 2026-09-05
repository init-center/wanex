import { afterEach, describe, expect, it, vi } from "vitest"
import { createStorageHandle } from "@wanex/storage"
import {
  EnvSecretProvider,
  SecretResolver
} from "@wanex/runtime/secrets"
import {
  AllowAllToolsPolicy,
  createToolRuntimeBinding,
  ToolRegistry,
  type ToolDefinition,
  type ToolPermissionDecision,
  type ToolPermissionPolicy,
  type ToolPermissionRequest
} from "@wanex/runtime/tools"
import { createWanexApp } from "../src/internal-index.js"
import { createStoreDir, serviceBin } from "./helpers.js"
import { appTestModelEndpoint } from "./model-endpoint-fixture.js"

const secretRef = "env://WANEX_APP_OPERATION_PROVIDER_KEY"
const secretValue = "wanex-app-operation-secret"
const integrationDeadlockTimeoutMs = 10_000

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("@wanex/app durable conversation operations", () => {
  it("runs independent sessions concurrently through the configured worker pool", async () => {
    const storeDir = await createStoreDir()
    const bothProvidersStarted = deferred<void>()
    const releaseProviders = deferred<void>()
    let activeCalls = 0
    let maxActiveCalls = 0
    vi.stubGlobal("fetch", async () => {
      activeCalls += 1
      maxActiveCalls = Math.max(maxActiveCalls, activeCalls)
      if (activeCalls === 2) {
        bothProvidersStarted.resolve()
      }
      await releaseProviders.promise
      activeCalls -= 1
      return openAIResponse("parallel app response")
    })
    const app = await createRealProviderApp(
      storeDir,
      { WANEX_APP_OPERATION_PROVIDER_KEY: secretValue },
      { workerCount: 2 }
    )

    try {
      await app.stop()
      const first = await app.commands.submitConversationOperation({
        content: [{ type: "text", text: "parallel first" }],
        sessionId: "ses_app_parallel_first"
      })
      const second = await app.commands.submitConversationOperation({
        content: [{ type: "text", text: "parallel second" }],
        sessionId: "ses_app_parallel_second"
      })
      app.start()
      await withTimeout(
        bothProvidersStarted.promise,
        integrationDeadlockTimeoutMs,
        "configured App workers did not overlap"
      )
      expect(maxActiveCalls).toBe(2)

      releaseProviders.resolve()
      await eventually(async () => {
        await expect(
          app.commands.readConversationOperation(first)
        ).resolves.toMatchObject({
          kind: "found",
          operation: { state: "succeeded" }
        })
        await expect(
          app.commands.readConversationOperation(second)
        ).resolves.toMatchObject({
          kind: "found",
          operation: { state: "succeeded" }
        })
      })
    } finally {
      releaseProviders.resolve()
      await app.dispose()
    }
  }, 15_000)

  it("projects bounded assistant deltas without letting listener failures affect execution", async () => {
    const storeDir = await createStoreDir()
    const answer = "streamed assistant text ".repeat(1_000)
    vi.stubGlobal("fetch", async () => openAIResponse(answer))
    const app = await createRealProviderApp(storeDir, {
      WANEX_APP_OPERATION_PROVIDER_KEY: secretValue
    })
    const observed: Array<
      Parameters<Parameters<typeof app.events.subscribeConversationEvents>[0]>[0]
    > = []
    app.events.subscribeConversationEvents(() => {
      throw new Error("presentation listener failed")
    })
    const unsubscribe = app.events.subscribeConversationEvents((event) => {
      observed.push(event)
    })

    try {
      const receipt = await app.commands.submitConversationOperation({
        content: [{ type: "text", text: "observe safe app delta" }],
        sessionId: "ses_app_operation_delta"
      })
      await eventually(async () => {
        await expect(
          app.commands.readConversationOperation(receipt)
        ).resolves.toMatchObject({
          kind: "found",
          operation: { state: "succeeded" }
        })
      })

      expect(observed).toHaveLength(2)
      expect(observed[0]).toMatchObject({
        kind: "wanex-app.conversation.assistant-text-delta",
        sequence: 1,
        reference: {
          sessionId: receipt.sessionId,
          inputId: receipt.inputId,
          turnId: receipt.turnId,
          jobId: receipt.jobId
        },
        attemptId: expect.stringMatching(/^attempt_/),
        partId: "text_0",
        text: answer.slice(0, 16_384),
        truncated: true
      })
      expect(observed[1]).toEqual({
        kind: "wanex-app.conversation.operation-invalidated",
        sequence: 2,
        at: expect.any(Number),
        reference: {
          sessionId: receipt.sessionId,
          inputId: receipt.inputId,
          turnId: receipt.turnId,
          jobId: receipt.jobId
        },
        cause: "execution_settled"
      })
      expect(JSON.stringify(observed)).not.toContain("openai-compatible")
      expect(JSON.stringify(observed)).not.toContain(secretRef)
      expect(JSON.stringify(observed)).not.toContain(secretValue)

      unsubscribe()
      const second = await app.commands.submitConversationOperation({
        content: [{ type: "text", text: "unsubscribe safe app delta" }],
        sessionId: "ses_app_operation_delta_second"
      })
      await eventually(async () => {
        await expect(
          app.commands.readConversationOperation(second)
        ).resolves.toMatchObject({
          kind: "found",
          operation: { state: "succeeded" }
        })
      })
      expect(observed).toHaveLength(2)
    } finally {
      unsubscribe()
      await app.dispose()
    }
  })

  it("cancels a running operation through the Runtime Host control facade", async () => {
    const storeDir = await createStoreDir()
    const providerStarted = deferred<void>()
    vi.stubGlobal("fetch", async (_input: unknown, init?: RequestInit) => {
      providerStarted.resolve()
      await waitForAbort(init?.signal)
      throw new DOMException("provider request aborted", "AbortError")
    })
    const app = await createRealProviderApp(storeDir, {
      WANEX_APP_OPERATION_PROVIDER_KEY: secretValue
    })

    try {
      const receipt = await app.commands.submitConversationOperation({
        content: [{ type: "text", text: "cancel through app" }],
        sessionId: "ses_app_operation_cancel"
      })
      await providerStarted.promise
      await expect(app.commands.cancelConversationOperation({
        ...receipt,
        reason: "user cancelled from product"
      })).resolves.toMatchObject({
        sessionId: receipt.sessionId,
        inputId: receipt.inputId,
        turnId: receipt.turnId,
        jobId: receipt.jobId,
        status: "cancel_requested"
      })
      await eventually(async () => {
        await expect(
          app.commands.readConversationOperation(receipt)
        ).resolves.toMatchObject({
          kind: "found",
          operation: { state: "cancelled" }
        })
      })
    } finally {
      await app.dispose()
    }
  })

  it("joins concurrent App disposal until provider cleanup completes", async () => {
    const storeDir = await createStoreDir()
    const providerStarted = deferred<void>()
    const providerAborted = deferred<void>()
    const releaseCleanup = deferred<void>()
    let cleanupComplete = false
    vi.stubGlobal("fetch", async (_input: unknown, init?: RequestInit) => {
      providerStarted.resolve()
      await waitForAbort(init?.signal)
      providerAborted.resolve()
      await releaseCleanup.promise
      cleanupComplete = true
      throw new DOMException("provider request aborted", "AbortError")
    })
    const app = await createRealProviderApp(storeDir, {
      WANEX_APP_OPERATION_PROVIDER_KEY: secretValue
    })
    await app.commands.submitConversationOperation({
      content: [{ type: "text", text: "dispose through App" }],
      sessionId: "ses_app_concurrent_dispose"
    })
    await providerStarted.promise

    const firstDispose = app.dispose()
    await providerAborted.promise
    let secondDisposeCompleted = false
    const secondDispose = app.dispose().then(() => {
      secondDisposeCompleted = true
    })

    try {
      await new Promise((resolve) => setTimeout(resolve, 10))
      expect(secondDisposeCompleted).toBe(false)
    } finally {
      releaseCleanup.resolve()
      await Promise.allSettled([firstDispose, secondDispose])
    }

    expect(cleanupComplete).toBe(true)
    await expect(app.dispose()).resolves.toBeUndefined()
  })

  it("interrupts the exact active attempt and preserves its product state", async () => {
    const storeDir = await createStoreDir()
    const providerStarted = deferred<void>()
    vi.stubGlobal("fetch", async (_input: unknown, init?: RequestInit) => {
      providerStarted.resolve()
      await waitForAbort(init?.signal)
      throw new DOMException("provider request interrupted", "AbortError")
    })
    const app = await createRealProviderApp(storeDir, {
      WANEX_APP_OPERATION_PROVIDER_KEY: secretValue
    })

    try {
      const receipt = await app.commands.submitConversationOperation({
        content: [{ type: "text", text: "interrupt through app" }],
        sessionId: "ses_app_operation_interrupt"
      })
      await providerStarted.promise
      const running = await eventually(async () => {
        const result = await app.commands.readConversationOperation(receipt)
        expect(result).toMatchObject({
          kind: "found",
          operation: {
            state: "running",
            activeAttemptId: expect.any(String)
          }
        })
        if (result.kind !== "found" ||
          result.operation.activeAttemptId === undefined) {
          throw new Error("expected active conversation attempt")
        }
        return result.operation
      })
      await expect(app.commands.interruptConversationOperation({
        ...receipt,
        attemptId: running.activeAttemptId!,
        reason: "user interrupted from product",
        principalId: "app-operation-user",
        idempotencyKey: "app-operation-interrupt"
      })).resolves.toMatchObject({
        sessionId: receipt.sessionId,
        inputId: receipt.inputId,
        turnId: receipt.turnId,
        jobId: receipt.jobId,
        attemptId: running.activeAttemptId,
        status: "interrupt_requested"
      })
      await eventually(async () => {
        await expect(
          app.commands.readConversationOperation(receipt)
        ).resolves.toMatchObject({
          kind: "found",
          operation: { state: "interrupted" }
        })
      })
    } finally {
      await app.dispose()
    }
  })

  it("steers a running operation at a safe point without aborting its provider", async () => {
    const storeDir = await createStoreDir()
    const providerStarted = deferred<void>()
    const releaseProvider = deferred<void>()
    let calls = 0
    vi.stubGlobal("fetch", async () => {
      calls += 1
      if (calls === 1) {
        providerStarted.resolve()
        await releaseProvider.promise
        return openAIResponse("response before app steer")
      }
      return openAIResponse("response after app steer")
    })
    const app = await createRealProviderApp(storeDir, {
      WANEX_APP_OPERATION_PROVIDER_KEY: secretValue
    })

    try {
      const receipt = await app.commands.submitConversationOperation({
        content: [{ type: "text", text: "initial app direction" }],
        sessionId: "ses_app_operation_steer"
      })
      await providerStarted.promise
      const running = await eventually(async () => {
        const result = await app.commands.readConversationOperation(receipt)
        if (result.kind !== "found" ||
          result.operation.activeAttemptId === undefined) {
          throw new Error("expected active conversation attempt")
        }
        expect(result.operation.state).toBe("running")
        return result.operation
      })
      await expect(app.commands.steerConversationOperation({
        ...receipt,
        attemptId: running.activeAttemptId!,
        principalId: "app-operation-user",
        idempotencyKey: "app-operation-steer",
        content: [{
          type: "text",
          id: "part_app_operation_steer",
          text: "adjust app direction"
        }]
      })).resolves.toMatchObject({
        sessionId: receipt.sessionId,
        inputId: receipt.inputId,
        turnId: receipt.turnId,
        jobId: receipt.jobId,
        attemptId: running.activeAttemptId,
        status: "accepted"
      })
      expect(calls).toBe(1)

      await expect(
        app.commands.readConversationOperation(receipt)
      ).resolves.toMatchObject({
        kind: "found",
        operation: {
          state: "running",
          activeAttemptId: running.activeAttemptId,
          steering: {
            truncated: false,
            pending: [
              {
                attemptId: running.activeAttemptId,
                idempotencyKey: "app-operation-steer",
                content: [
                  {
                    type: "text",
                    id: "part_app_operation_steer",
                    text: "adjust app direction"
                  }
                ]
              }
            ]
          }
        }
      })

      releaseProvider.resolve()
      await eventually(async () => {
        await expect(
          app.commands.readConversationOperation(receipt)
        ).resolves.toMatchObject({
          kind: "found",
          operation: {
            state: "succeeded",
            transcript: {
              totalRows: 4,
              rows: [
                { role: "user", text: "initial app direction" },
                { role: "assistant", text: "response before app steer" },
                { role: "user", text: "adjust app direction" },
                { role: "assistant", text: "response after app steer" }
              ]
            }
          }
        })
      })
      const settled = await app.commands.readConversationOperation(receipt)
      expect(settled.kind).toBe("found")
      if (settled.kind === "found") {
        expect(settled.operation).not.toHaveProperty("steering")
      }
      expect(calls).toBe(2)
    } finally {
      releaseProvider.resolve()
      await app.dispose()
    }
  })

  it("returns before a delayed provider completes and projects bounded terminal data", async () => {
    const storeDir = await createStoreDir()
    const providerStarted = deferred<void>()
    const releaseProvider = deferred<void>()
    const longAnswer = "delayed answer ".repeat(3_000)
    vi.stubGlobal("fetch", async () => {
      providerStarted.resolve()
      await releaseProvider.promise
      return openAIResponse(longAnswer)
    })
    const app = await createRealProviderApp(storeDir, {
      WANEX_APP_OPERATION_PROVIDER_KEY: secretValue
    })

    try {
      const receipt = await app.commands.submitConversationOperation({
        content: [{ type: "text", text: "run in the background" }],
        sessionId: "ses_app_operation_delayed",
        inputId: "inp_app_operation_delayed",
        idempotencyKey: "app-operation-delayed-input",
        jobId: "job_app_operation_delayed"
      })
      expect(receipt).toMatchObject({
        sessionId: "ses_app_operation_delayed",
        inputId: "inp_app_operation_delayed",
        jobId: "job_app_operation_delayed",
        state: "queued"
      })

      await providerStarted.promise
      await eventually(async () => {
        await expect(
          app.commands.readConversationOperation(receipt)
        ).resolves.toMatchObject({
          kind: "found",
          operation: {
            state: "running",
            transcript: {
              rows: [],
              totalRows: 0,
              truncated: false
            }
          }
        })
      })

      releaseProvider.resolve()
      const completed = await eventually(async () => {
        const result = await app.commands.readConversationOperation({
          ...receipt,
          transcriptLimit: 1
        })
        expect(result).toMatchObject({
          kind: "found",
          operation: {
            state: "succeeded",
            transcript: {
              totalRows: 2,
              truncated: true,
              rows: [
                {
                  kind: "message",
                  role: "user",
                  text: "run in the background",
                  textTruncated: false
                }
              ]
            },
            result: {
              assistantTextTruncated: true,
              messageCount: 2
            }
          }
        })
        if (result.kind !== "found") {
          throw new Error("expected completed conversation operation")
        }
        return result
      })
      expect(
        completed.operation.result?.assistantText.length
      ).toBe(32_768)
      const serialized = JSON.stringify(completed)
      expect(serialized).not.toContain(secretRef)
      expect(serialized).not.toContain(secretValue)
      expect(serialized).not.toContain(storeDir)
      expect(serialized).not.toContain(serviceBin)
    } finally {
      releaseProvider.resolve()
      await app.dispose()
    }
  })

  it("queues while stopped and resumes the same durable operation after start", async () => {
    const storeDir = await createStoreDir()
    const app = await createWanexApp({
      storage: {
        kind: "local-system-service",
        storeDir
      },
      artifacts: { explicitPath: serviceBin },
      modelEndpoint: appTestModelEndpoint()
    })

    try {
      await app.stop()
      const receipt = await app.commands.submitConversationOperation({
        content: [{ type: "text", text: "resume me" }],
        sessionId: "ses_app_operation_restart",
        inputId: "inp_app_operation_restart",
        idempotencyKey: "app-operation-restart-input",
        jobId: "job_app_operation_restart"
      })
      await expect(
        app.commands.readConversationOperation(receipt)
      ).resolves.toMatchObject({
        kind: "found",
        operation: { state: "queued" }
      })

      app.start()
      await eventually(async () => {
        await expect(
          app.commands.readConversationOperation(receipt)
        ).resolves.toMatchObject({
          kind: "found",
          operation: {
            state: "succeeded",
            result: {
              assistantText: "Fake response from wanex-app-model"
            }
          }
        })
      })
    } finally {
      await app.dispose()
    }
  })

  it("recovers across App recreation and keeps resubmission idempotent", async () => {
    const storeDir = await createStoreDir()
    const request = {
      content: [{ type: "text", text: "survive recreation" }],
      sessionId: "ses_app_operation_recreate",
      inputId: "inp_app_operation_recreate",
      idempotencyKey: "app-operation-recreate-input",
      jobId: "job_app_operation_recreate"
    } as const
    const first = await createWanexApp({
      storage: { kind: "local-system-service", storeDir },
      artifacts: { explicitPath: serviceBin },
      modelEndpoint: appTestModelEndpoint()
    })
    await first.stop()
    const receipt = await first.commands.submitConversationOperation(request)
    await first.dispose()

    const second = await createWanexApp({
      storage: { kind: "local-system-service", storeDir },
      artifacts: { explicitPath: serviceBin }
    })
    try {
      await eventually(async () => {
        await expect(
          second.commands.readConversationOperation(receipt)
        ).resolves.toMatchObject({
          kind: "found",
          operation: { state: "succeeded" }
        })
      })
      const duplicate = await second.commands.submitConversationOperation(
        request
      )
      expect(duplicate).toEqual({
        ...receipt,
        state: "succeeded"
      })
      const storage = createStorageHandle({
        kind: "local-system-service",
        mode: "oneshot",
        storeDir,
        serviceBin
      })
      try {
        await expect(
          storage.core.listSessionInputs({ sessionId: request.sessionId })
        ).resolves.toHaveLength(1)
        await expect(
          storage.core.listJobs({ kind: "session.turn", limit: 10 })
        ).resolves.toHaveLength(1)
      } finally {
        await storage.dispose()
      }
    } finally {
      await second.dispose()
    }
  })

  it("preserves canonical resource evidence in conversation operation reads", async () => {
    const storeDir = await createStoreDir()
    const seed = createStorageHandle({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin
    })
    const resource = await seed.core.ingestResource({
      content: Uint8Array.from([137, 80, 78, 71]),
      mediaType: "image/png",
      kind: "image",
      origin: "user_upload"
    })
    await seed.dispose()
    const app = await createWanexApp({
      storage: { kind: "local-system-service", storeDir },
      artifacts: { explicitPath: serviceBin },
      modelEndpoint: appTestModelEndpoint({
        endpointId: "app-resource-input",
        modelId: "app-resource-model",
        inputModalities: ["text", "image"]
      })
    })

    try {
      const receipt = await app.commands.submitConversationOperation({
        content: [
          { type: "text", text: "inspect" },
          { type: "resource", resourceId: resource.id }
        ],
        sessionId: "ses_app_resource_input"
      })
      const completed = await eventually(async () => {
        const read = await app.commands.readConversationOperation(receipt)
        expect(read).toMatchObject({
          kind: "found",
          operation: { state: "succeeded" }
        })
        return read
      })
      if (completed.kind !== "found") {
        throw new Error("resource conversation operation was not found")
      }
      const user = completed.operation.transcript.rows.find(
        (row) => row.inputId === receipt.inputId && row.role === "user"
      )
      expect(user?.parts).toContainEqual({
        partId: "user_resource_1",
        type: "resource",
        visibility: "default",
        resourceId: resource.id,
        sha256: resource.sha256,
        sizeBytes: resource.sizeBytes,
        kind: "image",
        mediaType: "image/png"
      })
      expect(JSON.stringify(completed.operation)).not.toContain("logicalPath")
      expect(JSON.stringify(completed.operation)).not.toContain("bytes")
    } finally {
      await app.dispose()
    }
  })

  it("projects bounded ambiguous tool evidence and confirms it without reinvoking the tool", async () => {
    const storeDir = await createStoreDir()
    let providerCalls = 0
    let toolCalls = 0
    vi.stubGlobal("fetch", async () => {
      providerCalls += 1
      return providerCalls === 1
        ? openAIToolCallResponse(
            "ambiguous_remote",
            "call_app_recovery",
            { remoteSecret: "must-not-be-projected" }
          )
        : openAIResponse("recovered assistant response")
    })
    const tools = new ToolRegistry()
    tools.register({
      name: "ambiguous_remote",
      description: "Lose the response after a remote operation was dispatched.",
      inputSchema: { type: "object", additionalProperties: true },
      risk: "external",
      idempotent: false,
      concurrency: "exclusive",
      resultMode: "immediate",
      annotations: { title: "Ambiguous remote operation" },
      runtimeBinding: createToolRuntimeBinding({
        implementationId: "wanex.test.app.ambiguous-remote",
        implementationRevision: "1"
      }),
      async invoke(invocation) {
        toolCalls += 1
        expect(invocation.input).toEqual({
          remoteSecret: "must-not-be-projected"
        })
        return {
          outcome: "ambiguous",
          toolCallId: invocation.toolCallId,
          message: "remote response was lost after dispatch",
          reconciliationRef: "remote-operation-app-1"
        }
      }
    } satisfies ToolDefinition)
    const app = await createRealProviderApp(
      storeDir,
      { WANEX_APP_OPERATION_PROVIDER_KEY: secretValue },
      {
        runtimeContext: {
          tools,
          toolPermissionPolicy: new AllowAllToolsPolicy()
        }
      }
    )

    try {
      const receipt = await app.commands.submitConversationOperation({
        content: [{ type: "text", text: "reconcile remote operation" }],
        sessionId: "ses_app_recovery_review"
      })
      const recovery = await eventually(async () => {
        const result = await app.commands.readConversationOperation(receipt)
        expect(result).toMatchObject({
          kind: "found",
          operation: {
            state: "recovery_required",
            recovery: {
              items: [
                {
                  tool: {
                    name: "ambiguous_remote",
                    title: "Ambiguous remote operation",
                    risk: "external",
                    idempotent: false
                  },
                  evidence: {
                    message: "remote response was lost after dispatch",
                    reconciliationRef: "remote-operation-app-1"
                  },
                  attemptCount: 1,
                  availableDecisions: [
                    "confirm_succeeded",
                    "confirm_failed",
                    "abandon_turn"
                  ]
                }
              ]
            }
          }
        })
        return result
      })
      const serialized = JSON.stringify(recovery)
      expect(serialized).not.toContain("must-not-be-projected")
      expect(providerCalls).toBe(1)
      expect(toolCalls).toBe(1)

      if (recovery.kind !== "found" || recovery.operation.recovery === undefined) {
        throw new Error("expected App recovery review")
      }
      const item = recovery.operation.recovery.items[0]
      if (item === undefined) throw new Error("expected App recovery item")
      await expect(
        app.commands.resolveConversationOperationRecovery({
          ...receipt,
          executionId: item.executionId,
          expectedRecoveryRevision: item.recoveryRevision,
          decision: "confirm_succeeded",
          reason: "verified in the remote operation log",
          content: [{
            type: "json",
            value: { remoteOperationId: "remote-operation-app-1" }
          }]
        })
      ).resolves.toMatchObject({
        decision: "confirm_succeeded",
        action: "turn_requeued"
      })

      await eventually(async () => {
        await expect(
          app.commands.readConversationOperation(receipt)
        ).resolves.toMatchObject({
          kind: "found",
          operation: {
            state: "succeeded",
            result: {
              assistantText: expect.stringContaining(
                "recovered assistant response"
              )
            }
          }
        })
      })
      expect(providerCalls).toBe(2)
      expect(toolCalls).toBe(1)
    } finally {
      await app.dispose()
    }
  })

  it("projects and resolves a bounded durable Tool approval without exposing raw input", async () => {
    const storeDir = await createStoreDir()
    let providerCalls = 0
    let toolCalls = 0
    vi.stubGlobal("fetch", async () => {
      providerCalls += 1
      return providerCalls === 1
        ? openAIToolCallResponse(
            "approval_remote",
            "call_app_approval",
            { secretArgument: "must-not-be-projected" }
          )
        : openAIResponse("approved assistant response")
    })
    const tools = new ToolRegistry()
    tools.register({
      name: "approval_remote",
      description: "Perform one externally visible action after review.",
      inputSchema: {
        type: "object",
        properties: { secretArgument: { type: "string" } },
        required: ["secretArgument"],
        additionalProperties: false
      },
      risk: "external",
      idempotent: false,
      concurrency: "exclusive",
      resultMode: "immediate",
      annotations: { title: "External approval action" },
      runtimeBinding: createToolRuntimeBinding({
        implementationId: "wanex.test.app.approval-remote",
        implementationRevision: "1"
      }),
      async invoke(invocation) {
        toolCalls += 1
        expect(invocation.input).toEqual({
          secretArgument: "must-not-be-projected"
        })
        return {
          outcome: "succeeded",
          toolCallId: invocation.toolCallId,
          content: [{ type: "json", value: { accepted: true } }]
        }
      }
    } satisfies ToolDefinition)
    const policy = new AppApprovalRequiredPolicy()
    const app = await createRealProviderApp(
      storeDir,
      { WANEX_APP_OPERATION_PROVIDER_KEY: secretValue },
      { runtimeContext: { tools, toolPermissionPolicy: policy } }
    )
    const observed: Array<
      Parameters<Parameters<typeof app.events.subscribeConversationEvents>[0]>[0]
    > = []
    app.events.subscribeConversationEvents((event) => observed.push(event))

    try {
      const receipt = await app.commands.submitConversationOperation({
        content: [{ type: "text", text: "perform the reviewed action" }],
        sessionId: "ses_app_tool_approval",
        principalId: "principal_app_tool_approval"
      })
      const waiting = await eventually(async () => {
        const result = await app.commands.readConversationOperation(receipt)
        expect(result).toMatchObject({
          kind: "found",
          operation: {
            state: "waiting",
            approvals: {
              truncated: false,
              items: [{
                approvalRevision: 0,
                tool: {
                  name: "approval_remote",
                  title: "External approval action",
                  risk: "external",
                  idempotent: false
                },
                presentation: {
                  summary: "Approve the external test action",
                  summaryTruncated: false,
                  details: [{
                    label: "Destination",
                    value: "Configured external test service",
                    labelTruncated: false,
                    valueTruncated: false
                  }],
                  detailsTruncated: false
                },
                attemptCount: 0,
                availableDecisions: ["approve_once", "deny"]
              }]
            }
          }
        })
        return result
      })
      if (waiting.kind !== "found" || waiting.operation.approvals === undefined) {
        throw new Error("expected App Tool approval review")
      }
      const approval = waiting.operation.approvals.items[0]
      if (approval === undefined) throw new Error("expected App Tool approval item")
      expect(providerCalls).toBe(1)
      expect(toolCalls).toBe(0)
      expect(policy.calls).toBe(1)
      const serialized = JSON.stringify(waiting)
      expect(serialized).not.toContain("must-not-be-projected")
      expect(serialized).not.toContain("inputSchema")
      expect(serialized).not.toContain("app-policy:private-reference")
      expect(serialized).not.toContain("leaseToken")

      await expect(
        app.commands.listConversationOperationApprovals(receipt)
      ).resolves.toMatchObject({
        kind: "found",
        approvals: { items: [{ executionId: approval.executionId }] }
      })
      await expect(app.commands.readConversationOperationApproval({
        ...receipt,
        executionId: approval.executionId
      })).resolves.toMatchObject({
        kind: "found",
        approval: { executionId: approval.executionId }
      })
      await expect(app.commands.readConversationOperationApproval({
        ...receipt,
        executionId: "toolx_missing"
      })).resolves.toMatchObject({
        kind: "missing",
        executionId: "toolx_missing"
      })

      const decision = {
        ...receipt,
        executionId: approval.executionId,
        expectedApprovalRevision: approval.approvalRevision,
        decision: "approve_once" as const,
        reason: "reviewed bounded App presentation",
        idempotencyKey: "app:tool-approval:approve"
      }
      const resolved = await app.commands.resolveConversationOperationApproval(decision)
      expect(resolved).toMatchObject({
        executionId: approval.executionId,
        decision: "approve_once",
        action: "turn_requeued",
        approvalRevision: 1
      })
      await expect(
        app.commands.resolveConversationOperationApproval(decision)
      ).resolves.toEqual(resolved)

      await eventually(async () => {
        await expect(
          app.commands.readConversationOperation(receipt)
        ).resolves.toMatchObject({
          kind: "found",
          operation: {
            state: "succeeded",
            result: {
              assistantText: "approved assistant response"
            }
          }
        })
      })
      expect(providerCalls).toBe(2)
      expect(toolCalls).toBe(1)
      expect(policy.calls).toBe(1)
      expect(observed.filter((event) =>
        event.kind === "wanex-app.conversation.operation-invalidated"
      ).map((event) => event.cause)).toEqual([
        "execution_suspended",
        "execution_settled"
      ])
    } finally {
      await app.dispose()
    }
  })

  it("projects provider failures as safe terminal errors", async () => {
    const storeDir = await createStoreDir()
    const app = await createRealProviderApp(storeDir, {})

    try {
      const receipt = await app.commands.submitConversationOperation({
        content: [{ type: "text", text: "fail safely" }],
        sessionId: "ses_app_operation_failure"
      })
      const failed = await eventually(async () => {
        const result = await app.commands.readConversationOperation(receipt)
        expect(result).toMatchObject({
          kind: "found",
          operation: {
            state: "failed",
            error: {
              code: "conversation_operation_failed",
              category: "runtime",
              message:
                "conversation operation failed; see app diagnostics for details"
            }
          }
        })
        return result
      })
      const serialized = JSON.stringify(failed)
      expect(serialized).not.toContain(secretRef)
      expect(serialized).not.toContain(secretValue)
      expect(serialized).not.toContain(storeDir)
      expect(serialized).not.toContain(serviceBin)
    } finally {
      await app.dispose()
    }
  })

  it("disposes owned processing while leaving injected storage open", async () => {
    const storeDir = await createStoreDir()
    const storage = createStorageHandle({
      kind: "local-system-service",
      mode: "persistent",
      storeDir,
      serviceBin
    })
    const app = await createWanexApp({
      storage: {
        kind: "injected",
        handle: storage
      }
    })

    try {
      await app.dispose()
      await expect(storage.core.doctor()).resolves.toMatchObject({
        schemaVersion: 21
      })
    } finally {
      await app.dispose()
      await storage.dispose()
    }
  })
})

async function createRealProviderApp(
  storeDir: string,
  env: Readonly<Record<string, string | undefined>>,
  options: {
    readonly workerCount?: number
    readonly runtimeContext?: {
      readonly tools: ToolRegistry
      readonly toolPermissionPolicy: ToolPermissionPolicy
    }
  } = {}
) {
  return await createWanexApp({
    storage: {
      kind: "local-system-service",
      storeDir
    },
    artifacts: { explicitPath: serviceBin },
    modelEndpoint: appTestModelEndpoint({
      endpointId: "app-operation-real-provider",
      protocolId: "openai-chat-completions",
      providerId: "openai-compatible",
      modelId: "app-operation-model",
      baseUrl: "https://provider.example.test/v1",
      secretRef
    }),
    secretResolver: new SecretResolver([new EnvSecretProvider(env)]),
    ...(options.workerCount === undefined
      ? {}
      : { workerCount: options.workerCount }),
    ...(options.runtimeContext === undefined
      ? {}
      : { runtimeContext: options.runtimeContext })
  })
}

class AppApprovalRequiredPolicy implements ToolPermissionPolicy {
  calls = 0

  snapshot() {
    return createToolRuntimeBinding({
      implementationId: "wanex.test.app.approval-policy",
      implementationRevision: "1"
    })
  }

  async authorize(
    _request: ToolPermissionRequest
  ): Promise<ToolPermissionDecision> {
    this.calls += 1
    return {
      status: "approval_required",
      reason: "trusted_app_review_required",
      presentation: {
        summary: "Approve the external test action",
        details: [{
          label: "Destination",
          value: "Configured external test service"
        }]
      },
      authorizationRef: "app-policy:private-reference"
    }
  }
}

function openAIResponse(text: string) {
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

function openAIToolCallResponse(
  toolName: string,
  toolCallId: string,
  input: Record<string, unknown>
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
              id: toolCallId,
              function: {
                name: toolName,
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

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

async function waitForAbort(signal: AbortSignal | null | undefined): Promise<void> {
  if (signal === null || signal === undefined) {
    throw new Error("provider request did not receive an abort signal")
  }
  if (signal.aborted) return
  await new Promise<void>((resolve) => {
    signal.addEventListener("abort", () => resolve(), { once: true })
  })
}

async function eventually<T>(run: () => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      return await run()
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  }
  throw lastError
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs)
      })
    ])
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer)
    }
  }
}
