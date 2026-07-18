import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { DeterministicContextCompiler } from "../src/context/memory/index.js"
import {
  FakeProviderAdapter,
  type ProviderRequest,
  type ProviderReplayMessage
} from "@wanex/runtime/provider"
import type { RuntimeAbortSignal } from "@wanex/protocol"
import { writeProviderProfile } from "@wanex/runtime/provider"
import { WanexSessionCore } from "../src/sessions/index.js"
import { createStorageTestStore, type StorageTestStore } from "@wanex/storage/testing"
import {
  AllowAllToolsPolicy,
  EchoTool,
  ToolRegistry
} from "@wanex/runtime/tools"
import { WanexWorker } from "../src/jobs/index.js"
import {
  registerProfileSessionRunHandler,
  registerSessionRunHandler
} from "../src/execution/worker/index.js"

const serviceBin = join(
  import.meta.dirname,
  "../../../target/debug/wanex-system-service"
)

const tempDirs: string[] = []

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

describe("Runtime agent worker", () => {
  it("runs a session.run job and persists the assistant message", async () => {
    const session = await createSessionCore()
    const created = await session.create({ id: "ses_agent_worker_once" })
    await session.admit({
      id: "inp_agent_worker_once",
      sessionId: created.id,
      principalId: "user_agent_worker",
      idempotencyKey: "idem_agent_worker_once",
      content: [{ type: "text", id: "part_user", text: "hello" }]
    })
    await session.enqueueJob({
      id: "job_agent_worker_once",
      kind: "session.run",
      principalId: "user_agent_worker",
      payload: { sessionId: created.id }
    })

    const worker = new WanexWorker({
      session,
      workerId: "worker_agent_once",
      leaseMs: 60_000
    })
    registerSessionRunHandler({
      worker,
      session,
      provider: new FakeProviderAdapter({ responseText: "hello from worker" }),
      runnerId: "runner_agent_worker_once",
      leaseMs: 60_000
    })

    const result = await worker.runOnce()

    expect(result.status).toBe("completed")
    if (result.status !== "completed") {
      throw new Error("expected completed result")
    }
    expect(result.job.result).toMatchObject({
      sessionId: created.id,
      status: "completed",
      mode: "once",
      inputId: "inp_agent_worker_once"
    })
    expect(result.job.lastError).toBeUndefined()
    const messages = await session.listMessages({ sessionId: created.id })
    expect(messages[0]?.content).toEqual([
      {
        type: "text",
        id: "text_0",
        text: "hello from worker"
      }
    ])
  })

  it("passes the worker job signal into provider completions", async () => {
    const session = await createSessionCore()
    const created = await session.create({ id: "ses_agent_worker_signal" })
    await session.admit({
      id: "inp_agent_worker_signal",
      sessionId: created.id,
      principalId: "user_agent_worker",
      idempotencyKey: "idem_agent_worker_signal",
      content: [{ type: "text", id: "part_user", text: "signal" }]
    })
    await session.enqueueJob({
      id: "job_agent_worker_signal",
      kind: "session.run",
      principalId: "user_agent_worker",
      payload: { sessionId: created.id }
    })

    const worker = new WanexWorker({
      session,
      workerId: "worker_agent_signal",
      leaseMs: 60_000
    })
    const provider = new RecordingProvider()
    registerSessionRunHandler({
      worker,
      session,
      provider,
      runnerId: "runner_agent_worker_signal",
      leaseMs: 60_000
    })

    const result = await worker.runOnce()

    expect(result.status).toBe("completed")
    expect(provider.lastSignal).toBeDefined()
    expect(provider.lastSignal?.aborted).toBe(false)
  })

  it("runs a job created by submitRun", async () => {
    const session = await createSessionCore()
    const created = await session.create({ id: "ses_agent_worker_submit" })
    const submitted = await session.submitRun({
      id: "inp_agent_worker_submit",
      sessionId: created.id,
      principalId: "user_agent_worker",
      idempotencyKey: "idem_agent_worker_submit",
      content: [{ type: "text", id: "part_user", text: "submitted" }],
      providerProfileId: "unused-by-direct-handler"
    })
    expect(submitted.job.kind).toBe("session.run")
    expect(submitted.job.payload).toMatchObject({
      providerProfileId: "unused-by-direct-handler"
    })

    const worker = new WanexWorker({
      session,
      workerId: "worker_agent_submit",
      leaseMs: 60_000
    })
    registerSessionRunHandler({
      worker,
      session,
      provider: new FakeProviderAdapter({
        responseText: "submitted response"
      }),
      runnerId: "runner_agent_worker_submit",
      leaseMs: 60_000
    })

    const result = await worker.runOnce()

    expect(result.status).toBe("completed")
    const messages = await session.listMessages({ sessionId: created.id })
    expect(messages[0]?.content).toEqual([
      {
        type: "text",
        id: "text_0",
        text: "submitted response"
      }
    ])
  })

  it("resolves provider profiles for session.run jobs", async () => {
    const { session, storage } = await createSessionCoreWithStorage()
    await writeProviderProfile(storage, {
      id: "fake-profile",
      kind: "fake",
      providerId: "fake",
      modelId: "fake-model"
    })
    const created = await session.create({ id: "ses_agent_worker_profile" })
    await session.admit({
      id: "inp_agent_worker_profile",
      sessionId: created.id,
      principalId: "user_agent_worker",
      idempotencyKey: "idem_agent_worker_profile",
      content: [{ type: "text", id: "part_user", text: "profile" }]
    })
    await session.enqueueJob({
      id: "job_agent_worker_profile",
      kind: "session.run",
      principalId: "user_agent_worker",
      payload: {
        sessionId: created.id,
        providerProfileId: "fake-profile"
      }
    })

    const worker = new WanexWorker({
      session,
      workerId: "worker_agent_profile",
      leaseMs: 60_000
    })
    registerProfileSessionRunHandler({
      worker,
      session,
      storage,
      runnerId: "runner_agent_worker_profile",
      leaseMs: 60_000
    })

    const result = await worker.runOnce()

    expect(result.status).toBe("completed")
    const messages = await session.listMessages({ sessionId: created.id })
    expect(messages[0]?.content).toEqual([
      {
        type: "text",
        id: "text_0",
        text: "Fake response from fake-model"
      }
    ])
  })

  it("runs a to_completion session.run job with tools", async () => {
    const session = await createSessionCore()
    const created = await session.create({ id: "ses_agent_worker_tools" })
    const grant = await session.reserveBudget({
      scope: { kind: "turn", ownerId: "inp_agent_worker_tools", windowKind: "run" },
      limit: { toolCalls: 1 },
      requested: { toolCalls: 1 },
      principalId: "user_agent_worker",
      reason: "agent tool loop",
      idempotencyKey: "budget_agent_worker_tools"
    })
    await session.admit({
      id: "inp_agent_worker_tools",
      sessionId: created.id,
      principalId: "user_agent_worker",
      idempotencyKey: "idem_agent_worker_tools",
      content: [{ type: "text", id: "part_user", text: "use echo" }]
    })
    await session.enqueueJob({
      id: "job_agent_worker_tools",
      kind: "session.run",
      principalId: "user_agent_worker",
      payload: {
        sessionId: created.id,
        mode: "to_completion",
        maxSteps: 4
      },
      budgetGrantId: grant.id
    })

    const tools = new ToolRegistry()
    tools.register(new EchoTool())
    const worker = new WanexWorker({
      session,
      workerId: "worker_agent_tools",
      leaseMs: 60_000
    })
    registerSessionRunHandler({
      worker,
      session,
      provider: new FakeProviderAdapter({
        responseText: "tool loop done",
        toolName: "echo"
      }),
      tools,
      toolPermissionPolicy: new AllowAllToolsPolicy(),
      runnerId: "runner_agent_worker_tools",
      leaseMs: 60_000
    })

    const result = await worker.runOnce()

    expect(result.status).toBe("completed")
    if (result.status !== "completed") {
      throw new Error("expected completed result")
    }
    expect(result.job.result).toMatchObject({
      sessionId: created.id,
      status: "completed",
      mode: "to_completion",
      steps: 2
    })
    expect(result.job.lastError).toBeUndefined()
    await expect(session.getBudgetScope(grant.scopeId)).resolves.toMatchObject({
      usage: { toolCalls: 1 }
    })
    await expect(session.listBudgetGrants(grant.scopeId)).resolves.toMatchObject([
      { id: grant.id, state: "committed", committed: { toolCalls: 1 } }
    ])
    const messages = await session.listMessages({ sessionId: created.id })
    expect(messages.map((message) => message.role)).toEqual([
      "assistant",
      "tool",
      "assistant"
    ])
  })

  it("fails the scheduler job when session.run payload is invalid", async () => {
    const session = await createSessionCore()
    await session.enqueueJob({
      id: "job_agent_worker_invalid",
      kind: "session.run",
      principalId: "user_agent_worker",
      payload: {}
    })
    const worker = new WanexWorker({
      session,
      workerId: "worker_agent_invalid",
      leaseMs: 60_000
    })
    registerSessionRunHandler({
      worker,
      session,
      provider: new FakeProviderAdapter({ responseText: "unused" }),
      runnerId: "runner_agent_worker_invalid",
      leaseMs: 60_000
    })

    const result = await worker.runOnce()

    expect(result.status).toBe("failed")
    if (result.status !== "failed") {
      throw new Error("expected failed result")
    }
    expect(result.job?.state).toBe("failed")
    expect(result.job?.result).toBeUndefined()
    expect(result.error.message).toContain("session.run.sessionId")
  })

  it("uses the injected context compiler for session.run replay", async () => {
    const session = await createSessionCore()
    await seedOldTurn({
      session,
      sessionId: "ses_agent_worker_context",
      oldInputId: "inp_agent_worker_context_old",
      oldAssistantText: "old worker context ".repeat(80)
    })
    await session.submitRun({
      id: "inp_agent_worker_context_new",
      sessionId: "ses_agent_worker_context",
      principalId: "user_agent_worker",
      idempotencyKey: "idem_agent_worker_context_new",
      content: [{ type: "text", id: "part_new_user", text: "new worker request" }]
    })
    const worker = new WanexWorker({
      session,
      workerId: "worker_agent_context",
      leaseMs: 60_000
    })
    const provider = new RecordingProvider()
    registerSessionRunHandler({
      worker,
      session,
      provider,
      contextCompiler: new DeterministicContextCompiler({
        policy: {
          recentUserTurns: 1,
          snipTextOverChars: 20,
          placeholderTextOverChars: 60
        }
      }),
      runnerId: "runner_agent_worker_context",
      leaseMs: 60_000
    })

    const result = await worker.runOnce()

    expect(result.status).toBe("completed")
    const replayText = provider.lastMessages
      .flatMap((message) => message.content)
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n")
    expect(replayText).toContain("[compacted")
    expect(replayText).toContain("new worker request")
  })

  it("completes session.run jobs with a cancelled receipt when interrupted at a safe point", async () => {
    const { session } = await createInterruptingSessionCore({
      reason: "worker user stop"
    })
    const created = await session.create({ id: "ses_agent_worker_interrupt" })
    await session.admit({
      id: "inp_agent_worker_interrupt",
      sessionId: created.id,
      principalId: "user_agent_worker",
      idempotencyKey: "idem_agent_worker_interrupt",
      content: [{ type: "text", id: "part_user", text: "cancel in worker" }]
    })
    await session.enqueueJob({
      id: "job_agent_worker_interrupt",
      kind: "session.run",
      principalId: "user_agent_worker",
      payload: { sessionId: created.id }
    })

    const worker = new WanexWorker({
      session,
      workerId: "worker_agent_interrupt",
      leaseMs: 60_000
    })
    const provider = new RecordingProvider()
    registerSessionRunHandler({
      worker,
      session,
      provider,
      runnerId: "runner_agent_worker_interrupt",
      leaseMs: 60_000
    })

    const result = await worker.runOnce()

    expect(result.status).toBe("completed")
    if (result.status !== "completed") {
      throw new Error("expected completed result")
    }
    expect(result.job.state).toBe("succeeded")
    expect(result.job.result).toMatchObject({
      sessionId: created.id,
      status: "cancelled",
      mode: "once",
      inputId: "inp_agent_worker_interrupt",
      reason: "worker user stop"
    })
    expect(result.job.lastError).toBeUndefined()
    expect(provider.calls).toBe(0)
    await expect(session.listMessages({ sessionId: created.id })).resolves.toEqual([])
    const inputs = await session.listInputs({ sessionId: created.id })
    expect(inputs[0]?.status).toBe("cancelled")
  })
})

