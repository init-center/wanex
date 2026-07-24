import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { DeterministicContextCompiler } from "../src/context/memory/index.js"
import type {
  ProviderAdapter,
  ProviderEvent,
  ProviderRequest,
  ProviderReplayMessage
} from "@wanex/runtime/provider"
import type {
  JsonValue,
  MessagePart,
  SchedulerJobRecord,
  TextMessagePart
} from "@wanex/protocol"
import {
  createStorageHandle,
  type CoreStore,
  type StorageHandle
} from "@wanex/storage"
import {
  AllowAllToolsPolicy,
  createToolRuntimeBinding,
  EchoTool,
  ToolRegistry,
  type ToolDefinition,
  type ToolInvocation
} from "@wanex/runtime/tools"
import {
  buildRuntimeHostJobSummary,
  resolveRuntimeHostDiagnostics,
  WanexRuntimeHost
} from "../src/host/index.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)
const expectedSchemaVersion = 1

const tempDirs: string[] = []
let testStorageHandle: StorageHandle | undefined

beforeEach(async () => {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-runtime-host-"))
  tempDirs.push(storeDir)
  testStorageHandle = createStorageHandle({
    kind: "local-system-service",
    mode: "persistent",
    storeDir,
    serviceBin
  })
  await testStorageHandle.core.doctor()
})

