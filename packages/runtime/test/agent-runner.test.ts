import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { DeterministicContextCompiler } from "../src/context/memory/index.js"
import { FakeProviderAdapter } from "@wanex/runtime/provider"
import type {
  ProviderReplayMessage,
  ProviderRequest
} from "@wanex/runtime/provider"
import type { RuntimeAbortSignal } from "@wanex/protocol"
import { WanexSessionCore } from "../src/sessions/index.js"
import { createStorageTestStore, type StorageTestStore } from "@wanex/storage/testing"
import {
  AllowAllToolsPolicy,
  EchoTool,
  ToolRegistry,
  type ToolDefinition,
  type ToolExecutionResult,
  type ToolInvocation
} from "@wanex/runtime/tools"
import { runEphemeralSideQuery, WanexAgentRunner } from "../src/execution/core/index.js"

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

describe("Runtime agent runner", () => {
  it("claims admitted input, calls provider, and persists assistant message", async () => {
    const session = await createSessionCore()
    const created = await session.create({ id: "ses_agent_1" })
    await session.admit({
      id: "inp_agent_1",
      sessionId: created.id,
      principalId: "user_agent",
      idempotencyKey: "idem_agent_1",
      content: [{ type: "text", id: "part_user", text: "hello" }]
    })

    const runner = new WanexAgentRunner({
      session,
      provider: new FakeProviderAdapter({
        responseText: "hello from fake provider"
      }),
      runnerId: "runner_agent",
      leaseMs: 60_000
    })

    const result = await runner.runOnce({ sessionId: created.id })

    expect(result.status).toBe("completed")
    if (result.status !== "completed") {
      throw new Error("expected completed result")
    }
    expect(result.inputId).toBe("inp_agent_1")

    const inputs = await session.listInputs({ sessionId: created.id })
    expect(inputs[0]?.status).toBe("completed")

    const messages = await session.listMessages({ sessionId: created.id })
    expect(messages).toHaveLength(1)
    expect(messages[0]?.content).toEqual([
      {
        type: "text",
        id: "text_0",
        text: "hello from fake provider"
      }
    ])
  })

  it("returns idle when no admitted input is available", async () => {
    const session = await createSessionCore()
    const created = await session.create({ id: "ses_agent_idle" })
    const runner = new WanexAgentRunner({
      session,
      provider: new FakeProviderAdapter({
        responseText: "unused"
      }),
      runnerId: "runner_idle",
      leaseMs: 60_000
    })

    await expect(runner.runOnce({ sessionId: created.id })).resolves.toEqual({
      status: "idle",
      sessionId: created.id
    })
  })

  it("persists assistant tool calls, executes tools, and completes with tool results", async () => {
    const session = await createSessionCore()
    const created = await session.create({ id: "ses_agent_tool" })
    await session.admit({
      id: "inp_agent_tool",
      sessionId: created.id,
      principalId: "user_agent",
      idempotencyKey: "idem_agent_tool",
      content: [{ type: "text", id: "part_user", text: "use echo" }]
    })

    const tools = new ToolRegistry()
    tools.register(new EchoTool())
    const runner = new WanexAgentRunner({
      session,
      provider: new FakeProviderAdapter({
        responseText: "tool done",
        toolName: "echo"
      }),
      tools,
      toolPermissionPolicy: new AllowAllToolsPolicy(),
      runnerId: "runner_tool",
      leaseMs: 60_000
    })

    const result = await runner.runToCompletion({
      sessionId: created.id,
      maxSteps: 4
    })

    expect(result.status).toBe("completed")
    if (result.status !== "completed") {
      throw new Error("expected completed result")
    }
    expect(result.steps).toBe(2)

    const messages = await session.listMessages({ sessionId: created.id })
    expect(messages.map((message) => message.role)).toEqual([
      "assistant",
      "tool",
      "assistant"
    ])
    expect(messages[0]?.content[0]?.type).toBe("tool_call")
    expect(messages[1]?.content[0]).toMatchObject({
      type: "tool_result",
      toolCallId: "call_fake_0",
      isError: false
    })
    expect(messages[2]?.content).toEqual([
      {
        type: "text",
        id: "text_0",
        text: "tool done"
      }
    ])
  })

  it("runs provider tool calls concurrently, durably, and replays in provider order", async () => {
    const session = await createSessionCore()
    const created = await session.create({ id: "ses_agent_parallel_tools" })
    await session.admit({
      id: "inp_agent_parallel_tools",
      sessionId: created.id,
      principalId: "principal_parallel_tools",
      idempotencyKey: "idem_agent_parallel_tools",
      content: [{ type: "text", id: "part_user", text: "run both tools" }]
    })

    const probe = new ToolConcurrencyProbe()
    const tools = new ToolRegistry()
    tools.register(new DelayedProbeTool("slow", 250, probe, false))
    tools.register(new DelayedProbeTool("fast", 10, probe, true))
    let statesBeforeContinuation: string[] = []
    const provider = new ParallelToolProvider(async () => {
      statesBeforeContinuation = (await session.listToolExecutions())
        .map((execution) => execution.state)
        .sort()
    })
    const runner = new WanexAgentRunner({
      session,
      provider,
      tools,
      toolPermissionPolicy: new AllowAllToolsPolicy(),
      toolMaxConcurrency: 2,
      runnerId: "runner_parallel_tools",
      leaseMs: 60_000
    })

    await expect(runner.runToCompletion({
      sessionId: created.id,
      maxSteps: 4
    })).resolves.toMatchObject({ status: "completed", steps: 2 })

    expect(provider.firstRequest?.tools?.map((tool) => tool.name)).toEqual([
      "fast",
      "slow"
    ])
    expect(provider.firstRequest).toMatchObject({
      toolChoice: "auto",
      parallelToolCalls: true
    })
    expect(probe.maxActive).toBe(2)
    expect(probe.completionOrder).toEqual(["fast", "slow"])
    expect(provider.replayedToolCallIds).toEqual(["call_slow", "call_fast"])
    expect(statesBeforeContinuation).toEqual(["failed", "succeeded"])

    const executions = await session.listToolExecutions()
    expect(executions).toHaveLength(2)
    expect(executions.map((execution) => ({
      toolCallId: execution.toolCallId,
      state: execution.state,
      principalId: execution.principalId
    })).sort((left, right) => left.toolCallId.localeCompare(right.toolCallId))).toEqual([
      {
        toolCallId: "call_fast",
        state: "failed",
        principalId: "principal_parallel_tools"
      },
      {
        toolCallId: "call_slow",
        state: "succeeded",
        principalId: "principal_parallel_tools"
      }
    ])
  })

  it("marks claimed input failed when tool calls cannot be handled", async () => {
    const session = await createSessionCore()
    const created = await session.create({ id: "ses_agent_fail" })
    await session.admit({
      id: "inp_agent_fail",
      sessionId: created.id,
      principalId: "user_agent",
      idempotencyKey: "idem_agent_fail",
      content: [{ type: "text", id: "part_user", text: "use unavailable tool" }]
    })

    const runner = new WanexAgentRunner({
      session,
      provider: new FakeProviderAdapter({
        responseText: "unused",
        toolName: "echo"
      }),
      runnerId: "runner_fail",
      leaseMs: 60_000
    })

    await expect(
      runner.runToCompletion({ sessionId: created.id, maxSteps: 4 })
    ).rejects.toThrow("tool calls require a tool registry")

    const inputs = await session.listInputs({ sessionId: created.id })
    expect(inputs[0]?.status).toBe("failed")

    const nextRunner = new WanexAgentRunner({
      session,
      provider: new FakeProviderAdapter({
        responseText: "unused"
      }),
      runnerId: "runner_after_fail",
      leaseMs: 60_000
    })
    await expect(nextRunner.runOnce({ sessionId: created.id })).resolves.toEqual({
      status: "idle",
      sessionId: created.id
    })
  })

  it("fails the claimed run when provider work exceeds timeoutMs", async () => {
    const session = await createSessionCore()
    const created = await session.create({ id: "ses_agent_timeout" })
    await session.admit({
      id: "inp_agent_timeout",
      sessionId: created.id,
      principalId: "user_agent",
      idempotencyKey: "idem_agent_timeout",
      content: [{ type: "text", id: "part_user", text: "slow" }]
    })

    const provider = new SlowProviderAdapter(50)
    const runner = new WanexAgentRunner({
      session,
      provider,
      runnerId: "runner_timeout",
      leaseMs: 60_000,
      timeoutMs: 5
    })

    await expect(runner.runOnce({ sessionId: created.id })).rejects.toMatchObject({
      detail: {
        category: "timeout",
        retryable: true,
        outputObserved: false
      }
    })
    expect(provider.lastSignal?.aborted).toBe(true)
    const inputs = await session.listInputs({ sessionId: created.id })
    expect(inputs[0]?.status).toBe("failed")
  })

  it("records streamed provider token usage into the run budget grant", async () => {
    const session = await createSessionCore()
    const created = await session.create({ id: "ses_agent_provider_budget" })
    await session.admit({
      id: "inp_agent_provider_budget",
      sessionId: created.id,
      principalId: "user_agent",
      idempotencyKey: "idem_agent_provider_budget",
      content: [{ type: "text", id: "part_user", text: "meter this" }]
    })
    const grant = await session.reserveBudget({
      scope: { kind: "turn", ownerId: "inp_agent_provider_budget", windowKind: "run" },
      limit: { tokens: 7 },
      requested: { tokens: 7 },
      principalId: "user_agent",
      reason: "provider usage test",
      idempotencyKey: "budget_agent_provider"
    })
    const runner = new WanexAgentRunner({
      session,
      provider: new UsageProvider(),
      runnerId: "runner_provider_budget",
      leaseMs: 60_000
    })

    await expect(runner.runOnce({
      sessionId: created.id,
      budgetGrantId: grant.id
    })).resolves.toMatchObject({ status: "completed" })
    await session.commitBudget({ grantId: grant.id })
    await expect(session.getBudgetScope(grant.scopeId)).resolves.toMatchObject({
      usage: { tokens: 7 }
    })
  })

  it("passes abort signals to provider completions", async () => {
    const session = await createSessionCore()
    const created = await session.create({ id: "ses_agent_provider_signal" })
    await session.admit({
      id: "inp_agent_provider_signal",
      sessionId: created.id,
      principalId: "user_agent",
      idempotencyKey: "idem_agent_provider_signal",
      content: [{ type: "text", id: "part_user", text: "signal" }]
    })

    const controller = new AbortController()
    const provider = new RecordingProvider()
    const runner = new WanexAgentRunner({
      session,
      provider,
      runnerId: "runner_provider_signal",
      leaseMs: 60_000
    })

    await runner.runOnce({
      sessionId: created.id,
      signal: controller.signal
    })

    expect(provider.lastSignal).toBe(controller.signal)
  })

  it("does not claim input when a run starts aborted", async () => {
    const session = await createSessionCore()
    const created = await session.create({ id: "ses_agent_pre_aborted" })
    await session.admit({
      id: "inp_agent_pre_aborted",
      sessionId: created.id,
      principalId: "user_agent",
      idempotencyKey: "idem_agent_pre_aborted",
      content: [{ type: "text", id: "part_user", text: "abort" }]
    })

    const controller = new AbortController()
    controller.abort()
    const provider = new RecordingProvider()
    const runner = new WanexAgentRunner({
      session,
      provider,
      runnerId: "runner_pre_aborted",
      leaseMs: 60_000
    })

    await expect(
      runner.runOnce({
        sessionId: created.id,
        signal: controller.signal
      })
    ).rejects.toThrow("agent run aborted")

    expect(provider.calls).toBe(0)
    const inputs = await session.listInputs({ sessionId: created.id })
    expect(inputs[0]?.status).toBe("admitted")
  })

  it("passes abort signals to tool invocations", async () => {
    const session = await createSessionCore()
    const created = await session.create({ id: "ses_agent_tool_signal" })
    await session.admit({
      id: "inp_agent_tool_signal",
      sessionId: created.id,
      principalId: "user_agent",
      idempotencyKey: "idem_agent_tool_signal",
      content: [{ type: "text", id: "part_user", text: "use tool" }]
    })

    const tools = new ToolRegistry()
    const tool = new RecordingTool()
    tools.register(tool)
    const controller = new AbortController()
    const runner = new WanexAgentRunner({
      session,
      provider: new FakeProviderAdapter({
        responseText: "tool signal done",
        toolName: "record"
      }),
      tools,
      toolPermissionPolicy: new AllowAllToolsPolicy(),
      runnerId: "runner_tool_signal",
      leaseMs: 60_000
    })

    await runner.runToCompletion({
      sessionId: created.id,
      maxSteps: 4,
      signal: controller.signal
    })

    expect(tool.lastSignal).toBe(controller.signal)
  })

  it("does not complete a run after its lease is cancelled", async () => {
    const session = await createSessionCore()
    const created = await session.create({ id: "ses_agent_cancel" })
    await session.admit({
      id: "inp_agent_cancel",
      sessionId: created.id,
      principalId: "user_agent",
      idempotencyKey: "idem_agent_cancel",
      content: [{ type: "text", id: "part_user", text: "cancel me" }]
    })

    const claim = await session.claimRunner({
      sessionId: created.id,
      runnerId: "runner_cancel",
      leaseMs: 60_000
    })
    expect(claim).not.toBeNull()
    await expect(
      session.cancelRun({
        sessionId: created.id,
        runId: claim!.runId,
        inputId: claim!.inputId,
        reason: "user stop"
      })
    ).resolves.toBe(true)

    await expect(
      session.completeRun({
        sessionId: created.id,
        runId: claim!.runId,
        inputId: claim!.inputId,
        runnerId: claim!.runnerId,
        leaseToken: claim!.leaseToken,
        assistantMessage: [{ type: "text", id: "late", text: "late" }]
      })
    ).resolves.toBe(false)
    const inputs = await session.listInputs({ sessionId: created.id })
    expect(inputs[0]?.status).toBe("cancelled")
  })

  it("returns cancelled without calling the provider when interrupted before the provider safe point", async () => {
    const session = await createInterruptingSessionCore({
      reason: "user stopped before provider"
    })
    const created = await session.create({ id: "ses_agent_interrupt_pre" })
    await session.admit({
      id: "inp_agent_interrupt_pre",
      sessionId: created.id,
      principalId: "user_agent",
      idempotencyKey: "idem_agent_interrupt_pre",
      content: [{ type: "text", id: "part_user", text: "cancel before model" }]
    })

    const provider = new RecordingProvider()
    const runner = new WanexAgentRunner({
      session,
      provider,
      runnerId: "runner_interrupt_pre",
      leaseMs: 60_000
    })

    const result = await runner.runOnce({ sessionId: created.id })

    expect(result).toMatchObject({
      status: "cancelled",
      sessionId: created.id,
      inputId: "inp_agent_interrupt_pre",
      reason: "user stopped before provider"
    })
    expect(provider.calls).toBe(0)
    const inputs = await session.listInputs({ sessionId: created.id })
    expect(inputs[0]?.status).toBe("cancelled")
    const controls = await session.listRunControls({
      sessionId: created.id,
      status: "applied"
    })
    expect(controls).toHaveLength(1)
    expect(controls[0]).toMatchObject({
      kind: "interrupt",
      reason: "user stopped before provider"
    })
  })

  it("applies steer controls before the provider so replay can observe them", async () => {
    const session = await createSteeringSessionCore({
      content: [{ type: "text", id: "part_steer", text: "answer tersely" }]
    })
    const created = await session.create({ id: "ses_agent_steer_pre" })
    await session.admit({
      id: "inp_agent_steer_pre",
      sessionId: created.id,
      principalId: "user_agent",
      idempotencyKey: "idem_agent_steer_pre",
      content: [{ type: "text", id: "part_user", text: "explain runtime" }]
    })

    const provider = new RecordingProvider()
    const runner = new WanexAgentRunner({
      session,
      provider,
      runnerId: "runner_steer_pre",
      leaseMs: 60_000
    })

    const result = await runner.runOnce({ sessionId: created.id })

    expect(result.status).toBe("completed")
    expect(provider.calls).toBe(1)
    const replayText = textFromReplay(provider.lastMessages)
    expect(replayText).toContain("explain runtime")
    expect(replayText).toContain("answer tersely")
    const inputs = await session.listInputs({ sessionId: created.id })
    expect(inputs.find((input) => input.intent === "steer")).toMatchObject({
      status: "completed",
      runControlPolicy: "steer_at_safe_point"
    })
    const controls = await session.listRunControls({
      sessionId: created.id,
      kind: "steer"
    })
    expect(controls).toHaveLength(1)
    expect(controls[0]?.status).toBe("applied")
  })

  it("does not leak unapplied control_pending inputs into provider replay", async () => {
    const session = await createReplayAugmentingSessionCore({
      text: "hidden control text"
    })
    const created = await session.create({ id: "ses_agent_control_hidden" })
    await session.admit({
      id: "inp_agent_control_hidden",
      sessionId: created.id,
      principalId: "user_agent",
      idempotencyKey: "idem_agent_control_hidden",
      content: [{ type: "text", id: "part_user", text: "visible request" }]
    })

    const provider = new RecordingProvider()
    const runner = new WanexAgentRunner({
      session,
      provider,
      runnerId: "runner_control_hidden",
      leaseMs: 60_000
    })

    await runner.runOnce({ sessionId: created.id })

    const replayText = textFromReplay(provider.lastMessages)
    expect(replayText).toContain("visible request")
    expect(replayText).not.toContain("hidden control text")
  })

  it("uses an optional context compiler before provider replay", async () => {
    const session = await createSessionCore()
    const created = await session.create({ id: "ses_agent_context" })
    await session.submitRun({
      id: "inp_agent_context_old",
      sessionId: created.id,
      principalId: "user_agent",
      idempotencyKey: "idem_agent_context_old",
      content: [{ type: "text", id: "part_old_user", text: "old request" }]
    })
    const firstRunner = new WanexAgentRunner({
      session,
      provider: new FakeProviderAdapter({
        responseText: "old assistant ".repeat(80)
      }),
      runnerId: "runner_context_first",
      leaseMs: 60_000
    })
    await firstRunner.runOnce({ sessionId: created.id })
    await session.submitRun({
      id: "inp_agent_context_new",
      sessionId: created.id,
      principalId: "user_agent",
      idempotencyKey: "idem_agent_context_new",
      content: [{ type: "text", id: "part_new_user", text: "new request" }]
    })

    const provider = new RecordingProvider()
    const runner = new WanexAgentRunner({
      session,
      provider,
      contextCompiler: new DeterministicContextCompiler({
        policy: {
          recentUserTurns: 1,
          snipTextOverChars: 20,
          placeholderTextOverChars: 60
        }
      }),
      runnerId: "runner_context_second",
      leaseMs: 60_000
    })

    await runner.runOnce({ sessionId: created.id })

    const replayText = provider.lastMessages
      .flatMap((message) => message.content)
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n")
    expect(replayText).toContain("[compacted")
    expect(replayText).toContain("new request")
  })

  it("runs ephemeral side queries against session context without durable writes", async () => {
    const session = await createSessionCore()
    const created = await session.create({ id: "ses_agent_ephemeral" })
    await session.admit({
      id: "inp_agent_ephemeral_seed",
      sessionId: created.id,
      principalId: "user_agent",
      idempotencyKey: "idem_agent_ephemeral_seed",
      content: [{ type: "text", id: "part_seed", text: "seed request" }]
    })
    const seedRunner = new WanexAgentRunner({
      session,
      provider: new FakeProviderAdapter({ responseText: "seed answer" }),
      runnerId: "runner_ephemeral_seed",
      leaseMs: 60_000
    })
    await seedRunner.runOnce({ sessionId: created.id })

    const provider = new RecordingProvider()
    const result = await runEphemeralSideQuery(
      {
        session,
        provider
      },
      {
        sessionId: created.id,
        question: [{ type: "text", id: "part_side", text: "side question" }],
        maxOutputTokens: 42
      }
    )

    expect(result.output).toEqual([
      {
        type: "text",
        id: "text_0",
        text: "recorded response"
      }
    ])
    expect(result.telemetry).toMatchObject({
      providerId: "fake",
      modelId: "fake-model",
      replayMessageCount: 2,
      outputPartCount: 1
    })
    expect(provider.lastMaxOutputTokens).toBe(42)
    const replayText = textFromReplay(provider.lastMessages)
    expect(replayText).toContain("seed request")
    expect(replayText).toContain("seed answer")
    expect(replayText).toContain("side question")
    await expect(session.listInputs({ sessionId: created.id })).resolves.toHaveLength(1)
    await expect(session.listMessages({ sessionId: created.id })).resolves.toHaveLength(1)
    await expect(session.listJobs({ kind: "session.run" })).resolves.toHaveLength(0)
  })

  it("rejects provider tool calls in ephemeral side queries", async () => {
    const session = await createSessionCore()
    const created = await session.create({ id: "ses_agent_ephemeral_tool" })

    await expect(
      runEphemeralSideQuery(
        {
          session,
          provider: new FakeProviderAdapter({
            responseText: "unused",
            toolName: "echo"
          })
        },
        {
          sessionId: created.id,
          question: [{ type: "text", id: "part_side", text: "lookup" }]
        }
      )
    ).rejects.toThrow("ephemeral query toolPolicy none rejected")
    await expect(session.listInputs({ sessionId: created.id })).resolves.toHaveLength(0)
    await expect(session.listMessages({ sessionId: created.id })).resolves.toHaveLength(0)
  })

  it("fails closed for unsupported ephemeral side-query policies", async () => {
    const session = await createSessionCore()
    const provider = new RecordingProvider()

    await expect(
      runEphemeralSideQuery(
        { session, provider },
        {
          question: [{ type: "text", id: "part_side", text: "side" }],
          toolPolicy: "read"
        } as unknown as Parameters<typeof runEphemeralSideQuery>[1]
      )
    ).rejects.toThrow("ephemeral query toolPolicy must be none")
    await expect(
      runEphemeralSideQuery(
        { session, provider },
        {
          question: [{ type: "text", id: "part_side", text: "side" }],
          contextSnapshotId: "snapshot_unimplemented"
        }
      )
    ).rejects.toThrow("contextSnapshotId is not supported")
    expect(provider.calls).toBe(0)
  })

  it("filters control_pending inputs from ephemeral side-query replay", async () => {
    const session = await createReplayAugmentingSessionCore({
      text: "hidden ephemeral control text"
    })
    const created = await session.create({ id: "ses_agent_ephemeral_hidden" })
    await session.admit({
      id: "inp_agent_ephemeral_hidden",
      sessionId: created.id,
      principalId: "user_agent",
      idempotencyKey: "idem_agent_ephemeral_hidden",
      content: [{ type: "text", id: "part_user", text: "visible ephemeral" }]
    })

    const provider = new RecordingProvider()
    await runEphemeralSideQuery(
      {
        session,
        provider
      },
      {
        sessionId: created.id,
        question: [{ type: "text", id: "part_side", text: "side question" }]
      }
    )

    const replayText = textFromReplay(provider.lastMessages)
    expect(replayText).toContain("visible ephemeral")
    expect(replayText).toContain("side question")
    expect(replayText).not.toContain("hidden ephemeral control text")
  })
})

