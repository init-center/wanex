import { describe, expect, it } from "vitest"
import type {
  BeginToolExecutionRequest,
  FinishToolExecutionRequest,
  ToolExecutionAttemptRecord,
  ToolExecutionRecord
} from "@wanex/protocol"
import type { ToolExecutionStore } from "@wanex/storage"
import {
  AllowAllToolsPolicy,
  createToolRuntimeBinding,
  EchoTool,
  RiskBoundToolPolicy,
  ToolRegistry,
  type ToolDefinition,
  type ToolInvocation
} from "../src/tools/index.js"

const identity = {
  principalId: "principal",
  sessionId: "session",
  inputId: "input",
  turnId: "turn",
  attemptId: "attempt",
  sourceMessageId: "message",
  jobId: "job",
  workerId: "worker",
  leaseToken: "lease"
}

describe("Runtime tool contract", () => {
  it("requires schema-rich unique descriptors", () => {
    const registry = new ToolRegistry()
    registry.register(new EchoTool())
    expect(registry.list()).toMatchObject([
      {
        name: "echo",
        description: expect.any(String),
        inputSchema: { type: "object" },
        risk: "read_only",
        idempotent: true
      }
    ])
    expect(registry.list()[0]).not.toHaveProperty("runtimeBinding")
    expect(registry.snapshot()).toEqual({
      tools: [{
        descriptor: expect.objectContaining({ name: "echo" }),
        runtimeBinding: {
          implementationId: "wanex.runtime.tool.echo",
          implementationRevision: "1"
        }
      }]
    })
    expect(() => registry.register(new EchoTool())).toThrow("already registered")
    expect(() => registry.register({
      ...new EchoTool(),
      name: "malformed_binding",
      runtimeBinding: {
        implementationId: "wanex.test.malformed",
        implementationRevision: "1",
        secret: "must-not-persist"
      } as never,
      async invoke(invocation) {
        return {
          toolCallId: invocation.toolCallId,
          result: null,
          isError: false
        }
      }
    })).toThrow("unsupported fields")
    expect(() => registry.register({
      ...new EchoTool(),
      name: "malformed_schema",
      inputSchema: {
        type: "object",
        invalid: undefined
      } as never,
      async invoke(invocation) {
        return {
          toolCallId: invocation.toolCallId,
          result: null,
          isError: false
        }
      }
    })).toThrow("only JSON values")
  })

  it("freezes registered definitions and uses locale-independent ordering", async () => {
    const calls: string[] = []
    const alpha = mutableTool("alpha", calls)
    const upperAlpha = mutableTool("Alpha", calls)
    const registry = new ToolRegistry()
    registry.register(alpha)
    registry.register(upperAlpha)

    alpha.runtimeBinding.implementationRevision = "mutated"
    alpha.inputSchema.properties.value.type = "number"
    alpha.invoke = async (invocation) => {
      calls.push("mutated")
      return { toolCallId: invocation.toolCallId, result: null, isError: false }
    }

    expect(registry.snapshot().tools.map((tool) => tool.descriptor.name)).toEqual([
      "Alpha",
      "alpha"
    ])
    expect(registry.get("alpha")?.runtimeBinding).toEqual({
      implementationId: "wanex.test.alpha",
      implementationRevision: "1"
    })
    expect(registry.get("alpha")?.inputSchema).toEqual({
      type: "object",
      properties: { value: { type: "string" } }
    })
    await registry.get("alpha")?.invoke({
      principalId: "principal",
      sessionId: "session",
      inputId: "input",
      turnId: "turn",
      attemptId: "attempt",
      toolCallId: "call",
      toolName: "alpha",
      input: { value: "original" },
      idempotencyKey: "tool:call"
    })
    expect(calls).toEqual(["original"])
  })

  it("fails closed without permission and on invalid input", async () => {
    const tool = new RecordingTool()
    const registry = new ToolRegistry()
    registry.register(tool)
    const call = {
      type: "tool_call" as const,
      id: "part",
      toolCallId: "call",
      toolName: "record",
      input: { count: "wrong" }
    }

    await expect(registry.execute({
      ...identity,
      storage: new MemoryToolExecutionStore(),
      call: { ...call, input: { count: 1 } },
      idempotencyKey: "tool:run:call"
    })).resolves.toMatchObject({
      invoked: false,
      permission: { status: "deny", reason: "permission_policy_missing" }
    })
    await expect(registry.execute({
      ...identity,
      storage: new MemoryToolExecutionStore(),
      call,
      idempotencyKey: "tool:run:call",
      permissionPolicy: new AllowAllToolsPolicy()
    })).resolves.toMatchObject({
      invoked: false,
      permission: { status: "deny", reason: "invalid_tool_input" }
    })
    expect(tool.calls).toBe(0)
  })

  it("passes logical invocation identity without leaking lease authority", async () => {
    const tool = new RecordingTool()
    const registry = new ToolRegistry()
    registry.register(tool)
    const request = {
      ...identity,
      call: {
        type: "tool_call" as const,
        id: "part",
        toolCallId: "call",
        toolName: "record",
        input: { count: 2 }
      },
      idempotencyKey: "tool:run:call"
    }
    await expect(registry.execute({
      ...request,
      storage: new MemoryToolExecutionStore(),
      permissionPolicy: new RiskBoundToolPolicy(["read_only"])
    })).resolves.toMatchObject({ invoked: false, permission: { status: "deny" } })
    await expect(registry.execute({
      ...request,
      storage: new MemoryToolExecutionStore(),
      permissionPolicy: new AllowAllToolsPolicy()
    })).resolves.toMatchObject({ invoked: true, result: { isError: false } })
    expect(tool.lastInvocation).toMatchObject({
      principalId: identity.principalId,
      sessionId: identity.sessionId,
      inputId: identity.inputId,
      turnId: identity.turnId,
      attemptId: identity.attemptId,
      toolCallId: "call",
      idempotencyKey: "tool:run:call"
    })
    expect(tool.lastInvocation).not.toHaveProperty("leaseToken")
    expect(tool.lastInvocation).not.toHaveProperty("workerId")
    expect(tool.lastInvocation).not.toHaveProperty("jobId")
  })

  it("reuses durable terminal results without invoking twice", async () => {
    const tool = new RecordingTool()
    const registry = new ToolRegistry()
    const storage = new MemoryToolExecutionStore()
    registry.register(tool)
    const request = executionRequest(storage, "call_reuse", "record")

    await expect(registry.execute(request)).resolves.toMatchObject({ invoked: true })
    await expect(registry.execute(request)).resolves.toMatchObject({ invoked: false })
    expect(tool.calls).toBe(1)
    await expect(storage.listToolExecutions({})).resolves.toMatchObject([
      {
        state: "succeeded",
        attemptCount: 1,
        descriptor: {
          idempotent: false,
          runtimeBinding: {
            implementationId: "wanex.test.tool.recording",
            implementationRevision: "1"
          }
        }
      }
    ])
  })

  it("retries only after durable classification marks idempotent work retry-ready", async () => {
    const registry = new ToolRegistry()
    const tool = new IdempotentRecordingTool()
    registry.register(tool)

    const failClosedStorage = new MemoryToolExecutionStore()
    const failClosed = executionRequest(
      failClosedStorage,
      "call_recovery_required",
      tool.name
    )
    await seedRunningExecution(failClosedStorage, failClosed, tool)
    await expect(registry.execute({
      ...failClosed,
      attemptId: "attempt_recovered_fail_closed",
      workerId: "worker_recovered_fail_closed",
      leaseToken: "lease_recovered_fail_closed"
    })).rejects.toThrow(
      "classifier-authorized physical attempt"
    )
    expect(tool.calls).toBe(0)

    const retryStorage = new MemoryToolExecutionStore()
    const retry = executionRequest(retryStorage, "call_retry", tool.name)
    await seedRunningExecution(retryStorage, retry, tool)
    retryStorage.markRetryReady(`toolx_${retry.call.toolCallId}`)
    await expect(registry.execute({
      ...retry,
      attemptId: "attempt_recovered",
      workerId: "worker_recovered",
      leaseToken: "lease_recovered"
    })).resolves.toMatchObject({ invoked: true })
    expect(tool.calls).toBe(1)
    await expect(retryStorage.listToolExecutions({})).resolves.toMatchObject([
      { state: "succeeded", attemptCount: 2 }
    ])
  })

  it("durably records timeout and parent cancellation before returning", async () => {
    const registry = new ToolRegistry()
    registry.register(new HangingTool())

    const timeoutStorage = new MemoryToolExecutionStore()
    await expect(registry.execute({
      ...executionRequest(timeoutStorage, "call_timeout", "hang"),
      timeoutMs: 5
    })).resolves.toMatchObject({
      invoked: true,
      result: { isError: true, result: { error: "tool_timeout" } }
    })
    await expect(timeoutStorage.listToolExecutions({})).resolves.toMatchObject([
      { state: "cancelled", error: { reason: "timed_out" } }
    ])

    const cancellationStorage = new MemoryToolExecutionStore()
    const controller = new AbortController()
    const cancelled = registry.execute({
      ...executionRequest(cancellationStorage, "call_cancel", "hang"),
      signal: controller.signal
    })
    setTimeout(() => controller.abort(), 5)
    await expect(cancelled).resolves.toMatchObject({
      invoked: true,
      result: { isError: true, result: { error: "tool_cancelled" } }
    })
    await expect(cancellationStorage.listToolExecutions({})).resolves.toMatchObject([
      { state: "cancelled", error: { reason: "aborted" } }
    ])
  })

  it("waits for bounded tool cleanup before recording cancellation", async () => {
    const tool = new CleanupAwareTool()
    const registry = new ToolRegistry()
    const storage = new MemoryToolExecutionStore()
    const controller = new AbortController()
    registry.register(tool)

    const cancelled = registry.execute({
      ...executionRequest(storage, "call_cleanup", tool.name),
      signal: controller.signal
    })
    setTimeout(() => controller.abort(), 5)

    await expect(cancelled).resolves.toMatchObject({
      invoked: true,
      result: { isError: true }
    })
    expect(tool.cleanupComplete).toBe(true)
    await expect(storage.listToolExecutions({})).resolves.toMatchObject([
      { state: "cancelled", error: { reason: "aborted" } }
    ])
  })

  it("does not invoke a tool when budget preflight rejects usage", async () => {
    const tool = new RecordingTool()
    const registry = new ToolRegistry()
    const storage = new MemoryToolExecutionStore()
    registry.register(tool)

    await expect(registry.execute({
      ...executionRequest(storage, "call_budget_denied", tool.name),
      budget: {
        grantId: "grant_denied",
        storage: {
          async recordBudgetUsage() {
            throw new Error("budget denied")
          }
        }
      }
    })).resolves.toMatchObject({ invoked: false, result: { isError: true } })
    expect(tool.calls).toBe(0)
    await expect(storage.listToolExecutions({})).resolves.toMatchObject([
      { state: "failed" }
    ])
  })
})