afterEach(async () => {
  await testStorageHandle?.dispose()
  testStorageHandle = undefined
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

describe("@wanex/runtime/host", () => {
  it("actively aborts a blocked provider after durable cancellation", async () => {
    const provider = new AbortAwareBlockingProvider(false)
    const host = await createHost({ provider })
    const submitted = await host.submitUserTurn({
      content: [{ type: "text", text: "cancel blocked provider" }],
      sessionId: "ses_host_active_cancel"
    })
    host.start()
    await provider.started.promise

    const receipt = await host.requestSessionTurnCancel({
      sessionId: submitted.session.id,
      turnId: submitted.turnId,
      inputId: submitted.inputId,
      jobId: submitted.receipt.job.id,
      reason: "user cancelled blocked provider"
    })

    expect(receipt.status).toBe("cancel_requested")
    await provider.aborted.promise
    await eventually(async () => {
      await expect(host.listJobs({ state: "cancelled" })).resolves.toHaveLength(1)
      expect(host.getHealthSnapshot().activeExecutionCount).toBe(0)
    })
    const turns = await host.storage.listSessionTurns({
      sessionId: submitted.session.id
    })
    expect(turns).toMatchObject([{ state: "cancelled" }])
    const invocations = await host.storage.listProviderInvocations({
      turnId: submitted.turnId
    })
    expect(invocations).toMatchObject([{
      state: "failed_before_output",
      outputObserved: false,
      error: { category: "aborted", retryable: false }
    }])
    await host.dispose()
  })

  it("observes durable cancellation written by another process", async () => {
    const provider = new AbortAwareBlockingProvider(false)
    const host = await createHost({ provider })
    const submitted = await host.submitUserTurn({
      content: [{ type: "text", text: "remote cancel blocked provider" }],
      sessionId: "ses_host_remote_cancel"
    })
    host.start()
    await provider.started.promise

    const receipt = await host.storage.requestSessionTurnCancel({
      sessionId: submitted.session.id,
      turnId: submitted.turnId,
      inputId: submitted.inputId,
      jobId: submitted.receipt.job.id,
      reason: "remote process requested cancellation"
    })

    expect(receipt.status).toBe("cancel_requested")
    await provider.aborted.promise
    await eventually(async () => {
      await expect(host.listJobs({ state: "cancelled" })).resolves.toHaveLength(1)
    })
    expect(provider.abortCount).toBe(1)
    await host.dispose()
  })

  it("fails closed when active cancellation follows provider output", async () => {
    const provider = new AbortAwareBlockingProvider(true)
    const host = await createHost({ provider })
    const submitted = await host.submitUserTurn({
      content: [{ type: "text", text: "cancel partial provider" }],
      sessionId: "ses_host_partial_cancel"
    })
    host.start()
    await provider.started.promise

    const receipt = await host.requestSessionTurnCancel({
      sessionId: submitted.session.id,
      turnId: submitted.turnId,
      inputId: submitted.inputId,
      jobId: submitted.receipt.job.id,
      reason: "user cancelled after partial output"
    })

    expect(receipt.status).toBe("cancel_requested")
    await provider.aborted.promise
    await eventually(async () => {
      await expect(host.listJobs({ state: "failed" })).resolves.toHaveLength(1)
      expect(host.getHealthSnapshot().activeExecutionCount).toBe(0)
    })
    const turns = await host.storage.listSessionTurns({
      sessionId: submitted.session.id
    })
    expect(turns).toMatchObject([{ state: "recovery_required" }])
    const invocations = await host.storage.listProviderInvocations({
      turnId: submitted.turnId
    })
    expect(invocations).toMatchObject([{
      state: "ambiguous",
      outputObserved: true
    }])
    await host.dispose()
  })

  it("interrupts only the exact active physical attempt", async () => {
    const provider = new AbortAwareBlockingProvider(false)
    const host = await createHost({ provider })
    const submitted = await host.submitUserTurn({
      content: [{ type: "text", text: "interrupt blocked provider" }],
      sessionId: "ses_host_active_interrupt"
    })
    host.start()
    await provider.started.promise
    const activeTurn = (
      await host.storage.listSessionTurns({ sessionId: submitted.session.id })
    )[0]
    const attemptId = activeTurn?.currentAttemptId
    expect(attemptId).toBeDefined()

    const stale = await host.interruptSessionTurn({
      sessionId: submitted.session.id,
      turnId: submitted.turnId,
      attemptId: "attempt_stale",
      reason: "stale interrupt"
    })
    expect(stale.status).toBe("not_running")
    expect(provider.abortCount).toBe(0)
    expect(host.getHealthSnapshot().activeExecutionCount).toBe(1)

    const accepted = await host.interruptSessionTurn({
      sessionId: submitted.session.id,
      turnId: submitted.turnId,
      attemptId: attemptId!,
      reason: "interrupt exact attempt"
    })
    expect(accepted.status).toBe("interrupt_requested")
    await provider.aborted.promise
    await eventually(async () => {
      await expect(host.listJobs({ state: "cancelled" })).resolves.toHaveLength(1)
    })
    const turns = await host.storage.listSessionTurns({
      sessionId: submitted.session.id
    })
    expect(turns).toMatchObject([{ state: "interrupted" }])
    const controls = await host.storage.listSessionTurnControls({
      sessionId: submitted.session.id,
      turnId: submitted.turnId
    })
    expect(controls).toMatchObject([{
      kind: "interrupt",
      status: "applied",
      attemptId
    }])
    await host.dispose()
  })

  it("keeps the turn lease until an aborted tool finishes cleanup", async () => {
    const provider = new FakeToolProvider()
    const tool = new AbortAwareHostTool()
    const tools = new ToolRegistry()
    tools.register(tool)
    const host = await createHost({
      provider,
      tools,
      toolPermissionPolicy: new AllowAllToolsPolicy()
    })
    const submitted = await host.submitUserTurn({
      content: [{ type: "text", text: "cancel blocked tool" }],
      sessionId: "ses_host_tool_cancel"
    })
    const running = host.runOnce()
    await tool.started.promise

    const receipt = await host.requestSessionTurnCancel({
      sessionId: submitted.session.id,
      turnId: submitted.turnId,
      inputId: submitted.inputId,
      jobId: submitted.receipt.job.id,
      reason: "cancel active tool"
    })
    expect(receipt.status).toBe("cancel_requested")
    await tool.abortObserved.promise
    await expect(host.listJobs({ state: "running" })).resolves.toHaveLength(1)
    expect(host.getHealthSnapshot().activeExecutionCount).toBe(1)

    tool.releaseCleanup.resolve()
    await running
    await expect(host.listJobs({ state: "cancelled" })).resolves.toHaveLength(1)
    expect(host.getHealthSnapshot().activeExecutionCount).toBe(0)
    expect(tool.cleanupComplete).toBe(true)
    const messages = await host.storage.listSessionMessages({
      sessionId: submitted.session.id
    })
    expect(messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "tool"
    ])
    expect(messages[2]?.content).toMatchObject([{
      type: "tool_result",
      toolCallId: "call_host_echo",
      result: { error: "tool_cancelled", cleaned: true },
      isError: true
    }])
    const executions = await host.storage.listToolExecutions({
      turnId: submitted.turnId
    })
    expect(executions).toMatchObject([{
      state: "cancelled",
      isError: true,
      result: { error: "tool_cancelled", cleaned: true }
    }])
    await host.dispose()
  })

  it("waits for provider cleanup on host shutdown without publishing cancellation", async () => {
    const provider = new AbortAwareBlockingProvider(false)
    const host = await createHost({ provider })
    const submitted = await host.submitUserTurn({
      content: [{ type: "text", text: "shutdown blocked provider" }],
      sessionId: "ses_host_shutdown"
    })
    host.start()
    await provider.started.promise

    const stopping = host.stop()
    await provider.aborted.promise
    await stopping

    expect(host.getHealthSnapshot().activeExecutionCount).toBe(0)
    await expect(host.listJobs({ state: "failed" })).resolves.toHaveLength(1)
    const turns = await host.storage.listSessionTurns({
      sessionId: submitted.session.id
    })
    expect(turns).toMatchObject([{ state: "recovery_required" }])
    expect(turns.some((turn) =>
      turn.state === "cancelled" || turn.state === "interrupted"
    )).toBe(false)
    await host.dispose()
  })

  it("hands lease loss to durable recovery instead of ordinary cancellation", async () => {
    const provider = new AbortAwareBlockingProvider(false)
    const handle = requireTestStorageHandle()
    let loseLease = false
    const storage = new Proxy(handle.core, {
      get(target, property) {
        if (property === "heartbeatJob") {
          return async (...args: Parameters<CoreStore["heartbeatJob"]>) =>
            loseLease ? null : await target.heartbeatJob(...args)
        }
        const value = Reflect.get(target, property, target) as unknown
        return typeof value === "function" ? value.bind(target) : value
      }
    }) as CoreStore
    const host = new WanexRuntimeHost({
      storage,
      provider,
      heartbeatIntervalMs: 5
    })
    try {
      const submitted = await host.submitUserTurn({
        content: [{ type: "text", text: "lose worker lease" }],
        sessionId: "ses_host_lease_loss"
      })
      host.start()
      await provider.started.promise
      loseLease = true

      await provider.aborted.promise
      await eventually(async () => {
        expect(host.getHealthSnapshot().activeExecutionCount).toBe(0)
      })
      const turns = await host.storage.listSessionTurns({
        sessionId: submitted.session.id
      })
      expect(turns).toMatchObject([{ state: "recovery_required" }])
      expect(turns.some((turn) =>
        turn.state === "cancelled" || turn.state === "interrupted"
      )).toBe(false)
    } finally {
      await host.dispose()
    }
  })

  it("applies steering after provider output without aborting the provider", async () => {
    const provider = new SteeringProvider()
    const host = await createHost({ provider })
    const submitted = await host.submitUserTurn({
      content: [{ type: "text", text: "initial direction" }],
      sessionId: "ses_host_steer"
    })
    const running = host.runOnce()
    await provider.firstStarted.promise
    const turn = (
      await host.storage.listSessionTurns({ sessionId: submitted.session.id })
    )[0]
    expect(turn?.currentAttemptId).toBeDefined()

    const steer = await host.steerSessionTurn({
      sessionId: submitted.session.id,
      principalId: "steering-user",
      expectedTurnId: submitted.turnId,
      expectedAttemptId: turn!.currentAttemptId!,
      idempotencyKey: "host-steer-current-turn",
      content: [{
        type: "text",
        id: "steer_text",
        text: "adjusted direction"
      }]
    })
    expect(steer.status).toBe("accepted")
    expect(provider.abortCount).toBe(0)
    await expect(host.listJobs({ state: "running" })).resolves.toHaveLength(1)

    provider.releaseFirst.resolve()
    const result = await running
    expect(result.results[0]?.worker.status).toBe("completed")
    const jobs = await host.listJobs({})
    expect(jobs).toHaveLength(1)
    expect(
      jobs[0]?.state,
      JSON.stringify(jobs[0]?.lastError)
    ).toBe("succeeded")
    expect(provider.calls).toBe(2)
    expect(provider.abortCount).toBe(0)
    const messages = await host.storage.listSessionMessages({
      sessionId: submitted.session.id
    })
    expect(messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant"
    ])
    expect(messages.map((message) => textFromParts(message.content))).toEqual([
      "initial direction",
      "response before steer",
      "adjusted direction",
      "response after steer: adjusted direction"
    ])
    expect(new Set(messages.map(
      (message) => message.executionBindingDigest
    )).size).toBe(1)
    await host.dispose()
  })

  it("runs multiple session jobs concurrently through a worker pool", async () => {
    const provider = new ConcurrentProbeProvider()
    const host = await createHost({
      workerCount: 2,
      provider
    })
    await host.submitUserTurn({
      content: [{ type: "text", text: "one" }],
      sessionId: "ses_host_one"
    })
    await host.submitUserTurn({
      content: [{ type: "text", text: "two" }],
      sessionId: "ses_host_two"
    })

    const result = await host.runOnce()

    expect(result.results.map((item) => item.worker.status)).toEqual([
      "completed",
      "completed"
    ])
    expect(provider.maxActive).toBeGreaterThanOrEqual(2)
    await expect(host.listJobs({ state: "succeeded" })).resolves.toHaveLength(2)
    await host.dispose()
  })

  it("keeps one active turn per session while worker slots remain independent", async () => {
    const provider = new ConcurrentProbeProvider()
    const host = await createHost({
      workerCount: 2,
      provider
    })
    await host.submitUserTurn({
      content: [{ type: "text", text: "first" }],
      sessionId: "ses_host_same"
    })
    await host.submitUserTurn({
      content: [{ type: "text", text: "second" }],
      sessionId: "ses_host_same"
    })

    const first = await host.runOnce()
    const firstStatuses = first.results.map((item) => item.worker.status).sort()
    expect(firstStatuses).toEqual(["completed", "idle"])
    await expect(host.listJobs({ state: "succeeded" })).resolves.toHaveLength(1)
    const second = await host.runOnce()
    expect(second.results.map((item) => item.worker.status).sort()).toEqual([
      "completed",
      "idle"
    ])
    await expect(host.listJobs({ state: "succeeded" })).resolves.toHaveLength(2)
    expect(provider.maxActive).toBe(1)
    await host.dispose()
  })

  it("isolates job failures from other workers", async () => {
    const provider = new FailingForTextProvider("fail me")
    const host = await createHost({
      workerCount: 2,
      provider
    })
    await host.submitUserTurn({
      content: [{ type: "text", text: "fail me" }],
      sessionId: "ses_host_fail"
    })
    await host.submitUserTurn({
      content: [{ type: "text", text: "succeed" }],
      sessionId: "ses_host_success"
    })

    const result = await host.runOnce()

    expect(result.results.map((item) => item.worker.status).sort()).toEqual([
      "completed",
      "failed"
    ])
    await expect(host.listJobs({ state: "succeeded" })).resolves.toHaveLength(1)
    await expect(host.listJobs({ state: "failed" })).resolves.toHaveLength(1)
    await host.dispose()
  })

  it("builds runtime-host job summaries without raw payload projection", () => {
    const summary = buildRuntimeHostJobSummary({
      now: 100,
      status: {
        started: true,
        workerCount: 2,
        memoryWorkerCount: 1,
        mediaGenerationWorkerCount: 0
      },
      jobs: [
        schedulerJob({
          id: "job_running_stale",
          kind: "session.turn",
          state: "running",
          leaseOwner: "worker_a",
          leaseExpiresAt: 90,
          payload: {
            prompt: "hidden prompt"
          }
        }),
        schedulerJob({
          id: "job_running_active",
          kind: "memory.compaction",
          state: "running",
          leaseOwner: "worker_b",
          leaseExpiresAt: 140
        }),
        schedulerJob({
          id: "job_retry",
          kind: "plugin.action",
          state: "retry_scheduled",
          attempt: 2
        }),
        schedulerJob({
          id: "job_pending",
          kind: "session.turn",
          state: "pending",
          payload: {
            prompt: "hidden pending prompt"
          }
        }),
        schedulerJob({
          id: "job_ready",
          kind: "session.turn",
          state: "ready",
          payload: {
            prompt: "hidden ready prompt"
          }
        }),
        schedulerJob({
          id: "job_failed",
          kind: "plugin.action",
          state: "failed",
          attempt: 3
        })
      ]
    })

    expect(JSON.stringify(summary)).not.toContain("hidden prompt")
    expect(JSON.stringify(summary)).not.toContain("hidden pending prompt")
    expect(JSON.stringify(summary)).not.toContain("hidden ready prompt")
    expect(summary.host).toEqual({
      started: true,
      workerCount: 2,
      memoryWorkerCount: 1,
      mediaGenerationWorkerCount: 0
    })
    expect(summary.totalJobs).toBe(6)
    expect(summary.stateCounts).toEqual(
      expect.arrayContaining([
        { state: "pending", count: 1 },
        { state: "ready", count: 1 },
        { state: "running", count: 2 },
        { state: "retry_scheduled", count: 1 },
        { state: "failed", count: 1 }
      ])
    )
    expect(summary.backlogByKind).toEqual([
      {
        kind: "session.turn",
        count: 2
      }
    ])
    expect(summary.retryingByKind).toEqual([
      {
        kind: "plugin.action",
        count: 1
      }
    ])
    expect(summary.failedByKind).toEqual([
      {
        kind: "plugin.action",
        count: 1
      }
    ])
    expect(summary.runningLeases).toEqual([
      {
        jobId: "job_running_active",
        kind: "memory.compaction",
        workerId: "worker_b",
        attempt: 1,
        leaseExpiresAt: 140,
        stale: false,
        remainingLeaseMs: 40
      },
      {
        jobId: "job_running_stale",
        kind: "session.turn",
        workerId: "worker_a",
        attempt: 1,
        leaseExpiresAt: 90,
        stale: true,
        remainingLeaseMs: 0
      }
    ])
    expect(summary.staleRunningLeases.map((lease) => lease.jobId)).toEqual([
      "job_running_stale"
    ])
  })

  it("reads runtime-host job summaries from durable scheduler state", async () => {
    const host = await createHost({
      workerCount: 2,
      fakeResponseText: "summary response"
    })
    await host.submitUserTurn({
      content: [{ type: "text", text: "summary" }],
      sessionId: "ses_host_summary"
    })
    await host.runOnce()
    await host.storage.enqueueJob({
      id: "job_host_summary_running",
      kind: "plugin.action",
      principalId: "principal_summary",
      payload: {
        secret: "must not appear in summary"
      }
    })
    const claimed = await host.storage.claimJob({
      workerId: "summary_worker",
      leaseMs: 1_000,
      kinds: ["plugin.action"]
    })
    expect(claimed?.id).toBe("job_host_summary_running")

    const summary = await host.getJobSummary({
      now: Date.now() + 2_000,
      jobLimit: 20
    })

    expect(JSON.stringify(summary)).not.toContain("must not appear")
    expect(summary.host).toEqual({
      started: false,
      workerCount: 2,
      memoryWorkerCount: 0,
      mediaGenerationWorkerCount: 0
    })
    expect(summary.stateCounts).toEqual(
      expect.arrayContaining([
        { state: "succeeded", count: 1 },
        { state: "running", count: 1 }
      ])
    )
    expect(summary.staleRunningLeases).toEqual([
      expect.objectContaining({
        jobId: "job_host_summary_running",
        workerId: "summary_worker",
        stale: true
      })
    ])
    await host.dispose()
  })

  it("runs ephemeral side queries without durable session mutation", async () => {
    const host = await createHost({
      workerCount: 1,
      fakeResponseText: "host ephemeral answer"
    })
    await host.submitUserTurn({
      content: [{ type: "text", text: "durable host context" }],
      sessionId: "ses_host_ephemeral"
    })
    await host.runOnce()
    const [inputsBefore, messagesBefore, jobsBefore] = await Promise.all([
      host.storage.listSessionInputs({ sessionId: "ses_host_ephemeral" }),
      host.storage.listSessionMessages({ sessionId: "ses_host_ephemeral" }),
      host.storage.listJobs({ kind: "session.turn", limit: 20 })
    ])

    const result = await host.runEphemeralQuery({
      sessionId: "ses_host_ephemeral",
      principalId: "principal_host_ephemeral",
      question: [
        {
          type: "text",
          id: "host_ephemeral_question",
          text: "answer aside"
        }
      ],
      toolPolicy: "none",
      memoryPolicy: "exclude",
      persistence: "none"
    })

    const [inputsAfter, messagesAfter, jobsAfter] = await Promise.all([
      host.storage.listSessionInputs({ sessionId: "ses_host_ephemeral" }),
      host.storage.listSessionMessages({ sessionId: "ses_host_ephemeral" }),
      host.storage.listJobs({ kind: "session.turn", limit: 20 })
    ])
    expect(textFromParts(result.output)).toBe("host ephemeral answer")
    expect(result.telemetry).toMatchObject({
      providerId: "fake",
      modelId: "fake-model"
    })
    expect(inputsAfter).toEqual(inputsBefore)
    expect(messagesAfter).toEqual(messagesBefore)
    expect(jobsAfter).toEqual(jobsBefore)
    await host.dispose()
  })

  it("stops worker loops without disposing host-owned storage", async () => {
    const observedStorage = observeRuntimeHostStorage(
      requireTestStorageHandle().core
    )
    const host = await createHost({
      workerCount: 2,
      fakeResponseText: "host loop response",
      idleIntervalMs: 10
    }, observedStorage.storage)
    host.start()
    expect(host.status()).toEqual({
      started: true,
      workerCount: 2,
      memoryWorkerCount: 0,
      mediaGenerationWorkerCount: 0
    })
    await host.submitUserTurn({
      content: [{ type: "text", text: "loop" }],
      sessionId: "ses_host_loop"
    })

    await observedStorage.turnSettled
    await host.stop()
    await expect(host.listJobs({ state: "succeeded" })).resolves.toHaveLength(1)
    const report = await host.doctor()
    expect(report.schemaVersion).toBe(expectedSchemaVersion)
    expect(host.status()).toEqual({
      started: false,
      workerCount: 2,
      memoryWorkerCount: 0,
      mediaGenerationWorkerCount: 0
    })
    await expect(host.doctor()).resolves.toMatchObject({
      schemaVersion: expectedSchemaVersion
    })
    host.start()
    expect(host.status().started).toBe(true)
    await host.dispose()
    await host.dispose()
    expect(() => host.start()).toThrow("runtime host is disposed")
  })

  it("wakes a long-idle background worker after local submission", async () => {
    const provider = new DispatchProbeProvider("host wake response")
    const observedStorage = observeRuntimeHostStorage(
      requireTestStorageHandle().core
    )
    const host = await createHost({
      workerCount: 1,
      provider,
      idleIntervalMs: 10_000
    }, observedStorage.storage)
    host.start()

    try {
      await observedStorage.agentIdleClaim
      await host.submitUserTurn({
        content: [{ type: "text", text: "wake now" }],
        sessionId: "ses_host_wake"
      })
      await provider.started.promise
      await observedStorage.turnSettled
      await host.stop()
      await expect(
        host.listJobs({ kind: "session.turn", state: "succeeded" })
      ).resolves.toHaveLength(1)
    } finally {
      await host.dispose()
    }
  })

  it("reports process-local live health for started worker loops", async () => {
    const observedStorage = observeRuntimeHostStorage(
      requireTestStorageHandle().core
    )
    const host = await createHost({
      workerCount: 1,
      fakeResponseText: "host health response",
      idleIntervalMs: 10,
      memoryCompaction: {
        enabled: true,
        workerCount: 1
      }
    }, observedStorage.storage)
    expect(host.getHealthSnapshot({ now: 10 })).toEqual({
      generatedAt: 10,
      started: false,
      workerCount: 1,
      memoryWorkerCount: 1,
      mediaGenerationWorkerCount: 0,
      loopCount: 0,
      activeLoopCount: 0,
      stoppedLoopCount: 0,
      activeExecutionCount: 0,
      loops: []
    })

    host.start()
    const started = host.getHealthSnapshot({ now: 11 })
    expect(started).toMatchObject({
      generatedAt: 11,
      started: true,
      workerCount: 1,
      memoryWorkerCount: 1,
      loopCount: 2,
      activeLoopCount: 2,
      stoppedLoopCount: 0
    })
    expect(started.loops.map((loop) => loop.kind).sort()).toEqual([
      "agent",
      "memory"
    ])

    await Promise.all([
      observedStorage.agentIdleClaim,
      observedStorage.memoryIdleClaim
    ])
    await host.submitUserTurn({
      content: [{ type: "text", text: "health" }],
      sessionId: "ses_host_health"
    })
    await observedStorage.turnSettled
    await host.stop()
    const stopped = host.getHealthSnapshot({ now: 20 })
    expect(stopped).toMatchObject({
      generatedAt: 20,
      started: false,
      workerCount: 1,
      memoryWorkerCount: 1,
      loopCount: 2,
      activeLoopCount: 0,
      stoppedLoopCount: 2
    })
    expect(stopped.loops.every((loop) => loop.runCount > 0)).toBe(true)
    expect(
      stopped.loops.reduce(
        (total, loop) => total + loop.completedCount,
        0
      )
    ).toBeGreaterThan(0)
    expect(stopped.loops.every((loop) => loop.stopped)).toBe(true)
    await host.dispose()
  })

  it("resolves runtime-host diagnostics with live health only for concrete hosts", async () => {
    const host = await createHost({
      workerCount: 1,
      fakeResponseText: "host diagnostics response"
    })

    const resolved = await resolveRuntimeHostDiagnostics(host, {
      now: 100,
      jobLimit: 10
    })

    expect(resolved.summary.generatedAt).toBe(100)
    expect(resolved.summary.host).toEqual({
      started: false,
      workerCount: 1,
      memoryWorkerCount: 0,
      mediaGenerationWorkerCount: 0
    })
    expect(resolved.health).toMatchObject({
      generatedAt: 100,
      started: false,
      workerCount: 1,
      memoryWorkerCount: 0,
      loopCount: 0
    })

    const summary = buildRuntimeHostJobSummary({
      now: 101,
      status: {
        started: true,
        workerCount: 2,
        memoryWorkerCount: 1,
        mediaGenerationWorkerCount: 0
      },
      jobs: [schedulerJob({ id: "job_materialized" })]
    })
    const materialized = await resolveRuntimeHostDiagnostics(summary, {
      now: 102,
      jobLimit: 10
    })

    expect(materialized).toEqual({
      summary
    })
  })

  it("uses app-owned injected storage without closing it on stop", async () => {
    const handle = requireTestStorageHandle()

    const host = new WanexRuntimeHost({
      storage: handle.core,
      workerCount: 1,
      fakeResponseText: "injected storage response"
    })
    await host.submitUserTurn({
      content: [{ type: "text", text: "owned" }],
      sessionId: "ses_host_owned_storage"
    })
    const result = await host.runOnce()
    expect(result.results[0]?.worker.status).toBe("completed")
    await host.stop()
    await host.stop()
    await host.dispose()
    await host.dispose()
    await expect(handle.core.doctor()).resolves.toMatchObject({
      schemaVersion: expectedSchemaVersion
    })
  })

  it("disposes host-owned storage idempotently", async () => {
    const host = await createOwnedHost({
      workerCount: 1,
      fakeResponseText: "owned storage lifecycle"
    })
    await host.dispose()
    await host.dispose()

    expect(host.status().started).toBe(false)
  })

  it("passes the injected context compiler to hosted agent workers", async () => {
    const provider = new RecordingProvider()
    const host = await createHost({
      workerCount: 1,
      provider,
      contextCompiler: new DeterministicContextCompiler({
        policy: {
          recentUserTurns: 1,
          snipTextOverChars: 20,
          placeholderTextOverChars: 60
        }
      })
    })
    await host.submitUserTurn({
      content: [{ type: "text", text: "old host request" }],
      sessionId: "ses_host_context"
    })
    await host.runOnce()
    provider.lastMessages = []
    await host.submitUserTurn({
      content: [{ type: "text", text: "new host request" }],
      sessionId: "ses_host_context"
    })

    const result = await host.runOnce()

    expect(result.results[0]?.worker.status).toBe("completed")
    const replayText = provider.lastMessages
      .flatMap((message) => message.content)
      .filter((part): part is TextMessagePart => part.type === "text")
      .map((part) => part.text)
      .join("\n")
    expect(replayText).toContain("[compacted")
    expect(replayText).toContain("new host request")
    await host.dispose()
  })

  it("passes the injected tool registry to hosted agent workers", async () => {
    const tools = new ToolRegistry()
    tools.register(new EchoTool())
    const host = await createHost({
      workerCount: 1,
      tools,
      toolPermissionPolicy: new AllowAllToolsPolicy(),
      provider: new FakeToolProvider()
    })
    await host.submitUserTurn({
      content: [{ type: "text", text: "use echo through host" }],
      sessionId: "ses_host_tools",
      maxSteps: 4
    })

    const result = await host.runOnce()

    expect(result.results[0]?.worker.status).toBe("completed")
    const messages = await host.storage.listSessionMessages({
      sessionId: "ses_host_tools"
    })
    expect(messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "tool",
      "assistant"
    ])
    expect(messages[2]?.content[0]).toMatchObject({
      type: "tool_result",
      isError: false
    })
    await host.dispose()
  })

  it("automatically submits and runs memory compaction after successful agent work", async () => {
    const host = await createHost({
      workerCount: 1,
      fakeResponseText: "host memory response ".repeat(80),
      memoryCompaction: {
        enabled: true,
        workerCount: 1,
        waterlineTokens: 1,
        policy: {
          version: "host-memory-v1",
          recentUserTurns: 0,
          snipTextOverChars: 20,
          placeholderTextOverChars: 60
        },
        retention: {
          keepLastSuperseded: 0
        }
      }
    })
    await host.submitUserTurn({
      content: [{ type: "text", text: "remember this" }],
      sessionId: "ses_host_memory"
    })

    const result = await host.runOnce()

    expect(result.results[0]?.worker.status).toBe("completed")
    expect(result.memory?.plans).toHaveLength(1)
    expect(result.memory?.plans[0]).toMatchObject({
      sessionId: "ses_host_memory",
      decision: "submit",
      reason: "above_waterline",
      policyVersion: "host-memory-v1"
    })
    expect(result.memory?.submittedJobs).toHaveLength(1)
    expect(result.memory?.workerResults[0]?.status).toBe("completed")
    await expect(
      host.storage.getActiveContextEpoch({
        sessionId: "ses_host_memory",
        policyVersion: "host-memory-v1"
      })
    ).resolves.toMatchObject({
      state: "active",
      replacementCount: 1
    })
    await expect(host.listJobs({ kind: "memory.compaction" })).resolves.toHaveLength(
      1
    )
    await host.dispose()
  })

  it("skips automatic memory compaction below the configured waterline", async () => {
    const host = await createHost({
      workerCount: 1,
      fakeResponseText: "short response",
      memoryCompaction: {
        enabled: true,
        workerCount: 1,
        waterlineTokens: 1_000_000,
        policy: {
          version: "host-memory-below",
          recentUserTurns: 0,
          snipTextOverChars: 20,
          placeholderTextOverChars: 60
        }
      }
    })
    await host.submitUserTurn({
      content: [{ type: "text", text: "small" }],
      sessionId: "ses_host_memory_skip"
    })

    const result = await host.runOnce()

    expect(result.results[0]?.worker.status).toBe("completed")
    expect(result.memory?.plans).toEqual([
      expect.objectContaining({
        sessionId: "ses_host_memory_skip",
        decision: "skip",
        reason: "below_waterline"
      })
    ])
    expect(result.memory?.submittedJobs).toHaveLength(0)
    expect(result.memory?.workerResults[0]?.status).toBe("idle")
    await expect(
      host.listJobs({ kind: "memory.compaction" })
    ).resolves.toHaveLength(0)
    await host.dispose()
  })
})

