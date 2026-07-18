import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { afterEach, describe, expect, it } from "vitest"
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
import { createStorageHandle } from "@wanex/storage"
import {
  AllowAllToolsPolicy,
  EchoTool,
  ToolRegistry
} from "@wanex/runtime/tools"
import {
  buildRuntimeHostJobSummary,
  resolveRuntimeHostDiagnostics,
  WanexRuntimeHost
} from "../src/host/index.js"

const serviceBin = join(
  import.meta.dirname,
  "../../../target/debug/wanex-system-service"
)
const expectedSchemaVersion = 8

const tempDirs: string[] = []

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

describe("@wanex/runtime/host", () => {
  it("runs multiple session jobs concurrently through a worker pool", async () => {
    const provider = new ConcurrentProbeProvider()
    const host = await createHost({
      workerCount: 2,
      provider
    })
    await host.submitUserText({
      text: "one",
      sessionId: "ses_host_one"
    })
    await host.submitUserText({
      text: "two",
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

  it("keeps runner exclusivity for jobs targeting the same session", async () => {
    const provider = new ConcurrentProbeProvider()
    const host = await createHost({
      workerCount: 2,
      provider
    })
    await host.submitUserText({
      text: "first",
      sessionId: "ses_host_same"
    })
    await host.submitUserText({
      text: "second",
      sessionId: "ses_host_same"
    })

    const first = await host.runOnce()
    const firstStatuses = first.results.map((item) => item.worker.status).sort()
    expect(firstStatuses).toEqual(["completed", "completed"])
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
    await host.submitUserText({
      text: "fail me",
      sessionId: "ses_host_fail"
    })
    await host.submitUserText({
      text: "succeed",
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
        memoryWorkerCount: 1
      },
      jobs: [
        schedulerJob({
          id: "job_running_stale",
          kind: "session.run",
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
          kind: "session.run",
          state: "pending",
          payload: {
            prompt: "hidden pending prompt"
          }
        }),
        schedulerJob({
          id: "job_ready",
          kind: "session.run",
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
      memoryWorkerCount: 1
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
        kind: "session.run",
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
        kind: "session.run",
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
    await host.submitUserText({
      text: "summary",
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
      memoryWorkerCount: 0
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
    await host.submitUserText({
      text: "durable host context",
      sessionId: "ses_host_ephemeral"
    })
    await host.runOnce()
    const [inputsBefore, messagesBefore, jobsBefore] = await Promise.all([
      host.storage.listSessionInputs({ sessionId: "ses_host_ephemeral" }),
      host.storage.listSessionMessages({ sessionId: "ses_host_ephemeral" }),
      host.storage.listJobs({ kind: "session.run", limit: 20 })
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
      host.storage.listJobs({ kind: "session.run", limit: 20 })
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
    const host = await createHost({
      workerCount: 2,
      fakeResponseText: "host loop response",
      idleIntervalMs: 10
    })
    host.start()
    expect(host.status()).toEqual({
      started: true,
      workerCount: 2,
      memoryWorkerCount: 0
    })
    await host.submitUserText({
      text: "loop",
      sessionId: "ses_host_loop"
    })

    await eventually(async () => {
      const jobs = await host.listJobs({ state: "succeeded" })
      expect(jobs).toHaveLength(1)
    })
    const report = await host.doctor()
    expect(report.schemaVersion).toBe(expectedSchemaVersion)
    await host.stop()
    expect(host.status()).toEqual({
      started: false,
      workerCount: 2,
      memoryWorkerCount: 0
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

  it("reports process-local live health for started worker loops", async () => {
    const host = await createHost({
      workerCount: 1,
      fakeResponseText: "host health response",
      idleIntervalMs: 10,
      memoryCompaction: {
        enabled: true,
        workerCount: 1
      }
    })
    expect(host.getHealthSnapshot({ now: 10 })).toEqual({
      generatedAt: 10,
      started: false,
      workerCount: 1,
      memoryWorkerCount: 1,
      loopCount: 0,
      activeLoopCount: 0,
      stoppedLoopCount: 0,
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

    await eventually(async () => {
      const health = host.getHealthSnapshot({ now: 12 })
      expect(
        health.loops.find((loop) => loop.kind === "agent")?.runCount
      ).toBeGreaterThan(0)
      expect(
        health.loops.find((loop) => loop.kind === "memory")?.runCount
      ).toBeGreaterThan(0)
    })

    await host.submitUserText({
      text: "health",
      sessionId: "ses_host_health"
    })
    await eventually(async () => {
      const health = host.getHealthSnapshot({ now: 13 })
      const completedCount = health.loops.reduce(
        (total, loop) => total + loop.completedCount,
        0
      )
      expect(completedCount).toBeGreaterThan(0)
    })

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
      memoryWorkerCount: 0
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
        memoryWorkerCount: 1
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
    const storeDir = await mkdtemp(join(tmpdir(), "wanex-runtime-host-owned-"))
    tempDirs.push(storeDir)
    const handle = createStorageHandle({
      kind: "local-system-service",
      mode: "persistent",
      storeDir,
      serviceBin
    })

    const host = new WanexRuntimeHost({
      storage: handle.core,
      workerCount: 1,
      fakeResponseText: "injected storage response"
    })
    try {
      await host.submitUserText({
        text: "owned",
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
    } finally {
      await handle.dispose()
    }
  })

  it("disposes host-owned storage idempotently", async () => {
    const host = await createHost({
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
    await host.submitUserText({
      text: "old host request",
      sessionId: "ses_host_context"
    })
    await host.runOnce()
    provider.lastMessages = []
    await host.submitUserText({
      text: "new host request",
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
    await host.submitUserText({
      text: "use echo through host",
      sessionId: "ses_host_tools",
      mode: "to_completion",
      maxSteps: 4
    })

    const result = await host.runOnce()

    expect(result.results[0]?.worker.status).toBe("completed")
    const messages = await host.storage.listSessionMessages({
      sessionId: "ses_host_tools"
    })
    expect(messages.map((message) => message.role)).toEqual([
      "assistant",
      "tool",
      "assistant"
    ])
    expect(messages[1]?.content[0]).toMatchObject({
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
    await host.submitUserText({
      text: "remember this",
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
    await host.submitUserText({
      text: "small",
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
    kind: overrides.kind ?? "session.run",
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