async function createSessionCore(): Promise<WanexSessionCore> {
  return new WanexSessionCore({
    storage: await createTestStore()
  })
}

async function createInterruptingSessionCore(options: {
  readonly reason: string
}): Promise<WanexSessionCore> {
  return new InterruptAfterClaimSessionCore({
    storage: await createTestStore(),
    reason: options.reason
  })
}

async function createSteeringSessionCore(options: {
  readonly content: [{ readonly type: "text"; readonly id: string; readonly text: string }]
}): Promise<WanexSessionCore> {
  return new SteerAfterClaimSessionCore({
    storage: await createTestStore(),
    content: options.content
  })
}

async function createReplayAugmentingSessionCore(options: {
  readonly text: string
}): Promise<WanexSessionCore> {
  return new ReplayAugmentingSessionCore({
    storage: await createTestStore(),
    text: options.text
  })
}

async function createTestStore(): Promise<StorageTestStore> {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-agent-core-"))
  tempDirs.push(storeDir)
  return createStorageTestStore({ kind: "local-system-service", mode: "oneshot",
    storeDir,
    serviceBin
  })
}

function textFromReplay(messages: readonly ProviderReplayMessage[]): string {
  return messages
    .flatMap((message) => message.content)
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
}

class SlowProviderAdapter extends FakeProviderAdapter {
  private readonly delayMs: number
  lastSignal: RuntimeAbortSignal | undefined