class ConcurrentProbeProvider implements ProviderAdapter {
  readonly kind = "fake" as const
  readonly capabilities = { input: ["text"], output: ["text"] } as const
  readonly providerId = "probe"
  readonly modelId = "probe-model"
  active = 0
  maxActive = 0

  async *stream(request: ProviderRequest): AsyncIterable<ProviderEvent> {
    this.active += 1
    this.maxActive = Math.max(this.maxActive, this.active)
    try {
      await delay(50)
      yield* textEvents(`probe: ${userText(request.messages)}`)
    } finally {
      this.active -= 1
    }
  }

  buildReplayMessages(messages: readonly ProviderReplayMessage[]): JsonValue[] {
    return messages.map((message) => ({
      role: message.role,
      content: message.content as unknown as JsonValue
    })) as JsonValue[]
  }
}

class DispatchProbeProvider extends ConcurrentProbeProvider {
  readonly started = deferred<void>()

  constructor(private readonly responseText: string) {
    super()
  }

  override async *stream(
    _request: ProviderRequest
  ): AsyncIterable<ProviderEvent> {
    this.started.resolve()
    yield* textEvents(this.responseText)
  }
}

class AbortAwareBlockingProvider extends ConcurrentProbeProvider {
  readonly started = deferred<void>()
  readonly aborted = deferred<void>()
  abortCount = 0