interface MutableTestTool {
  name: string
  description: string
  inputSchema: {
    type: "object"
    properties: { value: { type: string } }
  }
  risk: "read_only"
  idempotent: boolean
  runtimeBinding: {
    implementationId: string
    implementationRevision: string
  }
  invoke: (invocation: ToolInvocation) => Promise<{
    toolCallId: string
    result: null
    isError: boolean
  }>
}

function mutableTool(name: string, calls: string[]): MutableTestTool {
  return {
    name,
    description: `Mutable ${name} tool.`,
    inputSchema: {
      type: "object",
      properties: { value: { type: "string" } }
    },
    risk: "read_only",
    idempotent: true,
    runtimeBinding: {
      implementationId: `wanex.test.${name}`,
      implementationRevision: "1"
    },
    async invoke(invocation) {
      calls.push("original")
      return { toolCallId: invocation.toolCallId, result: null, isError: false }
    }
  }
}

function executionRequest(
  storage: ToolExecutionStore,
  toolCallId: string,
  toolName: string
) {
  return {
    ...identity,
    storage,
    call: {
      type: "tool_call" as const,
      id: `part_${toolCallId}`,
      toolCallId,
      toolName,
      input: { count: 2 }
    },
    idempotencyKey: `tool:run:${toolCallId}`,
    permissionPolicy: new AllowAllToolsPolicy()
  }
}

