import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type {
  JsonValue,
  MediaGenerationModelEndpoint,
  ToolResultMessagePart
} from "@wanex/protocol"
import {
  createStorageTestStore,
  type StorageTestStore
} from "@wanex/storage/testing"
import {
  WanexAgentRunner,
  type ExecuteTurnResult
} from "../src/execution/core/index.js"
import {
  FakeProviderAdapter,
  createModelCapabilityRouteExecutionBinding,
  type ProviderAdapter,
  type ProviderEvent,
  type ProviderRequest,
  type ProviderReplayMessage
} from "../src/provider/index.js"
import {
  prepareMediaGenerationOperationBinding,
  WanexMediaGenerationRuntime,
  type MediaGenerationAdapter,
  type MediaGenerationPollResult,
  type MediaGenerationSubmitResult
} from "../src/media-generation/index.js"
import {
  AllowAllToolsPolicy,
  createToolRuntimeBinding,
  jsonToolResultContent,
  toolResultContentDigest,
  toolResultPart,
  ToolRegistry,
  type ToolPermissionDecision,
  type ToolPermissionRequest
} from "../src/tools/index.js"
import {
  createStartedTurn,
  type StartedTurnFixture
} from "./durable-turn-test-fixture.js"
import {
  testConversationModel,
  testModelEndpoint
} from "./model-endpoint-fixture.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)
const tempDirs: string[] = []
let testStore: StorageTestStore | undefined

beforeEach(async () => {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-agent-runner-"))
  tempDirs.push(storeDir)
  testStore = createStorageTestStore({
    kind: "local-system-service",
    mode: "persistent",
    storeDir,
    serviceBin
  })
  await testStore.doctor()
})