  constructor(private readonly emitPartialOutput: boolean) {
    super()
  }

  override async *stream(request: ProviderRequest): AsyncIterable<ProviderEvent> {
    if (this.emitPartialOutput) {
      yield {
        type: "text_delta",
        partId: "partial_active_abort",
        delta: "partial"
      }
    }
    this.started.resolve()
    await waitForAbort(request.signal)
    this.abortCount += 1
    this.aborted.resolve()
    yield {
      type: "error",
      error: {
        category: "aborted",
        message: "provider request aborted",
        retryable: false,
        providerId: this.providerId,
        modelId: this.modelId,
        phase: this.emitPartialOutput ? "stream" : "request"
      }
    }
  }
}

class AbortAwareHostTool implements ToolDefinition {
  readonly name = "echo"
  readonly description = "Wait for cancellation and complete controlled cleanup."
  readonly inputSchema = { type: "object", additionalProperties: true } as const
  readonly risk = "external" as const
  readonly idempotent = false
  readonly runtimeBinding = createToolRuntimeBinding({
    implementationId: "wanex.test.runtime-host.abort-aware",
    implementationRevision: "1"
  })
  readonly started = deferred<void>()
  readonly abortObserved = deferred<void>()
  readonly releaseCleanup = deferred<void>()
  cleanupComplete = false