async function createSessionCore(): Promise<WanexSessionCore> {
  return (await createSessionCoreWithStorage()).session
}

async function createSessionCoreWithStorage(): Promise<{
  readonly session: WanexSessionCore
  readonly storage: StorageTestStore
}> {
  const storage = await createTestStore()
  return {
    session: new WanexSessionCore({ storage }),
    storage
  }
}

async function createInterruptingSessionCore(options: {
  readonly reason: string
}): Promise<{
  readonly session: WanexSessionCore
  readonly storage: StorageTestStore
}> {
  const storage = await createTestStore()
  return {
    session: new InterruptAfterClaimSessionCore({
      storage,
      reason: options.reason
    }),
    storage
  }
}

async function createTestStore(): Promise<StorageTestStore> {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-agent-worker-"))
  tempDirs.push(storeDir)
  return createStorageTestStore({ kind: "local-system-service", mode: "oneshot",
    storeDir,
    serviceBin
  })
}

async function seedOldTurn(request: {
  readonly session: WanexSessionCore
  readonly sessionId: string
  readonly oldInputId: string
  readonly oldAssistantText: string
}): Promise<void> {
  await request.session.create({ id: request.sessionId, kind: "agent" })
  await request.session.submitRun({
    id: request.oldInputId,
    sessionId: request.sessionId,
    principalId: "user_agent_worker",
    idempotencyKey: `idem_${request.oldInputId}`,
    content: [{ type: "text", id: "part_old_user", text: "old worker request" }]
  })
  const firstWorker = new WanexWorker({
    session: request.session,
    workerId: `worker_${request.oldInputId}`,
    leaseMs: 60_000
  })
  registerSessionRunHandler({
    worker: firstWorker,
    session: request.session,
    provider: new FakeProviderAdapter({
      responseText: request.oldAssistantText
    }),
    runnerId: `runner_${request.oldInputId}`,
    leaseMs: 60_000
  })
  const result = await firstWorker.runOnce()
  if (result.status !== "completed") {
    throw new Error(`failed to seed old turn: ${request.oldInputId}`)
  }
}

class RecordingProvider extends FakeProviderAdapter {
  lastMessages: readonly ProviderReplayMessage[] = []
  lastSignal: RuntimeAbortSignal | undefined
  calls = 0

  constructor() {
    super({ responseText: "recording response" })
  }

  override async *stream(request: ProviderRequest) {
    this.calls += 1
    this.lastSignal = request.signal
    this.lastMessages = request.messages
    yield* super.stream(request)
  }
}

class InterruptAfterClaimSessionCore extends WanexSessionCore {
  private readonly reason: string
  private interrupted = false

  constructor(options: {
    readonly storage: StorageTestStore
    readonly reason: string
  }) {
    super({ storage: options.storage })
    this.reason = options.reason
  }

  override async claimRunner(
    request: Parameters<WanexSessionCore["claimRunner"]>[0]
  ): ReturnType<WanexSessionCore["claimRunner"]> {
    const claim = await super.claimRunner(request)
    if (claim !== null && !this.interrupted) {
      this.interrupted = true
      await super.interruptRun({
        sessionId: request.sessionId,
        runId: claim.runId,
        reason: this.reason,
        principalId: "user_agent_worker",
        idempotencyKey: `interrupt:${claim.runId}`
      })
    }
    return claim
  }
}