afterEach(async () => {
  await testStore?.dispose()
  testStore = undefined
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

describe("Runtime exact turn runner", () => {
  it("settles one exact started attempt with a canonical assistant message", async () => {
    const storage = requireTestStore()
    const fixture = await createStartedTurn(storage, { suffix: "runner_final" })
    const runner = new WanexAgentRunner({
      session: fixture.session,
      provider: new FakeProviderAdapter({ responseText: "final response" })
    })

    const result = await runner.executeTurn({
      execution: fixture.execution,
      heartbeat: async () => {}
    })

    expect(result).toMatchObject({ outcome: "succeeded", steps: 1 })
    expectSettled(result)
    expect(result.settlement.turn.state).toBe("succeeded")
    expect(result.settlement.job.state).toBe("succeeded")
    const messages = await fixture.session.listMessages({
      sessionId: fixture.execution.sessionId
    })
    expect(messages.map((message) => message.role)).toEqual([
      "user",
      "assistant"
    ])
    expect(messages.map((message) => message.sequence)).toEqual([1, 2])
    expect(messages.every(
      (message) => message.turnId === fixture.execution.turnId
    )).toBe(true)
  })

  it("recovers a provider checkpoint and applies pending steering exactly once", async () => {
    const storage = requireTestStore()
    const fixture = await createStartedTurn(storage, {
      suffix: "runner_steer_recovery"
    })
    const steer = await fixture.session.steerTurn({
      sessionId: fixture.execution.sessionId,
      principalId: fixture.execution.principalId,
      expectedTurnId: fixture.execution.turnId,
      expectedAttemptId: fixture.execution.attemptId,
      idempotencyKey: "runner_steer_recovery",
      content: [{
        type: "text",
        id: "part_runner_steer_recovery",
        text: "adjusted after recovery"
      }]
    })
    expect(steer.status).toBe("accepted")

    const invocation = await fixture.session.beginProviderInvocation({
      ...fixture.execution,
      step: 1,
      invocationNumber: 1,
      requestDigest: "checkpoint:runner_steer_recovery"
    })
    const checkpoint = await fixture.session.finishProviderInvocation({
      ...fixture.execution,
      invocationId: invocation.id,
      outcome: "succeeded",
      assistantMessage: [{
        type: "text",
        id: "part_runner_checkpoint",
        text: "checkpoint before owner loss"
      }]
    })
    expect(checkpoint?.assistantMessage?.content).toMatchObject([{
      type: "text",
      text: "checkpoint before owner loss"
    }])

    const shortenedLease = await fixture.session.heartbeatJob({
      jobId: fixture.execution.jobId,
      workerId: fixture.execution.workerId,
      leaseToken: fixture.execution.leaseToken,
      leaseMs: 1
    })
    expect(shortenedLease).not.toBeNull()
    await delay(20)

    const recoveryWorkerId = "worker_runner_steer_recovery"
    const recoveredJob = await fixture.session.claimJob({
      workerId: recoveryWorkerId,
      leaseMs: 60_000,
      kinds: ["session.turn"]
    })
    expect(recoveredJob?.id).toBe(fixture.execution.jobId)
    if (recoveredJob?.leaseToken === undefined) {
      throw new Error("expected recovered job lease")
    }
    const recovered = await fixture.session.startTurnAttempt({
      sessionId: fixture.execution.sessionId,
      turnId: fixture.execution.turnId,
      inputId: fixture.execution.inputId,
      jobId: recoveredJob.id,
      workerId: recoveryWorkerId,
      leaseToken: recoveredJob.leaseToken
    })
    const provider = new RecoverySteeringProvider()
    const runner = new WanexAgentRunner({
      session: fixture.session,
      provider
    })

    const result = await runner.executeTurn({
      execution: {
        ...fixture.execution,
        attemptId: recovered.attempt.id,
        workerId: recoveryWorkerId,
        leaseToken: recoveredJob.leaseToken,
        recovery: recovered.turn.executionBinding.recovery
      },
      heartbeat: async () => {}
    })

    expect(result.outcome).toBe("succeeded")
    expect(provider.calls).toBe(1)
    expect(provider.lastUserTexts).toEqual([
      "user runner_steer_recovery",
      "adjusted after recovery"
    ])
    const messages = await fixture.session.listMessages({
      sessionId: fixture.execution.sessionId
    })
    expect(messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant"
    ])
    expect(messages.map((message) => message.content)).toMatchObject([
      [{ type: "text", text: "user runner_steer_recovery" }],
      [{ type: "text", text: "checkpoint before owner loss" }],
      [{ type: "text", text: "adjusted after recovery" }],
      [{ type: "text", text: "recovered final response" }]
    ])
    expect(new Set(messages.map(
      (message) => message.executionBindingDigest
    )).size).toBe(1)
    const controls = await fixture.session.listTurnControls({
      sessionId: fixture.execution.sessionId,
      turnId: fixture.execution.turnId,
      kind: "steer"
    })
    expect(controls).toMatchObject([{
      idempotencyKey: "runner_steer_recovery",
      status: "applied",
      attemptId: recovered.attempt.id
    }])
  })

  it("continues tool calls to a final response with source-message fencing", async () => {
    const storage = requireTestStore()
    const fixture = await createStartedTurn(storage, {
      suffix: "runner_tools",
      maxSteps: 4
    })
    const tools = new ToolRegistry()
    tools.register({
      name: "echo",
      description: "Echo a text value.",
      inputSchema: {
        type: "object",
        required: ["text"],
        properties: { text: { type: "string" } }
      },
      risk: "read_only",
      idempotent: true,
      concurrency: "parallel_safe",
      resultMode: "immediate",
      runtimeBinding: createToolRuntimeBinding({
        implementationId: "wanex.test.agent-runner.echo",
        implementationRevision: "1"
      }),
      async invoke(invocation) {
        return {
          outcome: "succeeded",
          toolCallId: invocation.toolCallId,
          content: jsonToolResultContent({
            text: (invocation.input as { text: string }).text
          })
        }
      }
    })
    const provider = new ToolThenFinalProvider()
    const runner = new WanexAgentRunner({
      session: fixture.session,
      provider,
      tools,
      toolPermissionPolicy: new AllowAllToolsPolicy()
    })

    const result = await runner.executeTurn({
      execution: fixture.execution,
      heartbeat: async () => {}
    })

    expect(result).toMatchObject({ outcome: "succeeded", steps: 2 })
    expect(provider.calls).toBe(2)
    const messages = await fixture.session.listMessages({
      sessionId: fixture.execution.sessionId
    })
    expect(messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "tool",
      "assistant"
    ])
    const toolResult = messages
      .flatMap((message) => message.content)
      .find((part): part is ToolResultMessagePart => part.type === "tool_result")
    expect(toolResult).toMatchObject({
      toolCallId: "call_echo",
      content: [{ value: { text: "hello" } }],
      isError: false
    })
    const executions = await fixture.session.listToolExecutions()
    expect(executions).toMatchObject([{
      turnId: fixture.execution.turnId,
      sourceMessageId: messages[1]!.id,
      toolCallId: "call_echo",
      state: "succeeded",
      attemptCount: 1
    }])
  })

  it("projects Tool requests only from frozen model capabilities", async () => {
    const cases = [
      {
        suffix: "runner_model_without_tools",
        features: [] as const,
        expectedTools: false,
        expectedParallel: undefined
      },
      {
        suffix: "runner_model_serial_tools",
        features: ["tool_calling"] as const,
        expectedTools: true,
        expectedParallel: false
      },
      {
        suffix: "runner_model_parallel_tools",
        features: ["tool_calling", "parallel_tool_calls"] as const,
        expectedTools: true,
        expectedParallel: true
      }
    ]

    for (const testCase of cases) {
      const storage = requireTestStore()
      const modelEndpoint = testModelEndpoint({
        endpointId: `endpoint_${testCase.suffix}`,
        protocolId: "fake",
        providerId: "request-capture",
        modelId: `model_${testCase.suffix}`,
        features: testCase.features
      })
      const fixture = await createStartedTurn(storage, {
        suffix: testCase.suffix,
        modelEndpoint
      })
      const provider = new RequestCaptureProvider(modelEndpoint.model)
      const runner = new WanexAgentRunner({
        session: fixture.session,
        provider,
        tools: echoTools(() => {})
      })

      const result = await runner.executeTurn({
        execution: fixture.execution,
        heartbeat: async () => {}
      })

      expect(result.outcome).toBe("succeeded")
      expect(provider.request).toBeDefined()
      expect(provider.request?.tools !== undefined).toBe(testCase.expectedTools)
      expect(provider.request?.parallelToolCalls).toBe(testCase.expectedParallel)
    }
  })

  it("survives Runner reconstruction while waiting for exact Tool approval", async () => {
    const storage = requireTestStore()
    const fixture = await createStartedTurn(storage, {
      suffix: "runner_tool_approval",
      maxSteps: 4
    })
    let toolInvocations = 0
    const tools = approvalEchoTools(() => { toolInvocations += 1 })
    const initialPolicy = new ApprovalRequiredTestPolicy()
    const initialProvider = new ToolThenFinalProvider()
    const initialRunner = new WanexAgentRunner({
      session: fixture.session,
      provider: initialProvider,
      tools,
      toolPermissionPolicy: initialPolicy
    })

    const suspended = await initialRunner.executeTurn({
      execution: fixture.execution,
      heartbeat: async () => {}
    })

    expect(suspended).toMatchObject({
      outcome: "suspended",
      steps: 1,
      receipt: {
        execution: { state: "approval_required", approvalRevision: 0 },
        turn: { state: "waiting" },
        attempt: { state: "suspended" },
        job: { state: "waiting" }
      }
    })
    expect(initialProvider.calls).toBe(1)
    expect(initialPolicy.calls).toBe(1)
    expect(toolInvocations).toBe(0)
    const [execution] = await fixture.session.listToolExecutions({
      turnId: fixture.execution.turnId
    })
    if (execution === undefined) throw new Error("missing pending Tool approval")
    await fixture.session.resolveToolExecutionApproval({
      executionId: execution.id,
      expectedApprovalRevision: execution.approvalRevision,
      decision: "approve_once",
      principalId: fixture.execution.principalId,
      reason: "approved after reviewing the bounded presentation",
      idempotencyKey: "runner:tool-approval:approve"
    })
    const workerId = "worker_runner_tool_approval_resumed"
    const job = await fixture.session.claimJob({
      workerId,
      leaseMs: 60_000,
      kinds: ["session.turn"]
    })
    if (job?.leaseToken === undefined) throw new Error("missing approved Turn lease")
    const started = await fixture.session.startTurnAttempt({
      sessionId: fixture.execution.sessionId,
      turnId: fixture.execution.turnId,
      inputId: fixture.execution.inputId,
      jobId: fixture.execution.jobId,
      workerId,
      leaseToken: job.leaseToken
    })

    const resumedPolicy = new ApprovalRequiredTestPolicy()
    const resumedProvider = new ToolThenFinalProvider()
    const resumedRunner = new WanexAgentRunner({
      session: fixture.session,
      provider: resumedProvider,
      tools,
      toolPermissionPolicy: resumedPolicy
    })
    const resumed = await resumedRunner.executeTurn({
      execution: {
        ...fixture.execution,
        attemptId: started.attempt.id,
        workerId,
        leaseToken: job.leaseToken
      },
      heartbeat: async () => {}
    })

    expect(resumed).toMatchObject({ outcome: "succeeded", steps: 2 })
    expect(resumedPolicy.calls).toBe(0)
    expect(resumedProvider.calls).toBe(1)
    expect(toolInvocations).toBe(1)
    await expect(fixture.session.listMessages({
      sessionId: fixture.execution.sessionId
    })).resolves.toMatchObject([
      { role: "user" },
      { role: "assistant", content: [{ type: "tool_call", toolCallId: "call_echo" }] },
      { role: "tool", content: [{ type: "tool_result", toolCallId: "call_echo" }] },
      { role: "assistant", content: [{ type: "text", text: "tool complete" }] }
    ])
  })

  it("settles cancellation after Tool approval suspension without Provider replay", async () => {
    const storage = requireTestStore()
    const fixture = await createStartedTurn(storage, {
      suffix: "runner_tool_approval_cancel",
      maxSteps: 4
    })
    let toolInvocations = 0
    const tools = approvalEchoTools(() => { toolInvocations += 1 })
    const provider = new ToolThenFinalProvider()
    const runner = new WanexAgentRunner({
      session: fixture.session,
      provider,
      tools,
      toolPermissionPolicy: new ApprovalRequiredTestPolicy()
    })
    await expect(runner.executeTurn({
      execution: fixture.execution,
      heartbeat: async () => {}
    })).resolves.toMatchObject({ outcome: "suspended" })
    await fixture.session.requestTurnCancel({
      sessionId: fixture.execution.sessionId,
      turnId: fixture.execution.turnId,
      inputId: fixture.execution.inputId,
      jobId: fixture.execution.jobId,
      reason: "cancel approval wait"
    })
    const workerId = "worker_runner_tool_approval_cancel"
    const job = await fixture.session.claimJob({
      workerId,
      leaseMs: 60_000,
      kinds: ["session.turn"]
    })
    if (job?.leaseToken === undefined) throw new Error("missing cancel settlement lease")
    const started = await fixture.session.startTurnAttempt({
      sessionId: fixture.execution.sessionId,
      turnId: fixture.execution.turnId,
      inputId: fixture.execution.inputId,
      jobId: fixture.execution.jobId,
      workerId,
      leaseToken: job.leaseToken
    })
    const providerAfterRestart = new ToolThenFinalProvider()
    const settled = await new WanexAgentRunner({
      session: fixture.session,
      provider: providerAfterRestart,
      tools,
      toolPermissionPolicy: new ApprovalRequiredTestPolicy()
    }).executeTurn({
      execution: {
        ...fixture.execution,
        attemptId: started.attempt.id,
        workerId,
        leaseToken: job.leaseToken
      },
      heartbeat: async () => {}
    })
    expect(settled).toMatchObject({ outcome: "cancelled" })
    expect(provider.calls).toBe(1)
    expect(providerAfterRestart.calls).toBe(0)
    expect(toolInvocations).toBe(0)
    await expect(fixture.session.listToolExecutions({
      turnId: fixture.execution.turnId
    })).resolves.toMatchObject([{
      state: "cancelled",
      approvalRevision: 1,
      attemptCount: 0
    }])
  })

  it("suspends a deferred image Tool and resumes the same Turn after media settlement", async () => {
    const storage = requireTestStore()
    const mediaAdapter = new DeferredTestImageAdapter()
    const requirement = {
      operation: "image.generate",
      inputModalities: ["text"],
      outputModalities: ["image"],
      features: []
    } as const
    const route = createModelCapabilityRouteExecutionBinding({
      requirement,
      source: "single_candidate",
      modelEndpoint: mediaAdapter.modelEndpoint
    })
    let toolInvocations = 0
    const tools = new ToolRegistry()
    tools.register({
      name: "image_generate",
      description: "Generate an image through deferred media execution.",
      inputSchema: {
        type: "object",
        properties: { prompt: { type: "string" } },
        required: ["prompt"],
        additionalProperties: false
      },
      risk: "external",
      idempotent: true,
      concurrency: "exclusive",
      resultMode: "deferred",
      requiredCapabilities: [requirement],
      runtimeBinding: createToolRuntimeBinding({
        implementationId: "wanex.test.agent-runner.image-generate",
        implementationRevision: "1"
      }),
      async invoke(invocation) {
        toolInvocations += 1
        return {
          outcome: "deferred",
          toolCallId: invocation.toolCallId,
          operation: {
            kind: "media_generation",
            binding: prepareMediaGenerationOperationBinding({
              operation: "image.generate",
              modelEndpoint: route.modelEndpoint,
              prompt: (invocation.input as { readonly prompt: string }).prompt,
              outputModality: "image"
            })
          }
        }
      }
    })
    const policy = new AllowAllToolsPolicy()
    const provider = new DeferredImageThenFinalProvider()
    const fixture = await createStartedTurn(storage, {
      suffix: "runner_deferred_image",
      modelEndpoint: testModelEndpoint({
        endpointId: "endpoint_runner_deferred_image",
        protocolId: provider.protocol.id,
        providerId: provider.providerId,
        modelId: provider.model.id
      }),
      maxSteps: 4,
      agentContext: {
        tools,
        toolPermissionPolicy: policy,
        capabilityRoutes: [route]
      }
    })
    const runner = new WanexAgentRunner({
      session: fixture.session,
      provider,
      tools,
      toolPermissionPolicy: policy
    })

    const suspended = await runner.executeTurn({
      execution: fixture.execution,
      heartbeat: async () => {}
    })

    expect(suspended).toMatchObject({
      outcome: "suspended",
      steps: 1,
      receipt: {
        turn: { id: fixture.execution.turnId, state: "waiting" },
        sessionAttempt: {
          id: fixture.execution.attemptId,
          state: "suspended"
        },
        sessionJob: {
          id: fixture.execution.jobId,
          state: "waiting"
        },
        toolExecution: { state: "waiting" },
        toolInvocationAttempt: { state: "suspended" },
        operation: {
          kind: "media_generation",
          record: {
            state: "queued",
            conversation: {
              sessionId: fixture.execution.sessionId,
              turnId: fixture.execution.turnId,
              toolCallId: "call_image_generate"
            }
          }
        }
      }
    })
    if (suspended.outcome !== "suspended") {
      throw new Error("expected deferred Tool suspension")
    }
    if (!("sessionJob" in suspended.receipt)) {
      throw new Error("expected deferred media suspension receipt")
    }
    expect(suspended.receipt.sessionJob).not.toHaveProperty("leaseOwner")
    expect(suspended.receipt.sessionJob).not.toHaveProperty("leaseToken")
    expect(suspended.receipt.sessionJob).not.toHaveProperty("leaseExpiresAt")
    expect(provider.calls).toBe(1)
    expect(toolInvocations).toBe(1)

    const mediaRuntime = new WanexMediaGenerationRuntime({
      storage,
      adapters: [mediaAdapter],
      workerId: "worker_runner_deferred_media"
    })
    await expect(mediaRuntime.runOnce()).resolves.toMatchObject({
      status: "completed",
      operation: {
        state: "succeeded",
        outputResourceIds: [expect.any(String)]
      }
    })

    const resumedWorkerId = "worker_runner_deferred_image_resumed"
    const resumedJob = await fixture.session.claimJob({
      workerId: resumedWorkerId,
      leaseMs: 60_000,
      kinds: ["session.turn"]
    })
    if (resumedJob?.leaseToken === undefined) {
      throw new Error("expected woken deferred Session Job")
    }
    expect(resumedJob.id).toBe(fixture.execution.jobId)
    const resumedAttempt = await fixture.session.startTurnAttempt({
      sessionId: fixture.execution.sessionId,
      turnId: fixture.execution.turnId,
      inputId: fixture.execution.inputId,
      jobId: resumedJob.id,
      workerId: resumedWorkerId,
      leaseToken: resumedJob.leaseToken
    })
    expect(resumedAttempt.attempt.id).not.toBe(fixture.execution.attemptId)

    const completed = await runner.executeTurn({
      execution: {
        ...fixture.execution,
        attemptId: resumedAttempt.attempt.id,
        workerId: resumedWorkerId,
        leaseToken: resumedJob.leaseToken,
        recovery: resumedAttempt.turn.executionBinding.recovery
      },
      heartbeat: async () => {}
    })

    expect(completed).toMatchObject({ outcome: "succeeded", steps: 2 })
    expect(provider.calls).toBe(2)
    expect(toolInvocations).toBe(1)
    const messages = await fixture.session.listMessages({
      sessionId: fixture.execution.sessionId
    })
    expect(messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "tool",
      "assistant"
    ])
    expect(messages[2]?.content).toMatchObject([{
      type: "tool_result",
      toolCallId: "call_image_generate",
      isError: false,
      content: [{
        type: "resource",
        resourceId: expect.any(String),
        kind: "image",
        mediaType: "image/png",
        sizeBytes: Buffer.byteLength("deferred-generated-image")
      }]
    }])
  })

  it("invokes no tool when provider finish and content disagree", async () => {
    const storage = requireTestStore()
    const fixture = await createStartedTurn(storage, {
      suffix: "runner_finish_mismatch"
    })
    let toolCalls = 0
    const runner = new WanexAgentRunner({
      session: fixture.session,
      provider: new MismatchedFinishProvider(),
      tools: echoTools(() => { toolCalls += 1 }),
      toolPermissionPolicy: new AllowAllToolsPolicy()
    })

    const result = await runner.executeTurn({
      execution: fixture.execution,
      heartbeat: async () => {}
    })

    expect(result.outcome).toBe("recovery_required")
    expectSettled(result)
    expect(result.error).toBeInstanceOf(Error)
    expect(result.error?.message).toContain("finished with stop")
    expect(toolCalls).toBe(0)
    await expect(fixture.session.listToolExecutions()).resolves.toEqual([])
  })

  it("resumes after confirmed ambiguous success without reinvoking the tool", async () => {
    const storage = requireTestStore()
    const fixture = await createStartedTurn(storage, {
      suffix: "runner_tool_reconciliation",
      maxSteps: 4
    })
    let toolCalls = 0
    const tools = new ToolRegistry()
    tools.register({
      name: "echo",
      description: "Dispatch an ambiguous remote operation.",
      inputSchema: {
        type: "object",
        required: ["text"],
        properties: { text: { type: "string" } }
      },
      risk: "external",
      idempotent: false,
      concurrency: "exclusive",
      resultMode: "immediate",
      runtimeBinding: createToolRuntimeBinding({
        implementationId: "wanex.test.agent-runner.ambiguous-echo",
        implementationRevision: "1"
      }),
      async invoke(invocation) {
        toolCalls += 1
        return {
          outcome: "ambiguous",
          toolCallId: invocation.toolCallId,
          message: "remote response was lost",
          reconciliationRef: "remote-runner-1"
        }
      }
    })
    const provider = new ToolThenFinalProvider()
    const runner = new WanexAgentRunner({
      session: fixture.session,
      provider,
      tools,
      toolPermissionPolicy: new AllowAllToolsPolicy()
    })

    const ambiguous = await runner.executeTurn({
      execution: fixture.execution,
      heartbeat: async () => {}
    })

    expect(ambiguous.outcome).toBe("recovery_required")
    expect(provider.calls).toBe(1)
    expect(toolCalls).toBe(1)
    const [execution] = await fixture.session.listToolExecutions()
    expect(execution).toMatchObject({
      state: "recovery_required",
      recoveryRevision: 1,
      recovery: { reconciliationRef: "remote-runner-1" }
    })
    if (execution === undefined) throw new Error("missing ambiguous tool execution")
    const reconciledContent = jsonToolResultContent({ text: "hello" })
    await fixture.session.resolveToolExecutionRecovery({
      executionId: execution.id,
      expectedRecoveryRevision: execution.recoveryRevision,
      decision: "confirm_succeeded",
      principalId: "reconciler",
      reason: "verified against remote operation log",
      idempotencyKey: "runner:tool-reconciliation:confirm",
      content: reconciledContent,
      contentDigest: toolResultContentDigest(reconciledContent)
    })
    const workerId = "worker_runner_tool_reconciliation_resumed"
    const recoveredJob = await fixture.session.claimJob({
      workerId,
      leaseMs: 60_000,
      kinds: ["session.turn"]
    })
    if (recoveredJob?.leaseToken === undefined) {
      throw new Error("expected reconciled turn job")
    }
    const recovered = await fixture.session.startTurnAttempt({
      sessionId: fixture.execution.sessionId,
      turnId: fixture.execution.turnId,
      inputId: fixture.execution.inputId,
      jobId: recoveredJob.id,
      workerId,
      leaseToken: recoveredJob.leaseToken
    })

    const resumed = await runner.executeTurn({
      execution: {
        ...fixture.execution,
        attemptId: recovered.attempt.id,
        workerId,
        leaseToken: recoveredJob.leaseToken,
        recovery: recovered.turn.executionBinding.recovery
      },
      heartbeat: async () => {}
    })

    expect(resumed.outcome).toBe("succeeded")
    expect(provider.calls).toBe(2)
    expect(toolCalls).toBe(1)
    const messages = await fixture.session.listMessages({
      sessionId: fixture.execution.sessionId
    })
    expect(messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "tool",
      "assistant"
    ])
    expect(messages[2]?.content).toMatchObject([{
      type: "tool_result",
      toolCallId: "call_echo",
      content: [{ value: { text: "hello" } }],
      isError: false
    }])
  })

  it("resumes an incomplete durable tool batch before another provider call", async () => {
    const storage = requireTestStore()
    const fixture = await createStartedTurn(storage, {
      suffix: "runner_resume_tools",
      maxSteps: 4
    })
    const checkpoint = await seedToolCallCheckpoint(fixture, "call_resume_tools")
    let toolCalls = 0
    const tools = echoTools(() => {
      toolCalls += 1
    })
    const provider = new ToolThenFinalProvider()
    const runner = new WanexAgentRunner({
      session: fixture.session,
      provider,
      tools,
      toolPermissionPolicy: new AllowAllToolsPolicy()
    })

    const result = await runner.executeTurn({
      execution: fixture.execution,
      heartbeat: async () => {}
    })

    expect(result).toMatchObject({ outcome: "succeeded", steps: 2 })
    expect(toolCalls).toBe(1)
    expect(provider.calls).toBe(1)
    const messages = await fixture.session.listMessages({
      sessionId: fixture.execution.sessionId
    })
    expect(messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "tool",
      "assistant"
    ])
    expect(messages[1]?.id).toBe(checkpoint.sourceMessageId)
  })

  it("reuses a settled durable tool outcome without invoking the tool again", async () => {
    const storage = requireTestStore()
    const fixture = await createStartedTurn(storage, {
      suffix: "runner_reuse_tool",
      maxSteps: 4
    })
    const checkpoint = await seedToolCallCheckpoint(fixture, "call_reuse_tool")
    let toolCalls = 0
    const tools = echoTools(() => {
      toolCalls += 1
    })
    const permissionPolicy = new AllowAllToolsPolicy()
    await tools.execute({
      ...fixture.execution,
      sourceMessageId: checkpoint.sourceMessageId,
      call: checkpoint.call,
      idempotencyKey: `tool:${checkpoint.sourceMessageId}:${checkpoint.call.toolCallId}`,
      storage: fixture.session,
      permissionPolicy
    })
    expect(toolCalls).toBe(1)
    const provider = new ToolThenFinalProvider()
    const runner = new WanexAgentRunner({
      session: fixture.session,
      provider,
      tools,
      toolPermissionPolicy: permissionPolicy
    })

    const result = await runner.executeTurn({
      execution: fixture.execution,
      heartbeat: async () => {}
    })

    expect(result.outcome).toBe("succeeded")
    expect(toolCalls).toBe(1)
    expect(provider.calls).toBe(1)
    const executions = await fixture.session.listToolExecutions()
    expect(executions).toMatchObject([{
      toolCallId: checkpoint.call.toolCallId,
      state: "succeeded",
      attemptCount: 1
    }])
  })

  it("records a retryable provider retry as invocation number two", async () => {
    const storage = requireTestStore()
    const fixture = await createStartedTurn(storage, {
      suffix: "runner_provider_retry"
    })
    const provider = new RetryThenFinalProvider()
    const runner = new WanexAgentRunner({
      session: fixture.session,
      provider
    })

    const result = await runner.executeTurn({
      execution: fixture.execution,
      heartbeat: async () => {}
    })

    expect(result.outcome).toBe("succeeded")
    expect(provider.calls).toBe(2)
    const invocations = await fixture.session.listProviderInvocations({
      turnId: fixture.execution.turnId
    })
    expect(invocations.map((invocation) => ({
      number: invocation.invocationNumber,
      state: invocation.state
    }))).toEqual([
      { number: 1, state: "failed_before_output" },
      { number: 2, state: "succeeded" }
    ])
  })

  it("honors cancellation before resuming a durable tool batch", async () => {
    const storage = requireTestStore()
    const fixture = await createStartedTurn(storage, {
      suffix: "runner_cancel_resume"
    })
    await seedToolCallCheckpoint(fixture, "call_cancel_resume")
    await fixture.session.requestTurnCancel({
      sessionId: fixture.execution.sessionId,
      turnId: fixture.execution.turnId,
      inputId: fixture.execution.inputId,
      jobId: fixture.execution.jobId,
      reason: "cancel before recovered tools"
    })
    let toolCalls = 0
    const tools = echoTools(() => {
      toolCalls += 1
    })
    const provider = new CountingProvider()
    const runner = new WanexAgentRunner({
      session: fixture.session,
      provider,
      tools,
      toolPermissionPolicy: new AllowAllToolsPolicy()
    })

    const result = await runner.executeTurn({
      execution: fixture.execution,
      heartbeat: async () => {}
    })

    expect(result.outcome).toBe("cancelled")
    expect(toolCalls).toBe(0)
    expect(provider.calls).toBe(0)
    await expect(fixture.session.listToolExecutions()).resolves.toEqual([])
  })

  it("fails closed when a durable tool result batch does not match its calls", async () => {
    const storage = requireTestStore()
    const fixture = await createStartedTurn(storage, {
      suffix: "runner_mismatched_tools"
    })
    await seedToolCallCheckpoint(fixture, "call_expected")
    await fixture.session.appendMessage({
      ...fixture.execution,
      idempotencyKey: "turn:runner_mismatched_tools:tools",
      role: "tool",
      content: [toolResultPart(
        "call_wrong",
        jsonToolResultContent({ ok: true }),
        false
      )]
    })
    const provider = new CountingProvider()
    const runner = new WanexAgentRunner({
      session: fixture.session,
      provider
    })

    const result = await runner.executeTurn({
      execution: fixture.execution,
      heartbeat: async () => {}
    })

    expect(result.outcome).toBe("recovery_required")
    expectSettled(result)
    expect(result.settlement.turn.state).toBe("recovery_required")
    expect(provider.calls).toBe(0)
  })

  it("fails closed as recovery-required after observed provider output", async () => {
    const storage = requireTestStore()
    const fixture = await createStartedTurn(storage, {
      suffix: "runner_ambiguous"
    })
    const runner = new WanexAgentRunner({
      session: fixture.session,
      provider: new PartialThenErrorProvider()
    })

    const result = await runner.executeTurn({
      execution: fixture.execution,
      heartbeat: async () => {}
    })

    expect(result.outcome).toBe("recovery_required")
    expectSettled(result)
    expect(result.settlement.turn.state).toBe("recovery_required")
    expect(result.settlement.attempt.state).toBe("recovery_required")
    expect(result.settlement.job.state).toBe("failed")
  })

  it("fails a bounded turn that never reaches a final response", async () => {
    const storage = requireTestStore()
    const fixture = await createStartedTurn(storage, {
      suffix: "runner_bounded",
      maxSteps: 1
    })
    const tools = new ToolRegistry()
    tools.register({
      name: "echo",
      description: "Echo.",
      inputSchema: { type: "object" },
      risk: "read_only",
      idempotent: true,
      concurrency: "parallel_safe",
      resultMode: "immediate",
      runtimeBinding: createToolRuntimeBinding({
        implementationId: "wanex.test.agent-runner.bounded-echo",
        implementationRevision: "1"
      }),
      async invoke(invocation) {
        return {
          outcome: "succeeded",
          toolCallId: invocation.toolCallId,
          content: jsonToolResultContent({ ok: true })
        }
      }
    })
    const runner = new WanexAgentRunner({
      session: fixture.session,
      provider: new AlwaysToolProvider(),
      tools,
      toolPermissionPolicy: new AllowAllToolsPolicy()
    })

    const result = await runner.executeTurn({
      execution: fixture.execution,
      heartbeat: async () => {}
    })

    expect(result.outcome).toBe("failed")
    expectSettled(result)
    expect(result.error?.message).toContain("exceeded maxSteps")
    expect(result.settlement.turn.state).toBe("failed")
  })

  it("observes a durable cancellation request before invoking the provider", async () => {
    const storage = requireTestStore()
    const fixture = await createStartedTurn(storage, {
      suffix: "runner_cancel"
    })
    const provider = new CountingProvider()
    await fixture.session.requestTurnCancel({
      sessionId: fixture.execution.sessionId,
      turnId: fixture.execution.turnId,
      inputId: fixture.execution.inputId,
      jobId: fixture.execution.jobId,
      reason: "user cancelled"
    })
    const runner = new WanexAgentRunner({
      session: fixture.session,
      provider
    })

    const result = await runner.executeTurn({
      execution: fixture.execution,
      heartbeat: async () => {}
    })

    expect(result.outcome).toBe("cancelled")
    expectSettled(result)
    expect(provider.calls).toBe(0)
    expect(result.settlement.turn.state).toBe("cancelled")
    expect(result.settlement.job.state).toBe("cancelled")
  })
})

