import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  createStorageTestStore,
  type StorageTestStore
} from "@wanex/storage/testing"
import { WanexWorker } from "../src/jobs/index.js"
import { registerSessionTurnHandler } from "../src/execution/worker/index.js"
import { createTurnExecutionBinding } from "../src/execution/turn-binding.js"
import {
  FakeProviderAdapter,
  writeModelEndpoint,
  type ProviderRequest
} from "../src/provider/index.js"
import { WanexSessionCore } from "../src/sessions/index.js"
import {
  AllowAllToolsPolicy,
  createToolRuntimeBinding,
  jsonToolResultContent,
  RiskBoundToolPolicy,
  ToolRegistry,
  type ToolPermissionDecision,
  type ToolPermissionPolicy,
  type ToolPermissionRequest
} from "../src/tools/index.js"
import type { AgentRuntimeExecutionStageEvent } from "../src/execution/stage.js"
import { fakeModelEndpoint } from "./model-endpoint-fixture.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)
const tempDirs: string[] = []
let testStore: StorageTestStore | undefined

beforeEach(async () => {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-agent-worker-"))
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

describe("session.turn worker handler", () => {
  it("claims the exact job, starts its attempt, and settles the transcript", async () => {
    const storage = requireTestStore()
    const session = new WanexSessionCore({ storage })
    await session.create({ id: "ses_worker_turn", kind: "agent" })
    const submitted = await session.submitTurn({
      id: "inp_worker_turn",
      turnId: "turn_worker_turn",
      sessionId: "ses_worker_turn",
      principalId: "principal_worker_turn",
      idempotencyKey: "idem_worker_turn",
      content: [{
        type: "text",
        id: "part_worker_turn",
        text: "hello"
      }],
      jobId: "job_worker_turn",
      executionBinding: createTurnExecutionBinding({
        modelEndpoint: fakeModelEndpoint("worker_turn"),
        createdAt: 1
      })
    })
    const worker = new WanexWorker({
      session,
      workerId: "worker_turn_handler",
      leaseMs: 60_000,
      kinds: ["session.turn"]
    })
    registerSessionTurnHandler({
      worker,
      session,
      storage
    })

    const result = await worker.runOnce()

    expect(result.status).toBe("completed")
    if (result.status !== "completed") {
      throw new Error("expected completed worker result")
    }
    expect(result.job).toMatchObject({
      id: submitted.job.id,
      state: "succeeded"
    })
    const [turn] = await session.listTurns({ sessionId: submitted.turn.sessionId })
    expect(turn).toMatchObject({
      id: submitted.turn.id,
      state: "succeeded"
    })
    const [attempt] = await session.listAttempts({ turnId: submitted.turn.id })
    expect(attempt).toMatchObject({
      jobId: submitted.job.id,
      workerId: "worker_turn_handler",
      state: "succeeded"
    })
    const messages = await session.listMessages({
      sessionId: submitted.turn.sessionId
    })
    expect(messages.map((message) => message.role)).toEqual([
      "user",
      "assistant"
    ])
    expect(messages[1]?.content).toMatchObject([{
      type: "text",
      text: "Fake response from model_worker_turn"
    }])
  })

  it("automatically resumes a durable approval through the real Worker loop", async () => {
    const storage = requireTestStore()
    const session = new WanexSessionCore({ storage })
    const modelEndpoint = fakeModelEndpoint("worker_approval_loop")
    const provider = new CountingFakeProvider({
      model: modelEndpoint.model,
      responseText: "approved",
      toolName: "approval_tool"
    })
    const policy = new ApprovalToolPolicy()
    const tools = approvalToolRegistry()
    const stageEvents: AgentRuntimeExecutionStageEvent[] = []
    await session.create({ id: "ses_worker_approval_loop", kind: "agent" })
    const submitted = await session.submitTurn({
      id: "inp_worker_approval_loop",
      turnId: "turn_worker_approval_loop",
      sessionId: "ses_worker_approval_loop",
      principalId: "principal_worker_approval_loop",
      idempotencyKey: "idem_worker_approval_loop",
      content: [{
        type: "text",
        id: "part_worker_approval_loop",
        text: "approve the operation"
      }],
      jobId: "job_worker_approval_loop",
      executionBinding: createTurnExecutionBinding({
        modelEndpoint,
        agentContext: { tools, toolPermissionPolicy: policy },
        createdAt: 1
      })
    })
    const worker = new WanexWorker({
      session,
      workerId: "worker_approval_loop",
      leaseMs: 60_000,
      kinds: ["session.turn"]
    })
    registerSessionTurnHandler({
      worker,
      session,
      storage,
      directProvider: provider,
      agentContext: { tools, toolPermissionPolicy: policy },
      observeExecutionStage: (event) => stageEvents.push(event)
    })
    const loop = worker.start({ idleIntervalMs: 1, errorIntervalMs: 1 })
    try {
      const approval = await eventually(async () => {
        const executions = await storage.listToolExecutions({
          turnId: submitted.turn.id
        })
        const pending = executions.find((execution) =>
          execution.state === "approval_required"
        )
        if (pending === undefined) {
          throw new Error("approval has not been persisted")
        }
        return pending
      })
      expect(provider.calls).toBe(1)
      expect(approval.attemptCount).toBe(0)
      expect(stageEvents.map((event) => event.stage)).toEqual([
        "worker_claimed",
        "turn_attempt_started",
        "input_loaded",
        "context_resolved",
        "provider_resolved",
        "recovery_checkpoint_read",
        "provider_request_prepared",
        "provider_invocation_started",
        "provider_invocation_succeeded",
        "tool_batch_preflight_started",
        "tool_batch_preflight_completed",
        "tool_execution_begin_requested",
        "tool_execution_begin_completed"
      ])

      await storage.resolveToolExecutionApproval({
        executionId: approval.id,
        expectedApprovalRevision: approval.approvalRevision,
        decision: "approve_once",
        principalId: "principal_worker_approval_loop",
        reason: "approved by the test reviewer",
        idempotencyKey: "approve-worker-loop"
      })

      await eventually(async () => {
        const turns = await session.listTurns({
          sessionId: submitted.turn.sessionId
        })
        expect(turns.find((turn) => turn.id === submitted.turn.id)?.state)
          .toBe("succeeded")
        expect(provider.calls).toBe(2)
      })
      const executions = await storage.listToolExecutions({
        turnId: submitted.turn.id
      })
      expect(executions).toEqual([
        expect.objectContaining({
          id: approval.id,
          state: "succeeded",
          attemptCount: 1
        })
      ])
      expect(stageEvents.map((event) => event.stage)).toEqual([
        "worker_claimed",
        "turn_attempt_started",
        "input_loaded",
        "context_resolved",
        "provider_resolved",
        "recovery_checkpoint_read",
        "provider_request_prepared",
        "provider_invocation_started",
        "provider_invocation_succeeded",
        "tool_batch_preflight_started",
        "tool_batch_preflight_completed",
        "tool_execution_begin_requested",
        "tool_execution_begin_completed",
        "worker_claimed",
        "turn_attempt_started",
        "input_loaded",
        "context_resolved",
        "provider_resolved",
        "recovery_checkpoint_read",
        "tool_batch_preflight_started",
        "tool_batch_preflight_completed",
        "tool_execution_begin_requested",
        "tool_execution_begin_completed",
        "tool_execution_settled",
        "tool_result_persisted",
        "provider_request_prepared",
        "provider_invocation_started",
        "provider_invocation_succeeded",
        "turn_settlement_started",
        "turn_settled"
      ])
    } finally {
      loop.stop()
      await loop.waitForIdle()
    }
  }, 20_000)

  it("compacts an over-capacity Session inline under its session.turn lease", async () => {
    const storage = requireTestStore()
    const session = new WanexSessionCore({ storage })
    const modelEndpoint = fakeModelEndpoint("worker_inline_capacity")
    const boundedEndpoint = {
      ...modelEndpoint,
      model: {
        ...modelEndpoint.model,
        limits: {
          contextWindowTokens: 800,
          maxInputTokens: 750,
          maxOutputTokens: 100
        }
      }
    }
    const provider = new CountingFakeProvider({
      model: boundedEndpoint.model,
      responseText: "## Goal\nInline summary or final answer"
    })
    await session.create({ id: "ses_worker_inline_capacity", kind: "agent" })
    await appendCompletedTurn(session, boundedEndpoint, {
      sessionId: "ses_worker_inline_capacity",
      suffix: "inline_old",
      userText: "old request",
      assistantText: "old evidence " + "x".repeat(900)
    })
    const canonicalBefore = await session.listMessages({
      sessionId: "ses_worker_inline_capacity"
    })
    const submitted = await session.submitTurn({
      id: "inp_worker_inline_capacity",
      turnId: "turn_worker_inline_capacity",
      sessionId: "ses_worker_inline_capacity",
      principalId: "principal_worker_inline_capacity",
      idempotencyKey: "idem_worker_inline_capacity",
      content: [{
        type: "text",
        id: "part_worker_inline_capacity",
        text: "current request " + "y".repeat(2_000)
      }],
      jobId: "job_worker_inline_capacity",
      executionBinding: createTurnExecutionBinding({
        modelEndpoint: boundedEndpoint,
        maxOutputTokens: 100,
        createdAt: 2
      })
    })
    const worker = new WanexWorker({
      session,
      workerId: "worker_inline_capacity",
      leaseMs: 60_000,
      kinds: ["session.turn"]
    })
    registerSessionTurnHandler({
      worker,
      session,
      storage,
      directProvider: provider
    })

    await expect(worker.runOnce()).resolves.toMatchObject({ status: "completed" })

    expect(provider.requests).toHaveLength(2)
    expect(provider.requests.map((request) => request.maxOutputTokens)).toEqual([
      100,
      100
    ])
    expect(provider.requests[0]?.tools).toBeUndefined()
    expect(provider.requests[0]?.messages.map((message) => message.role)).toEqual([
      "system",
      "user"
    ])
    expect(JSON.stringify(provider.requests[1]?.messages)).toContain(
      "Semantic checkpoint through message sequence"
    )
    expect(JSON.stringify(provider.requests[1]?.messages)).toContain(
      "current request"
    )
    await expect(storage.getActiveContextEpoch({
      sessionId: submitted.turn.sessionId
    })).resolves.toMatchObject({
      id: "ctxepoch_job_worker_inline_capacity",
      jobId: "job_worker_inline_capacity",
      state: "active",
      cutMessageId: canonicalBefore.at(-1)?.id
    })
    const canonicalAfter = await session.listMessages({
      sessionId: submitted.turn.sessionId
    })
    expect(canonicalAfter.slice(0, canonicalBefore.length)).toEqual(canonicalBefore)
  })

  it("fails before Provider dispatch when the current Turn alone cannot fit", async () => {
    const storage = requireTestStore()
    const session = new WanexSessionCore({ storage })
    const endpoint = fakeModelEndpoint("worker_capacity_failure")
    const boundedEndpoint = {
      ...endpoint,
      model: {
        ...endpoint.model,
        limits: { contextWindowTokens: 300, maxOutputTokens: 100 }
      }
    }
    const provider = new CountingFakeProvider({
      model: boundedEndpoint.model,
      responseText: "must not dispatch"
    })
    await session.create({ id: "ses_worker_capacity_failure", kind: "agent" })
    await session.submitTurn({
      id: "inp_worker_capacity_failure",
      turnId: "turn_worker_capacity_failure",
      sessionId: "ses_worker_capacity_failure",
      principalId: "principal_worker_capacity_failure",
      idempotencyKey: "idem_worker_capacity_failure",
      content: [{
        type: "text",
        id: "part_worker_capacity_failure",
        text: "z".repeat(1_200)
      }],
      jobId: "job_worker_capacity_failure",
      executionBinding: createTurnExecutionBinding({
        modelEndpoint: boundedEndpoint,
        maxOutputTokens: 100,
        createdAt: 1
      })
    })
    const worker = new WanexWorker({
      session,
      workerId: "worker_capacity_failure",
      leaseMs: 60_000,
      kinds: ["session.turn"]
    })
    registerSessionTurnHandler({
      worker,
      session,
      storage,
      directProvider: provider
    })

    await expect(worker.runOnce()).resolves.toMatchObject({
      status: "failed",
      error: { name: "ContextCapacityError" }
    })
    expect(provider.calls).toBe(0)
    await expect(session.listMessages({
      sessionId: "ses_worker_capacity_failure"
    })).resolves.toMatchObject([{
      role: "user",
      content: [{ text: "z".repeat(1_200) }]
    }])
    await expect(session.listTurns({
      sessionId: "ses_worker_capacity_failure"
    })).resolves.toMatchObject([{
      state: "failed",
      error: {
        kind: "session_turn.context_capacity_exceeded",
        capacity: {
          reasons: ["input_tokens_exceeded"],
          inputTokens: 304,
          inputTokenCeiling: 200,
          inputResources: 0,
          requestedOutputTokens: 100,
          compactionAttempted: true
        }
      }
    }])
  })

  it("rechecks after Tool results and blocks an unchecked second dispatch", async () => {
    const storage = requireTestStore()
    const session = new WanexSessionCore({ storage })
    const endpoint = fakeModelEndpoint("worker_tool_capacity")
    const boundedEndpoint = {
      ...endpoint,
      model: {
        ...endpoint.model,
        limits: { contextWindowTokens: 500, maxOutputTokens: 100 }
      }
    }
    const provider = new CountingFakeProvider({
      model: boundedEndpoint.model,
      responseText: "must not reach the second dispatch",
      toolName: "large_result"
    })
    const tools = registryWithLargeResult("large_result", 3_000)
    const toolPermissionPolicy = new AllowAllToolsPolicy()
    await session.create({ id: "ses_worker_tool_capacity", kind: "agent" })
    await session.submitTurn({
      id: "inp_worker_tool_capacity",
      turnId: "turn_worker_tool_capacity",
      sessionId: "ses_worker_tool_capacity",
      principalId: "principal_worker_tool_capacity",
      idempotencyKey: "idem_worker_tool_capacity",
      content: [{
        type: "text",
        id: "part_worker_tool_capacity",
        text: "call the tool"
      }],
      jobId: "job_worker_tool_capacity",
      executionBinding: createTurnExecutionBinding({
        modelEndpoint: boundedEndpoint,
        agentContext: { tools, toolPermissionPolicy },
        maxOutputTokens: 100,
        createdAt: 1
      })
    })
    const worker = new WanexWorker({
      session,
      workerId: "worker_tool_capacity",
      leaseMs: 60_000,
      kinds: ["session.turn"]
    })
    registerSessionTurnHandler({
      worker,
      session,
      storage,
      directProvider: provider,
      agentContext: { tools, toolPermissionPolicy }
    })

    await expect(worker.runOnce()).resolves.toMatchObject({
      status: "failed",
      error: { name: "ContextCapacityError" }
    })
    expect(provider.calls).toBe(1)
    expect((await session.listMessages({
      sessionId: "ses_worker_tool_capacity"
    })).map((message) => message.role)).toEqual(["user", "assistant", "tool"])
  })

  it("compacts old resource-bearing Turns before enforcing maxInputResources", async () => {
    const storage = requireTestStore()
    const session = new WanexSessionCore({ storage })
    const endpoint = fakeModelEndpoint("worker_resource_capacity")
    const boundedEndpoint = {
      ...endpoint,
      model: {
        ...endpoint.model,
        inputModalities: ["text", "image"] as const,
        limits: {
          contextWindowTokens: 10_000,
          maxOutputTokens: 100,
          maxInputResources: 1
        }
      }
    }
    const provider = new CountingFakeProvider({
      model: boundedEndpoint.model,
      responseText: "## Goal\nResource-aware summary or final answer"
    })
    const oldResource = await storage.ingestResource({
      content: Uint8Array.from([1, 2, 3]),
      mediaType: "image/png",
      kind: "image",
      origin: "user_upload"
    })
    const currentResource = await storage.ingestResource({
      content: Uint8Array.from([4, 5, 6]),
      mediaType: "image/png",
      kind: "image",
      origin: "user_upload"
    })
    await session.create({ id: "ses_worker_resource_capacity", kind: "agent" })
    await appendCompletedTurn(session, boundedEndpoint, {
      sessionId: "ses_worker_resource_capacity",
      suffix: "resource_old",
      userText: "remember old image",
      assistantText: "old image inspected",
      resource: oldResource
    })
    const currentEvidence = resourceEvidence(currentResource)
    await session.submitTurn({
      id: "inp_worker_resource_capacity",
      turnId: "turn_worker_resource_capacity",
      sessionId: "ses_worker_resource_capacity",
      principalId: "principal_worker_resource_capacity",
      idempotencyKey: "idem_worker_resource_capacity",
      content: [
        {
          type: "text",
          id: "part_worker_resource_capacity",
          text: "inspect current image"
        },
        {
          type: "resource",
          id: "resource_worker_resource_capacity",
          ...currentEvidence
        }
      ],
      jobId: "job_worker_resource_capacity",
      executionBinding: createTurnExecutionBinding({
        modelEndpoint: boundedEndpoint,
        maxOutputTokens: 100,
        resources: [currentEvidence],
        createdAt: 2
      })
    })
    const worker = new WanexWorker({
      session,
      workerId: "worker_resource_capacity",
      leaseMs: 60_000,
      kinds: ["session.turn"]
    })
    registerSessionTurnHandler({
      worker,
      session,
      storage,
      directProvider: provider
    })

    await expect(worker.runOnce()).resolves.toMatchObject({ status: "completed" })
    expect(provider.requests).toHaveLength(2)
    expect(provider.requests[0]?.messages.some((message) =>
      message.content.some((part) => part.type === "resource")
    )).toBe(false)
    expect(provider.requests[1]?.messages.reduce(
      (count, message) =>
        count + message.content.filter((part) => part.type === "resource").length,
      0
    )).toBe(1)
    await expect(storage.getActiveContextEpoch({
      sessionId: "ses_worker_resource_capacity"
    })).resolves.toMatchObject({
      id: "ctxepoch_job_worker_resource_capacity",
      state: "active"
    })
  })

  it("executes the immutable admitted provider binding after profile config changes", async () => {
    const storage = requireTestStore()
    const session = new WanexSessionCore({ storage })
    await session.create({ id: "ses_worker_binding", kind: "agent" })
    const admittedEndpoint = fakeModelEndpoint("binding_original")
    const submitted = await session.submitTurn({
      id: "inp_worker_binding",
      turnId: "turn_worker_binding",
      sessionId: "ses_worker_binding",
      principalId: "principal_worker_binding",
      idempotencyKey: "idem_worker_binding",
      content: [{
        type: "text",
        id: "part_worker_binding",
        text: "bound"
      }],
      jobId: "job_worker_binding",
      executionBinding: createTurnExecutionBinding({
        modelEndpoint: admittedEndpoint,
        createdAt: 1
      })
    })
    await writeModelEndpoint(storage, {
      ...admittedEndpoint,
      model: { ...admittedEndpoint.model, id: "model_mutated" }
    })
    const worker = new WanexWorker({
      session,
      workerId: "worker_binding",
      leaseMs: 60_000,
      kinds: ["session.turn"]
    })
    registerSessionTurnHandler({ worker, session, storage })

    await expect(worker.runOnce()).resolves.toMatchObject({
      status: "completed"
    })
    const messages = await session.listMessages({
      sessionId: submitted.turn.sessionId
    })
    expect(JSON.stringify(messages)).toContain(
      "Fake response from model_binding_original"
    )
    expect(JSON.stringify(messages)).not.toContain("model_mutated")
  })

  it("fails the turn when resolved tool context no longer matches admission", async () => {
    const storage = requireTestStore()
    const session = new WanexSessionCore({ storage })
    await session.create({ id: "ses_worker_context", kind: "agent" })
    const admittedTools = registryWithTool("tool_a")
    const submitted = await session.submitTurn({
      id: "inp_worker_context",
      turnId: "turn_worker_context",
      sessionId: "ses_worker_context",
      principalId: "principal_worker_context",
      idempotencyKey: "idem_worker_context",
      content: [{
        type: "text",
        id: "part_worker_context",
        text: "context"
      }],
      jobId: "job_worker_context",
      executionBinding: createTurnExecutionBinding({
        modelEndpoint: fakeModelEndpoint("worker_context"),
        agentContext: { tools: admittedTools },
        createdAt: 1
      })
    })
    const worker = new WanexWorker({
      session,
      workerId: "worker_context",
      leaseMs: 60_000,
      kinds: ["session.turn"]
    })
    registerSessionTurnHandler({
      worker,
      session,
      storage,
      resolveAgentContext: () => ({
        tools: registryWithTool("tool_b")
      })
    })

    const result = await worker.runOnce()

    expect(result.status).toBe("failed")
    if (result.status !== "failed") {
      throw new Error("expected failed worker result")
    }
    expect(result.error?.message).toContain(
      "resolved agent context does not match"
    )
    const [turn] = await session.listTurns({
      sessionId: submitted.turn.sessionId
    })
    expect(turn?.state).toBe("failed")
    expect(result.job?.state).toBe("failed")
  })

  it("rejects same-descriptor tool implementation drift before provider dispatch", async () => {
    const storage = requireTestStore()
    const session = new WanexSessionCore({ storage })
    const modelEndpoint = fakeModelEndpoint("worker_tool_revision")
    const provider = new CountingFakeProvider({
      model: modelEndpoint.model,
      responseText: "must not dispatch"
    })
    let toolCalls = 0
    await session.create({ id: "ses_worker_tool_revision", kind: "agent" })
    await session.submitTurn({
      id: "inp_worker_tool_revision",
      turnId: "turn_worker_tool_revision",
      sessionId: "ses_worker_tool_revision",
      principalId: "principal_worker_tool_revision",
      idempotencyKey: "idem_worker_tool_revision",
      content: [{
        type: "text",
        id: "part_worker_tool_revision",
        text: "use optional tool"
      }],
      jobId: "job_worker_tool_revision",
      executionBinding: createTurnExecutionBinding({
        modelEndpoint,
        agentContext: {
          tools: registryWithTool("optional_tool", "1")
        },
        createdAt: 1
      })
    })
    const worker = new WanexWorker({
      session,
      workerId: "worker_tool_revision",
      leaseMs: 60_000,
      kinds: ["session.turn"]
    })
    registerSessionTurnHandler({
      worker,
      session,
      storage,
      directProvider: provider,
      resolveAgentContext: () => ({
        tools: registryWithTool("optional_tool", "2", "default", () => {
          toolCalls += 1
        })
      })
    })

    await expect(worker.runOnce()).resolves.toMatchObject({
      status: "failed",
      error: { message: expect.stringContaining("does not match") }
    })
    expect(provider.calls).toBe(0)
    expect(toolCalls).toBe(0)
  })

  it("rejects tool configuration drift before dispatch", async () => {
    const storage = requireTestStore()
    const session = new WanexSessionCore({ storage })
    const modelEndpoint = fakeModelEndpoint("worker_tool_configuration")
    const provider = new CountingFakeProvider({
      model: modelEndpoint.model,
      responseText: "must not dispatch"
    })
    await session.create({ id: "ses_worker_tool_configuration", kind: "agent" })
    await session.submitTurn({
      id: "inp_worker_tool_configuration",
      turnId: "turn_worker_tool_configuration",
      sessionId: "ses_worker_tool_configuration",
      principalId: "principal_worker_tool_configuration",
      idempotencyKey: "idem_worker_tool_configuration",
      content: [{
        type: "text",
        id: "part_worker_tool_configuration",
        text: "use configured optional tool"
      }],
      jobId: "job_worker_tool_configuration",
      executionBinding: createTurnExecutionBinding({
        modelEndpoint,
        agentContext: {
          tools: registryWithTool("optional_tool", "1", "configuration-a"),
          toolPermissionPolicy: new AllowAllToolsPolicy()
        },
        createdAt: 1
      })
    })
    const worker = new WanexWorker({
      session,
      workerId: "worker_tool_configuration",
      leaseMs: 60_000,
      kinds: ["session.turn"]
    })
    registerSessionTurnHandler({
      worker,
      session,
      storage,
      directProvider: provider,
      resolveAgentContext: () => ({
        tools: registryWithTool("optional_tool", "1", "configuration-b"),
        toolPermissionPolicy: new AllowAllToolsPolicy()
      })
    })

    await expect(worker.runOnce()).resolves.toMatchObject({
      status: "failed",
      error: { message: expect.stringContaining("does not match") }
    })
    expect(provider.calls).toBe(0)
  })

  it("rejects permission-policy drift before dispatch", async () => {
    const storage = requireTestStore()
    const session = new WanexSessionCore({ storage })
    const modelEndpoint = fakeModelEndpoint("worker_tool_permission")
    const provider = new CountingFakeProvider({
      model: modelEndpoint.model,
      responseText: "must not dispatch"
    })
    const tools = registryWithTool("optional_tool")
    await session.create({ id: "ses_worker_tool_permission", kind: "agent" })
    await session.submitTurn({
      id: "inp_worker_tool_permission",
      turnId: "turn_worker_tool_permission",
      sessionId: "ses_worker_tool_permission",
      principalId: "principal_worker_tool_permission",
      idempotencyKey: "idem_worker_tool_permission",
      content: [{
        type: "text",
        id: "part_worker_tool_permission",
        text: "use policy-bound optional tool"
      }],
      jobId: "job_worker_tool_permission",
      executionBinding: createTurnExecutionBinding({
        modelEndpoint,
        agentContext: {
          tools,
          toolPermissionPolicy: new AllowAllToolsPolicy()
        },
        createdAt: 1
      })
    })
    const worker = new WanexWorker({
      session,
      workerId: "worker_tool_permission",
      leaseMs: 60_000,
      kinds: ["session.turn"]
    })
    registerSessionTurnHandler({
      worker,
      session,
      storage,
      directProvider: provider,
      resolveAgentContext: () => ({
        tools,
        toolPermissionPolicy: new RiskBoundToolPolicy(["read_only"])
      })
    })

    await expect(worker.runOnce()).resolves.toMatchObject({
      status: "failed",
      error: { message: expect.stringContaining("does not match") }
    })
    expect(provider.calls).toBe(0)
  })
})

function requireTestStore(): StorageTestStore {
  if (testStore === undefined) {
    throw new Error("agent worker test store is not initialized")
  }
  return testStore
}

class ApprovalToolPolicy implements ToolPermissionPolicy {
  snapshot() {
    return createToolRuntimeBinding({
      implementationId: "wanex.test.agent-worker.approval-policy",
      implementationRevision: "1"
    })
  }

  async authorize(
    request: ToolPermissionRequest
  ): Promise<ToolPermissionDecision> {
    if (request.descriptor.name !== "approval_tool") {
      return { status: "allow", reason: "test_tool_allowed" }
    }
    return {
      status: "approval_required",
      reason: "test_approval_required",
      presentation: { summary: "Approve the test Tool" }
    }
  }
}

function approvalToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry()
  registry.register({
    name: "approval_tool",
    description: "A mutating Tool used to verify durable approval recovery.",
    inputSchema: { type: "object" },
    risk: "mutating",
    idempotent: true,
    concurrency: "exclusive",
    resultMode: "immediate",
    runtimeBinding: createToolRuntimeBinding({
      implementationId: "wanex.test.agent-worker.approval-tool",
      implementationRevision: "1"
    }),
    async invoke(invocation) {
      return {
        outcome: "succeeded",
        toolCallId: invocation.toolCallId,
        content: jsonToolResultContent({ approved: true })
      }
    }
  })
  return registry
}

async function eventually<T>(read: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + 5_000
  let lastError: unknown
  for (;;) {
    try {
      return await read()
    } catch (error) {
      lastError = error
    }
    if (Date.now() >= deadline) {
      throw lastError
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 5))
  }
}