  async invoke(invocation: ToolInvocation) {
    this.started.resolve()
    await waitForAbort(invocation.signal)
    this.abortObserved.resolve()
    await this.releaseCleanup.promise
    this.cleanupComplete = true
    return {
      toolCallId: invocation.toolCallId,
      result: { error: "tool_cancelled", cleaned: true },
      isError: true
    }
  }
}

class SteeringProvider extends ConcurrentProbeProvider {
  readonly firstStarted = deferred<void>()
  readonly releaseFirst = deferred<void>()
  calls = 0
  abortCount = 0

  override async *stream(request: ProviderRequest): AsyncIterable<ProviderEvent> {
    this.calls += 1
    if (this.calls === 1) {
      this.firstStarted.resolve()
      await this.releaseFirst.promise
      if (request.signal?.aborted === true) {
        this.abortCount += 1
      }
      yield* textEvents("response before steer")
      return
    }
    yield* textEvents("response after steer: " + userText(request.messages))
  }
}

class FailingForTextProvider extends ConcurrentProbeProvider {
  constructor(private readonly failingText: string) {
    super()
  }

  override async *stream(request: ProviderRequest): AsyncIterable<ProviderEvent> {
    const text = userText(request.messages)
    await delay(20)
    if (text === this.failingText) {
      yield {
        type: "error",
        error: {
          category: "unknown",
          message: `planned provider failure: ${text}`,
          retryable: false,
          providerId: this.providerId,
          modelId: this.modelId,
          phase: "request"
        }
      }
      return
    }
    yield* textEvents(`ok: ${text}`)
  }
}