function expectSettled(
  result: ExecuteTurnResult
): asserts result is Exclude<ExecuteTurnResult, { readonly outcome: "suspended" }> {
  if (result.outcome === "suspended") {
    throw new Error("expected a terminal turn result")
  }
}

function requireTestStore(): StorageTestStore {
  if (testStore === undefined) {
    throw new Error("agent runner test store is not initialized")
  }
  return testStore
}

async function seedToolCallCheckpoint(
  fixture: StartedTurnFixture,
  toolCallId: string
) {
  const call = {
    type: "tool_call" as const,
    id: `part_${toolCallId}`,
    toolCallId,
    toolName: "echo",
    input: { text: "hello" }
  }
  const invocation = await fixture.session.beginProviderInvocation({
    ...fixture.execution,
    step: 1,
    invocationNumber: 1,
    requestDigest: `checkpoint:${toolCallId}`
  })
  const receipt = await fixture.session.finishProviderInvocation({
    ...fixture.execution,
    invocationId: invocation.id,
    outcome: "succeeded",
    assistantMessage: [call]
  })
  if (receipt?.assistantMessage === undefined) {
    throw new Error("expected durable assistant tool-call checkpoint")
  }
  return { call, sourceMessageId: receipt.assistantMessage.id }
}

function echoTools(onInvoke: () => void): ToolRegistry {
  const tools = new ToolRegistry()
  tools.register({
    name: "echo",
    description: "Echo a text value.",
    inputSchema: {
      type: "object",
      required: ["text"],
      properties: { text: { type: "string" } }
    },
    risk: "read_only",
    idempotent: true,
    concurrency: "parallel_safe",
    resultMode: "immediate",
    runtimeBinding: createToolRuntimeBinding({
      implementationId: "wanex.test.agent-runner.recovery-echo",
      implementationRevision: "1"
    }),
    async invoke(invocation) {
      onInvoke()
      return {
        outcome: "succeeded",
        toolCallId: invocation.toolCallId,
        content: jsonToolResultContent({
          text: (invocation.input as { text: string }).text
        })
      }
    }
  })
  return tools
}