async function seedRunningExecution(
  storage: ToolExecutionStore,
  request: ReturnType<typeof executionRequest>,
  tool: ToolDefinition
): Promise<void> {
  await storage.beginToolExecution({
    ...identity,
    toolCallId: request.call.toolCallId,
    toolName: tool.name,
    input: request.call.input,
    descriptor: {
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      risk: tool.risk,
      idempotent: tool.idempotent,
      runtimeBinding: { ...tool.runtimeBinding }
    },
    permission: { status: "allow", reason: "test" },
    state: "running",
    idempotencyKey: request.idempotencyKey
  })
}

class RecordingTool implements ToolDefinition {
  readonly name: string = "record"
  readonly description = "Record an integer."
  readonly inputSchema = {
    type: "object",
    properties: { count: { type: "integer" } },
    required: ["count"],
    additionalProperties: false
  } as const
  readonly risk = "mutating" as const
  readonly idempotent: boolean = false
  readonly runtimeBinding = createToolRuntimeBinding({
    implementationId: "wanex.test.tool.recording",
    implementationRevision: "1"
  })
  calls = 0
  lastInvocation: ToolInvocation | undefined

  async invoke(invocation: ToolInvocation) {
    this.calls += 1
    this.lastInvocation = invocation
    return { toolCallId: invocation.toolCallId, result: { ok: true }, isError: false }
  }
}