class RecordingProvider extends ConcurrentProbeProvider {
  lastMessages: readonly ProviderReplayMessage[] = []

  override async *stream(request: ProviderRequest): AsyncIterable<ProviderEvent> {
    this.lastMessages = request.messages
    yield* textEvents("old host assistant ".repeat(80))
  }
}

class FakeToolProvider extends ConcurrentProbeProvider {
  override async *stream(request: ProviderRequest): AsyncIterable<ProviderEvent> {
    const hasToolResult = request.messages
      .flatMap((message) => message.content)
      .some((part) => part.type === "tool_result")
    if (hasToolResult) {
      yield* textEvents("tool completed through host")
      return
    }
    yield { type: "tool_call_start", index: 0, toolCallId: "call_host_echo" }
    yield {
      type: "tool_call_delta",
      toolCallId: "call_host_echo",
      toolNameDelta: "echo",
      inputJsonDelta: '{"text":"hello from host"}'
    }
    yield { type: "tool_call_end", toolCallId: "call_host_echo" }
    yield { type: "finish", reason: "tool_calls" }
  }
}

async function createHost(
  options: Omit<
    ConstructorParameters<typeof WanexRuntimeHost>[0],
    "storage" | "storageConfig"
  >,
  storage: CoreStore = requireTestStorageHandle().core
): Promise<WanexRuntimeHost> {
  return new WanexRuntimeHost({
    storage,
    ...options
  })
}