  constructor(delayMs: number) {
    super({ responseText: "too late" })
    this.delayMs = delayMs
  }

  override async *stream(request: ProviderRequest) {
    this.lastSignal = request.signal
    await new Promise((resolve) => setTimeout(resolve, this.delayMs))
    yield* super.stream(request)
  }
}

class RecordingProvider extends FakeProviderAdapter {
  lastMessages: readonly ProviderReplayMessage[] = []
  lastSignal: RuntimeAbortSignal | undefined
  lastMaxOutputTokens: number | undefined
  calls = 0

  constructor() {
    super({ responseText: "recorded response" })
  }

  override async *stream(request: ProviderRequest) {
    this.calls += 1
    this.lastSignal = request.signal
    this.lastMaxOutputTokens = request.maxOutputTokens
    this.lastMessages = request.messages
    yield* super.stream(request)
  }
}

class UsageProvider extends FakeProviderAdapter {
  constructor() {
    super({ responseText: "metered response" })
  }

  override async *stream(request: ProviderRequest) {
    yield { type: "usage" as const, usage: { inputTokens: 3, outputTokens: 4 } }
    yield* super.stream(request)
  }
}

class ParallelToolProvider extends FakeProviderAdapter {
  firstRequest: ProviderRequest | undefined
  replayedToolCallIds: string[] = []
  private readonly beforeContinuation: () => Promise<void>

