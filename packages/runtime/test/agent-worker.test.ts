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
  profileToJson,
  type ProviderRequest
} from "../src/provider/index.js"
import { WanexSessionCore } from "../src/sessions/index.js"
import {
  AllowAllToolsPolicy,
  createToolRuntimeBinding,
  RiskBoundToolPolicy,
  ToolRegistry
} from "../src/tools/index.js"
import { fakeProfile } from "./durable-turn-test-fixture.js"

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
        profile: fakeProfile("worker_turn"),
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

  it("executes the immutable admitted provider binding after profile config changes", async () => {
    const storage = requireTestStore()
    const session = new WanexSessionCore({ storage })
    await session.create({ id: "ses_worker_binding", kind: "agent" })
    const admittedProfile = fakeProfile("binding_original")
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
        profile: admittedProfile,
        createdAt: 1
      })
    })
    await storage.putConfig("provider.profile." + admittedProfile.id, profileToJson({
      ...admittedProfile,
      modelId: "model_mutated"
    }))
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
        profile: fakeProfile("worker_context"),
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
    const profile = fakeProfile("worker_tool_revision")
    const provider = new CountingFakeProvider({
      modelId: profile.modelId,
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
        profile,
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
    const profile = fakeProfile("worker_tool_configuration")
    const provider = new CountingFakeProvider({
      modelId: profile.modelId,
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
        profile,
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
    const profile = fakeProfile("worker_tool_permission")
    const provider = new CountingFakeProvider({
      modelId: profile.modelId,
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
        profile,
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
    runtimeBinding: createToolRuntimeBinding({
      implementationId: `wanex.test.agent-worker.${name}`,
      implementationRevision: revision,
      configuration: { configuration }
    }),
    async invoke(invocation) {
      onInvoke()
      return {
        toolCallId: invocation.toolCallId,
        result: { ok: true },
        isError: false
      }
    }
  })
  return registry
}

class CountingFakeProvider extends FakeProviderAdapter {
  calls = 0

  override async *stream(request: ProviderRequest) {
    this.calls += 1
    yield* super.stream(request)
  }
}