function approvalEchoTools(onInvoke: () => void): ToolRegistry {
  const tools = new ToolRegistry()
  tools.register({
    name: "echo",
    description: "Echo a text value after explicit approval.",
    inputSchema: {
      type: "object",
      required: ["text"],
      properties: { text: { type: "string" } }
    },
    risk: "external",
    idempotent: false,
    concurrency: "exclusive",
    resultMode: "immediate",
    runtimeBinding: createToolRuntimeBinding({
      implementationId: "wanex.test.agent-runner.approval-echo",
      implementationRevision: "1"
    }),
    async invoke(invocation) {
      onInvoke()
      return {
        outcome: "succeeded",
        toolCallId: invocation.toolCallId,
        content: jsonToolResultContent({
          text: (invocation.input as { text: string }).text
        })
      }
    }
  })
  return tools
}

class ApprovalRequiredTestPolicy {
  calls = 0

  snapshot() {
    return createToolRuntimeBinding({
      implementationId: "wanex.test.agent-runner.approval-policy",
      implementationRevision: "1"
    })
  }

  async authorize(
    request: ToolPermissionRequest
  ): Promise<ToolPermissionDecision> {
    this.calls += 1
    return {
      status: "approval_required",
      reason: "operator_review_required",
      presentation: {
        summary: "Approve the exact echo action",
        details: [{ label: "Tool", value: request.call.toolName }]
      },
      authorizationRef: "runner-test:approval"
    }
  }
}