  constructor(beforeContinuation: () => Promise<void>) {
    super({ responseText: "parallel tools done" })
    this.beforeContinuation = beforeContinuation
  }

  override async *stream(request: ProviderRequest) {
    const toolResults = request.messages
      .flatMap((message) => message.content)
      .filter((part) => part.type === "tool_result")
    if (toolResults.length === 0) {
      this.firstRequest = request
      yield { type: "tool_call_start" as const, index: 0, toolCallId: "call_slow" }
      yield {
        type: "tool_call_delta" as const,
        toolCallId: "call_slow",
        toolNameDelta: "slow",
        inputJsonDelta: "{}"
      }
      yield { type: "tool_call_end" as const, toolCallId: "call_slow" }
      yield { type: "tool_call_start" as const, index: 1, toolCallId: "call_fast" }
      yield {
        type: "tool_call_delta" as const,
        toolCallId: "call_fast",
        toolNameDelta: "fast",
        inputJsonDelta: "{}"
      }
      yield { type: "tool_call_end" as const, toolCallId: "call_fast" }
      yield { type: "finish" as const, reason: "tool_calls" as const }
      return
    }
    await this.beforeContinuation()
    this.replayedToolCallIds = toolResults.map((part) => part.toolCallId)
    yield* super.stream(request)
  }
}

