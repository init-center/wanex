import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { afterEach, describe, expect, it } from "vitest"
import type {
  JsonValue,
  ToolResultMessagePart
} from "@wanex/protocol"
import {
  createStorageTestStore,
  type StorageTestStore
} from "@wanex/storage/testing"
import { WanexAgentRunner } from "../src/execution/core/index.js"
import {
  FakeProviderAdapter,
  type ProviderAdapter,
  type ProviderEvent,
  type ProviderRequest,
  type ProviderReplayMessage
} from "../src/provider/index.js"
import {
  AllowAllToolsPolicy,
  createToolRuntimeBinding,
  ToolRegistry
} from "../src/tools/index.js"
import {
  createStartedTurn,
  type StartedTurnFixture
} from "./durable-turn-test-fixture.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)
const tempDirs: string[] = []
const stores: StorageTestStore[] = []

afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.dispose()))
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

describe("Runtime exact turn runner", () => {
  it("settles one exact started attempt with a canonical assistant message", async () => {
    const storage = await createStore()
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
    const storage = await createStore()
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
    const storage = await createStore()
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
      runtimeBinding: createToolRuntimeBinding({
        implementationId: "wanex.test.agent-runner.echo",
        implementationRevision: "1"
      }),
      async invoke(invocation) {
        return {
          toolCallId: invocation.toolCallId,
          result: { text: (invocation.input as { text: string }).text },
          isError: false
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
      result: { text: "hello" },
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

  it("resumes an incomplete durable tool batch before another provider call", async () => {
    const storage = await createStore()
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
    const storage = await createStore()
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
    const storage = await createStore()
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
    const storage = await createStore()
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
    const storage = await createStore()
    const fixture = await createStartedTurn(storage, {
      suffix: "runner_mismatched_tools"
    })
    await seedToolCallCheckpoint(fixture, "call_expected")
    await fixture.session.appendMessage({
      ...fixture.execution,
      idempotencyKey: "turn:runner_mismatched_tools:tools",
      role: "tool",
      content: [{
        type: "tool_result",
        id: "part_wrong_result",
        toolCallId: "call_wrong",
        result: { ok: true },
        isError: false
      }]
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
    expect(result.settlement.turn.state).toBe("recovery_required")
    expect(provider.calls).toBe(0)
  })

  it("fails closed as recovery-required after observed provider output", async () => {
    const storage = await createStore()
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
    expect(result.settlement.turn.state).toBe("recovery_required")
    expect(result.settlement.attempt.state).toBe("recovery_required")
    expect(result.settlement.job.state).toBe("failed")
  })

  it("fails a bounded turn that never reaches a final response", async () => {
    const storage = await createStore()
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
      runtimeBinding: createToolRuntimeBinding({
        implementationId: "wanex.test.agent-runner.bounded-echo",
        implementationRevision: "1"
      }),
      async invoke(invocation) {
        return {
          toolCallId: invocation.toolCallId,
          result: { ok: true },
          isError: false
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
    expect(result.error?.message).toContain("exceeded maxSteps")
    expect(result.settlement.turn.state).toBe("failed")
  })

  it("observes a durable cancellation request before invoking the provider", async () => {
    const storage = await createStore()
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
    expect(provider.calls).toBe(0)
    expect(result.settlement.turn.state).toBe("cancelled")
    expect(result.settlement.job.state).toBe("cancelled")
  })
})

async function createStore() {
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-agent-runner-"))
  tempDirs.push(storeDir)
  const store = createStorageTestStore({
    kind: "local-system-service",
    mode: "persistent",
    storeDir,
    serviceBin
  })
  stores.push(store)
  return store
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
    runtimeBinding: createToolRuntimeBinding({
      implementationId: "wanex.test.agent-runner.recovery-echo",
      implementationRevision: "1"
    }),
    async invoke(invocation) {
      onInvoke()
      return {
        toolCallId: invocation.toolCallId,
        result: { text: (invocation.input as { text: string }).text },
        isError: false
      }
    }
  })
  return tools
}

class ToolThenFinalProvider implements ProviderAdapter {
  readonly kind = "fake" as const
  readonly capabilities = { input: ["text"], output: ["text"] } as const
  readonly providerId = "tool-final"
  readonly modelId = "tool-final-model"
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

class RetryThenFinalProvider implements ProviderAdapter {
  readonly kind = "fake" as const
  readonly capabilities = { input: ["text"], output: ["text"] } as const
  readonly providerId = "retry-final"
  readonly modelId = "retry-final-model"
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
          modelId: this.modelId,
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
  readonly kind = "fake" as const
  readonly capabilities = { input: ["text"], output: ["text"] } as const
  readonly providerId = "partial-error"
  readonly modelId = "partial-error-model"

  async *stream(): AsyncIterable<ProviderEvent> {
    yield { type: "text_delta", partId: "part_partial", delta: "partial" }
    yield {
      type: "error",
      error: {
        category: "network",
        message: "connection lost",
        retryable: true,
        providerId: this.providerId,
        modelId: this.modelId,
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
  readonly kind = "fake" as const
  readonly capabilities = { input: ["text"], output: ["text"] } as const
  readonly providerId = "counting"
  readonly modelId = "counting-model"
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
  readonly kind = "fake" as const
  readonly capabilities = { input: ["text"], output: ["text"] } as const
  readonly providerId = "recovery-steering"
  readonly modelId = "recovery-steering-model"
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