async function createOwnedHost(
  options: Omit<
    ConstructorParameters<typeof WanexRuntimeHost>[0],
    "storage" | "storageConfig"
  >
): Promise<WanexRuntimeHost> {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-runtime-host-"))
  tempDirs.push(storeDir)
  return new WanexRuntimeHost({
    storageConfig: {
      kind: "local-system-service",
      mode: "persistent",
      storeDir,
      serviceBin
    },
    ...options
  })
}

function requireTestStorageHandle(): StorageHandle {
  if (testStorageHandle === undefined) {
    throw new Error("runtime host test storage is not initialized")
  }
  return testStorageHandle
}

function observeRuntimeHostStorage(
  storage: CoreStore
): {
  readonly storage: CoreStore
  readonly agentIdleClaim: Promise<void>
  readonly memoryIdleClaim: Promise<void>
  readonly turnSettled: Promise<void>
} {
  const agentIdleClaim = deferred<void>()
  const memoryIdleClaim = deferred<void>()
  const turnSettled = deferred<void>()

  return {
    storage: new Proxy(storage, {
      get(target, property) {
        if (property === "claimJob") {
          return async (
            request: Parameters<CoreStore["claimJob"]>[0]
          ) => {
            const claimed = await target.claimJob(request)
            if (claimed === null) {
              if (request.kinds?.includes("session.turn") === true) {
                agentIdleClaim.resolve()
              }
              if (request.kinds?.includes("memory.compaction") === true) {
                memoryIdleClaim.resolve()
              }
            }
            return claimed
          }
        }
        if (property === "settleSessionTurn") {
          return async (
            request: Parameters<CoreStore["settleSessionTurn"]>[0]
          ) => {
            const receipt = await target.settleSessionTurn(request)
            turnSettled.resolve()
            return receipt
          }
        }
        const value = Reflect.get(target, property, target)
        return typeof value === "function" ? value.bind(target) : value
      }
    }),
    agentIdleClaim: agentIdleClaim.promise,
    memoryIdleClaim: memoryIdleClaim.promise,
    turnSettled: turnSettled.promise
  }
}