function registryWithTool(
  name: string,
  revision = "1",
  configuration = "default",
  onInvoke: () => void = () => {}
): ToolRegistry {
  const registry = new ToolRegistry()
  registry.register({
    name,
    description: "Test tool " + name,
    inputSchema: { type: "object" },
    risk: "read_only",
    idempotent: true,
    concurrency: "parallel_safe",
    resultMode: "immediate",
    runtimeBinding: createToolRuntimeBinding({
      implementationId: `wanex.test.agent-worker.${name}`,
      implementationRevision: revision,
      configuration: { configuration }
    }),
    async invoke(invocation) {
      onInvoke()
      return {
        outcome: "succeeded",
        toolCallId: invocation.toolCallId,
        content: jsonToolResultContent({ ok: true })
      }
    }
  })
  return registry
}

function registryWithLargeResult(name: string, characters: number): ToolRegistry {
  const registry = new ToolRegistry()
  registry.register({
    name,
    description: "Returns a deliberately large test result",
    inputSchema: { type: "object" },
    risk: "read_only",
    idempotent: true,
    concurrency: "parallel_safe",
    resultMode: "immediate",
    runtimeBinding: createToolRuntimeBinding({
      implementationId: `wanex.test.agent-worker.${name}`,
      implementationRevision: "1",
      configuration: { characters }
    }),
    async invoke(invocation) {
      return {
        outcome: "succeeded",
        toolCallId: invocation.toolCallId,
        content: jsonToolResultContent({ text: "r".repeat(characters) })
      }
    }
  })
  return registry
}