class ToolThenFinalProvider implements ProviderAdapter {
  readonly protocol = { id: "fake" } as const
  readonly providerId = "tool-final"
  readonly model = testConversationModel("tool-final-model")
  calls = 0

  async *stream(request: ProviderRequest): AsyncIterable<ProviderEvent> {
    this.calls += 1
    const hasToolResult = request.messages.some((message) =>
      message.content.some((part) => part.type === "tool_result")
    )
    if (!hasToolResult) {
      yield { type: "tool_call_start", index: 0, toolCallId: "call_echo" }
      yield {
        type: "tool_call_delta",
        toolCallId: "call_echo",
        toolNameDelta: "echo",
        inputJsonDelta: JSON.stringify({ text: "hello" })
      }
      yield { type: "tool_call_end", toolCallId: "call_echo" }
      yield { type: "finish", reason: "tool_calls" }
      return
    }
    yield {
      type: "text_delta",
      partId: "part_final",
      delta: "tool complete"
    }
    yield { type: "finish", reason: "stop" }
  }

  buildReplayMessages(messages: readonly ProviderReplayMessage[]): JsonValue[] {
    return messages as unknown as JsonValue[]
  }
}

class RequestCaptureProvider implements ProviderAdapter {
  readonly protocol = { id: "fake" } as const
  readonly providerId = "request-capture"
  request: ProviderRequest | undefined