class ToolConcurrencyProbe {
  active = 0
  maxActive = 0
  readonly completionOrder: string[] = []
  private entered = 0
  private resolveAllEntered: () => void = () => {}
  private readonly allEntered = new Promise<void>((resolve) => {
    this.resolveAllEntered = resolve
  })

  async enter(): Promise<void> {
    this.active += 1
    this.maxActive = Math.max(this.maxActive, this.active)
    this.entered += 1
    if (this.entered === 2) this.resolveAllEntered()
    await this.allEntered
  }

  leave(name: string): void {
    this.active -= 1
    this.completionOrder.push(name)
  }
}

class DelayedProbeTool implements ToolDefinition {
  readonly description = "Probe bounded parallel tool execution."
  readonly inputSchema = { type: "object", additionalProperties: false } as const
  readonly risk = "read_only" as const
  readonly idempotent = true

  constructor(
    readonly name: string,
    private readonly delayMs: number,
    private readonly probe: ToolConcurrencyProbe,
    private readonly shouldThrow: boolean
  ) {}

  async invoke(invocation: ToolInvocation): Promise<ToolExecutionResult> {
    await this.probe.enter()
    await new Promise((resolve) => setTimeout(resolve, this.delayMs))
    this.probe.leave(this.name)
    if (this.shouldThrow) throw new Error(`${this.name} failed`)
    return {
      toolCallId: invocation.toolCallId,
      result: { tool: this.name },
      isError: false
    }
  }
}