async function appendCompletedTurn(
  session: WanexSessionCore,
  modelEndpoint: ReturnType<typeof fakeModelEndpoint>,
  request: {
    readonly sessionId: string
    readonly suffix: string
    readonly userText: string
    readonly assistantText: string
    readonly resource?: Awaited<ReturnType<StorageTestStore["ingestResource"]>>
  }
): Promise<void> {
  const resource =
    request.resource === undefined ? undefined : resourceEvidence(request.resource)
  const submitted = await session.submitTurn({
    id: `inp_${request.suffix}`,
    turnId: `turn_${request.suffix}`,
    sessionId: request.sessionId,
    principalId: `principal_${request.suffix}`,
    idempotencyKey: `idem_${request.suffix}`,
    content: [
      {
        type: "text",
        id: `part_${request.suffix}`,
        text: request.userText
      },
      ...(resource === undefined
        ? []
        : [{
            type: "resource" as const,
            id: `resource_${request.suffix}`,
            ...resource
          }])
    ],
    jobId: `job_${request.suffix}`,
    executionBinding: createTurnExecutionBinding({
      modelEndpoint,
      maxOutputTokens: 100,
      ...(resource === undefined ? {} : { resources: [resource] }),
      createdAt: 1
    })
  })
  const workerId = `worker_${request.suffix}`
  const job = await session.claimJob({
    workerId,
    leaseMs: 60_000,
    kinds: ["session.turn"]
  })
  if (job?.leaseToken === undefined) throw new Error("missing seeded Turn lease")
  const started = await session.startTurnAttempt({
    sessionId: request.sessionId,
    turnId: submitted.turn.id,
    inputId: submitted.admission.inputId,
    jobId: job.id,
    workerId,
    leaseToken: job.leaseToken
  })
  const invocation = await session.beginProviderInvocation({
    sessionId: request.sessionId,
    turnId: submitted.turn.id,
    attemptId: started.attempt.id,
    inputId: submitted.admission.inputId,
    jobId: job.id,
    workerId,
    leaseToken: job.leaseToken,
    step: 1,
    invocationNumber: 1,
    requestDigest: `seed-${request.suffix}`
  })
  await session.settleTurn({
    sessionId: request.sessionId,
    turnId: submitted.turn.id,
    attemptId: started.attempt.id,
    inputId: submitted.admission.inputId,
    jobId: job.id,
    workerId,
    leaseToken: job.leaseToken,
    outcome: "succeeded",
    providerInvocationId: invocation.id,
    assistantMessage: [{
      type: "text",
      id: `assistant_${request.suffix}`,
      text: request.assistantText
    }]
  })
}

function resourceEvidence(
  resource: Awaited<ReturnType<StorageTestStore["ingestResource"]>>
) {
  return {
    resourceId: resource.id,
    sha256: resource.sha256,
    sizeBytes: resource.sizeBytes,
    kind: resource.kind,
    ...(resource.mediaType === undefined ? {} : { mediaType: resource.mediaType })
  }
}

class CountingFakeProvider extends FakeProviderAdapter {
  calls = 0
  readonly requests: ProviderRequest[] = []

  override async *stream(request: ProviderRequest) {
    this.calls += 1
    this.requests.push(request)
    yield* super.stream(request)
  }
}