class IdempotentRecordingTool extends RecordingTool {
  override readonly name = "idempotent_record"
  override readonly idempotent = true
}

class HangingTool implements ToolDefinition {
  readonly name = "hang"
  readonly description = "Wait until invocation control stops the call."
  readonly inputSchema = { type: "object", additionalProperties: true } as const
  readonly risk = "read_only" as const
  readonly idempotent = true
  readonly runtimeBinding = createToolRuntimeBinding({
    implementationId: "wanex.test.tool.hanging",
    implementationRevision: "1"
  })

  async invoke(invocation: ToolInvocation): Promise<never> {
    await new Promise<void>((resolve) => {
      if (invocation.signal?.aborted === true) {
        resolve()
        return
      }
      invocation.signal?.addEventListener("abort", resolve, { once: true })
    })
    throw new Error("tool observed cancellation")
  }
}

class CleanupAwareTool implements ToolDefinition {
  readonly name = "cleanup_aware"
  readonly description = "Complete bounded cleanup after cancellation."
  readonly inputSchema = { type: "object", additionalProperties: true } as const
  readonly risk = "external" as const
  readonly idempotent = false
  readonly runtimeBinding = createToolRuntimeBinding({
    implementationId: "wanex.test.tool.cleanup-aware",
    implementationRevision: "1"
  })
  cleanupComplete = false

  async invoke(invocation: ToolInvocation) {
    await new Promise<void>((resolve) => {
      invocation.signal?.addEventListener("abort", () => {
        setTimeout(() => {
          this.cleanupComplete = true
          resolve()
        }, 20)
      }, { once: true })
    })
    return {
      toolCallId: invocation.toolCallId,
      result: { cleaned: true },
      isError: true
    }
  }
}

class MemoryToolExecutionStore implements ToolExecutionStore {
  private readonly records = new Map<string, ToolExecutionRecord>()
  private readonly attempts = new Map<string, ToolExecutionAttemptRecord>()