  constructor(readonly model: import("@wanex/protocol").ModelDescriptor) {}

  async *stream(request: ProviderRequest): AsyncIterable<ProviderEvent> {
    this.request = request
    yield { type: "text_delta", partId: "part_request_capture", delta: "ok" }
    yield { type: "finish", reason: "stop" }
  }

  buildReplayMessages(messages: readonly ProviderReplayMessage[]): JsonValue[] {
    return messages as unknown as JsonValue[]
  }
}

class DeferredImageThenFinalProvider implements ProviderAdapter {
  readonly protocol = { id: "fake" } as const
  readonly providerId = "deferred-image-conversation"
  readonly model = testConversationModel("deferred-image-conversation-model")
  calls = 0

  async *stream(request: ProviderRequest): AsyncIterable<ProviderEvent> {
    this.calls += 1
    const hasToolResult = request.messages.some((message) =>
      message.content.some((part) => part.type === "tool_result")
    )
    if (!hasToolResult) {
      yield {
        type: "tool_call_start",
        index: 0,
        toolCallId: "call_image_generate"
      }
      yield {
        type: "tool_call_delta",
        toolCallId: "call_image_generate",
        toolNameDelta: "image_generate",
        inputJsonDelta: JSON.stringify({ prompt: "a durable image" })
      }
      yield {
        type: "tool_call_end",
        toolCallId: "call_image_generate"
      }
      yield { type: "finish", reason: "tool_calls" }
      return
    }
    yield {
      type: "text_delta",
      partId: "part_deferred_image_final",
      delta: "The image is ready."
    }
    yield { type: "finish", reason: "stop" }
  }