class RecordingTool implements ToolDefinition {
  readonly name = "record"
  readonly description = "Record a test invocation."
  readonly inputSchema = { type: "object", additionalProperties: true } as const
  readonly risk = "read_only" as const
  readonly idempotent = true
  lastSignal: RuntimeAbortSignal | undefined

  async invoke(invocation: ToolInvocation): Promise<ToolExecutionResult> {
    this.lastSignal = invocation.signal
    return {
      toolCallId: invocation.toolCallId,
      result: {
        ok: true
      },
      isError: false
    }
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
        principalId: "user_agent",
        idempotencyKey: `interrupt:${claim.runId}`
      })
    }
    return claim
  }
}

class SteerAfterClaimSessionCore extends WanexSessionCore {
  private readonly content: [{ readonly type: "text"; readonly id: string; readonly text: string }]
  private steered = false

  constructor(options: {
    readonly storage: StorageTestStore
    readonly content: [{ readonly type: "text"; readonly id: string; readonly text: string }]
  }) {
    super({ storage: options.storage })
    this.content = options.content
  }

  override async claimRunner(
    request: Parameters<WanexSessionCore["claimRunner"]>[0]
  ): ReturnType<WanexSessionCore["claimRunner"]> {
    const claim = await super.claimRunner(request)
    if (claim !== null && !this.steered) {
      this.steered = true
      await super.steerRun({
        sessionId: request.sessionId,
        principalId: "user_agent",
        expectedRunId: claim.runId,
        idempotencyKey: `steer:${claim.runId}`,
        content: this.content
      })
    }
    return claim
  }
}

class ReplayAugmentingSessionCore extends WanexSessionCore {
  private readonly text: string

  constructor(options: {
    readonly storage: StorageTestStore
    readonly text: string
  }) {
    super({ storage: options.storage })
    this.text = options.text
  }

  override async listInputs(
    request: Parameters<WanexSessionCore["listInputs"]>[0]
  ): ReturnType<WanexSessionCore["listInputs"]> {
    const inputs = await super.listInputs(request)
    return [
      ...inputs,
      {
        id: "inp_synthetic_control_pending",
        sessionId: request.sessionId,
        principalId: "user_agent",
        idempotencyKey: "idem_synthetic_control_pending",
        inputType: "user",
        content: [{ type: "text", id: "part_hidden_control", text: this.text }],
        intent: "steer",
        runControlPolicy: "steer_at_safe_point",
        expectedRunId: "run_synthetic",
        status: "control_pending",
        createdAt: 1,
        updatedAt: 1
      }
    ]
  }
}