  async beginToolExecution(request: BeginToolExecutionRequest) {
    const existing = [...this.records.values()].find(
      (item) =>
        item.sourceMessageId === request.sourceMessageId &&
        item.toolCallId === request.toolCallId
    )
    if (existing !== undefined) {
      if (existing.state === "retry_ready" && request.state === "running") {
        const attempt = this.createAttempt(existing, request, existing.attemptCount + 1)
        const execution = {
          ...existing,
          state: "running" as const,
          currentInvocationAttemptId: attempt.id,
          attemptCount: attempt.attemptNumber,
          updatedAt: Date.now()
        }
        this.records.set(execution.id, execution)
        return { execution, invocationAttempt: attempt, created: false }
      }
      const invocationAttempt = existing.currentInvocationAttemptId === undefined
        ? undefined
        : this.attempts.get(existing.currentInvocationAttemptId)
      return {
        execution: existing,
        ...(invocationAttempt === undefined ? {} : { invocationAttempt }),
        created: false
      }
    }
    const now = Date.now()
    const execution: ToolExecutionRecord = {
      id: `toolx_${request.toolCallId}`,
      sessionId: request.sessionId,
      turnId: request.turnId,
      inputId: request.inputId,
      sourceMessageId: request.sourceMessageId,
      principalId: request.principalId,
      toolCallId: request.toolCallId,
      toolName: request.toolName,
      input: request.input,
      descriptor: request.descriptor,
      permission: request.permission,
      state: request.state,
      attemptCount: request.state === "running" ? 1 : 0,
      idempotencyKey: request.idempotencyKey,
      createdAt: now,
      updatedAt: now
    }
    const invocationAttempt = request.state === "running"
      ? this.createAttempt(execution, request, 1)
      : undefined
    const stored = invocationAttempt === undefined
      ? execution
      : { ...execution, currentInvocationAttemptId: invocationAttempt.id }
    this.records.set(stored.id, stored)
    return {
      execution: stored,
      ...(invocationAttempt === undefined ? {} : { invocationAttempt }),
      created: true
    }
  }

  async finishToolExecution(request: FinishToolExecutionRequest) {
    const existing = this.records.get(request.executionId)
    if (existing === undefined) return null
    const next: ToolExecutionRecord = {
      ...existing,
      state: request.state,
      ...(request.result === undefined ? {} : { result: request.result }),
      ...(request.isError === undefined ? {} : { isError: request.isError }),
      ...(request.error === undefined ? {} : { error: request.error }),
      finishedAt: Date.now(),
      updatedAt: Date.now()
    }
    this.records.set(next.id, next)
    return next
  }

  async getToolExecution(executionId: string) {
    return this.records.get(executionId) ?? null
  }

  async listToolExecutions(_request: unknown = {}) {
    return [...this.records.values()]
  }

  async listToolExecutionAttempts(request: { readonly executionId: string }) {
    return [...this.attempts.values()].filter(
      (attempt) => attempt.executionId === request.executionId
    )
  }

  markRetryReady(executionId: string): void {
    const existing = this.records.get(executionId)
    if (existing === undefined) throw new Error("missing execution")
    this.records.set(executionId, {
      ...existing,
      state: "retry_ready",
      updatedAt: Date.now()
    })
  }

  private createAttempt(
    execution: Pick<ToolExecutionRecord, "id">,
    request: BeginToolExecutionRequest,
    attemptNumber: number
  ): ToolExecutionAttemptRecord {
    const now = Date.now()
    const attempt: ToolExecutionAttemptRecord = {
      id: `toolattempt_${request.toolCallId}_${attemptNumber}`,
      executionId: execution.id,
      sessionAttemptId: request.attemptId,
      jobId: request.jobId,
      workerId: request.workerId,
      attemptNumber,
      state: "running",
      startedAt: now,
      updatedAt: now
    }
    this.attempts.set(attempt.id, attempt)
    return attempt
  }
}