  buildReplayMessages(messages: readonly ProviderReplayMessage[]): JsonValue[] {
    return messages as unknown as JsonValue[]
  }
}

class DeferredTestImageAdapter implements MediaGenerationAdapter {
  readonly modelEndpoint: MediaGenerationModelEndpoint = {
    id: "endpoint_deferred_image_media",
    connection: {
      id: "connection_deferred_image_media",
      providerId: "deferred-image-media"
    },
    protocol: { id: "fake-media" },
    model: {
      id: "deferred-image-media-model",
      operations: ["image.generate"],
      inputModalities: ["text"],
      outputModalities: ["image"],
      features: [],
      catalog: {
        source: "custom",
        catalogId: "test.deferred-image-media-model",
        revision: "1"
      }
    }
  }

  readonly protocolId = this.modelEndpoint.protocol.id

  canExecute(modelEndpoint: import("@wanex/protocol").ModelEndpoint): boolean {
    return modelEndpoint.protocol.id === this.protocolId
  }

  async submit(): Promise<MediaGenerationSubmitResult> {
    return {
      status: "completed",
      outputs: [{
        kindOfOutput: "inline_bytes",
        bytes: Buffer.from("deferred-generated-image"),
        mediaType: "image/png",
        kind: "image"
      }]
    }
  }