function userText(messages: readonly ProviderReplayMessage[]): string {
  return messages
    .flatMap((message) => message.content)
    .filter((part): part is TextMessagePart => part.type === "text")
    .map((part) => part.text)
    .at(-1) ?? ""
}

function* textEvents(text: string): Iterable<ProviderEvent> {
  yield {
    type: "text_delta",
    partId: `text_${text.replaceAll(/\W+/g, "_")}`,
    delta: text
  }
  yield { type: "finish", reason: "stop" }
}

function textFromParts(parts: readonly MessagePart[]): string {
  return parts
    .filter((part): part is TextMessagePart => part.type === "text")
    .map((part) => part.text)
    .join("\n")
}

function schedulerJob(
  overrides: Partial<SchedulerJobRecord> & Pick<SchedulerJobRecord, "id">
): SchedulerJobRecord {
  return {
    id: overrides.id,
    kind: overrides.kind ?? "session.turn",
    state: overrides.state ?? "ready",
    principalId: overrides.principalId ?? "principal",
    payload: overrides.payload ?? {},
    scheduledAt: overrides.scheduledAt ?? 1,
    priority: overrides.priority ?? 0,
    attempt: overrides.attempt ?? 1,
    maxAttempts: overrides.maxAttempts ?? 3,
    retryPolicy: overrides.retryPolicy ?? { strategy: "none" },
    createdAt: overrides.createdAt ?? 1,
    updatedAt: overrides.updatedAt ?? 1,
    ...(overrides.notBefore === undefined
      ? {}
      : { notBefore: overrides.notBefore }),
    ...(overrides.idempotencyKey === undefined
      ? {}
      : { idempotencyKey: overrides.idempotencyKey }),
    ...(overrides.budgetGrantId === undefined
      ? {}
      : { budgetGrantId: overrides.budgetGrantId }),
    ...(overrides.leaseOwner === undefined
      ? {}
      : { leaseOwner: overrides.leaseOwner }),
    ...(overrides.leaseToken === undefined
      ? {}
      : { leaseToken: overrides.leaseToken }),
    ...(overrides.leaseExpiresAt === undefined
      ? {}
      : { leaseExpiresAt: overrides.leaseExpiresAt }),
    ...(overrides.result === undefined ? {} : { result: overrides.result }),
    ...(overrides.lastError === undefined
      ? {}
      : { lastError: overrides.lastError }),
    ...(overrides.finishedAt === undefined
      ? {}
      : { finishedAt: overrides.finishedAt })
  }
}

async function eventually(assertion: () => Promise<void>): Promise<void> {
  const started = Date.now()
  let lastError: unknown
  while (Date.now() - started < 1_000) {
    try {
      await assertion()
      return
    } catch (error) {
      lastError = error
      await delay(20)
    }
  }
  throw lastError
}

function deferred<T>(): {
  readonly promise: Promise<T>
  resolve(value: T): void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

async function waitForAbort(
  signal: ProviderRequest["signal"]
): Promise<void> {
  if (signal === undefined) {
    throw new Error("blocking provider requires an abort signal")
  }
  if (signal.aborted) return
  await new Promise<void>((resolve) => {
    signal.addEventListener("abort", resolve, { once: true })
  })
}