  async poll(): Promise<MediaGenerationPollResult> {
    throw new Error("immediate deferred test adapter does not poll")
  }
}

class MismatchedFinishProvider implements ProviderAdapter {
  readonly protocol = { id: "fake" } as const
  readonly providerId = "mismatched-finish"
  readonly model = testConversationModel("mismatched-finish-model")

  async *stream(): AsyncIterable<ProviderEvent> {
    yield { type: "tool_call_start", index: 0, toolCallId: "call_echo" }
    yield {
      type: "tool_call_delta",
      toolCallId: "call_echo",
      toolNameDelta: "echo",
      inputJsonDelta: JSON.stringify({ text: "must not execute" })
    }
    yield { type: "tool_call_end", toolCallId: "call_echo" }
    yield { type: "finish", reason: "stop" }
  }

  buildReplayMessages(messages: readonly ProviderReplayMessage[]): JsonValue[] {
    return messages as unknown as JsonValue[]
  }
}

class RetryThenFinalProvider implements ProviderAdapter {
  readonly protocol = { id: "fake" } as const
  readonly providerId = "retry-final"
  readonly model = testConversationModel("retry-final-model")
  calls = 0

  async *stream(): AsyncIterable<ProviderEvent> {
    this.calls += 1
    if (this.calls === 1) {
      yield {
        type: "error",
        error: {
          category: "network",
          message: "retryable request failure",
          retryable: true,
          providerId: this.providerId,
          modelId: this.model.id,
          phase: "request"
        }
      }
      return
    }
    yield {
      type: "text_delta",
      partId: "part_retry_final",
      delta: "done"
    }
    yield { type: "finish", reason: "stop" }
  }

  buildReplayMessages(messages: readonly ProviderReplayMessage[]): JsonValue[] {
    return messages as unknown as JsonValue[]
  }
}

class PartialThenErrorProvider implements ProviderAdapter {
  readonly protocol = { id: "fake" } as const
  readonly providerId = "partial-error"
  readonly model = testConversationModel("partial-error-model")

  async *stream(): AsyncIterable<ProviderEvent> {
    yield { type: "text_delta", partId: "part_partial", delta: "partial" }
    yield {
      type: "error",
      error: {
        category: "network",
        message: "connection lost",
        retryable: true,
        providerId: this.providerId,
        modelId: this.model.id,
        phase: "stream"
      }
    }
  }

  buildReplayMessages(messages: readonly ProviderReplayMessage[]): JsonValue[] {
    return messages as unknown as JsonValue[]
  }
}

class AlwaysToolProvider extends ToolThenFinalProvider {
  override async *stream(): AsyncIterable<ProviderEvent> {
    this.calls += 1
    yield {
      type: "tool_call_start",
      index: 0,
      toolCallId: "call_echo_" + this.calls
    }
    yield {
      type: "tool_call_delta",
      toolCallId: "call_echo_" + this.calls,
      toolNameDelta: "echo",
      inputJsonDelta: "{}"
    }
    yield {
      type: "tool_call_end",
      toolCallId: "call_echo_" + this.calls
    }
    yield { type: "finish", reason: "tool_calls" }
  }
}

class CountingProvider implements ProviderAdapter {
  readonly protocol = { id: "fake" } as const
  readonly providerId = "counting"
  readonly model = testConversationModel("counting-model")
  calls = 0

  async *stream(): AsyncIterable<ProviderEvent> {
    this.calls += 1
    yield { type: "finish", reason: "stop" }
  }

  buildReplayMessages(messages: readonly ProviderReplayMessage[]): JsonValue[] {
    return messages as unknown as JsonValue[]
  }
}

class RecoverySteeringProvider implements ProviderAdapter {
  readonly protocol = { id: "fake" } as const
  readonly providerId = "recovery-steering"
  readonly model = testConversationModel("recovery-steering-model")
  calls = 0
  lastUserTexts: string[] = []

  async *stream(request: ProviderRequest): AsyncIterable<ProviderEvent> {
    this.calls += 1
    this.lastUserTexts = request.messages
      .filter((message) => message.role === "user")
      .flatMap((message) => message.content)
      .flatMap((part) => part.type === "text" ? [part.text] : [])
    yield {
      type: "text_delta",
      partId: "part_recovered_final",
      delta: "recovered final response"
    }
    yield { type: "finish", reason: "stop" }
  }

  buildReplayMessages(messages: readonly ProviderReplayMessage[]): JsonValue[] {
    return messages as unknown as JsonValue[]
  }
}
