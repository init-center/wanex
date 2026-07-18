import { describe, expect, it } from "vitest"
import type {
  BeginToolExecutionRequest,
  FinishToolExecutionRequest,
  RecoverToolExecutionRequest,
  ToolExecutionRecord
} from "@wanex/protocol"
import type { ToolExecutionStore } from "@wanex/storage"
import {
  AllowAllToolsPolicy,
  BoundedIdempotentRecoveryPolicy,
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
  runId: "run"
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
    expect(() => registry.register(new EchoTool())).toThrow("already registered")
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

  it("enforces risk policy and passes stable invocation identity", async () => {
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
      ...identity,
      toolCallId: "call",
      idempotencyKey: "tool:run:call"
    })
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
      { state: "succeeded", attempt: 1 }
    ])
  })

  it("requires an explicit bounded policy before retrying uncertain idempotent work", async () => {
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
    await expect(registry.execute(failClosed)).resolves.toMatchObject({
      invoked: false,
      permission: { status: "deny", reason: "recovery_required" }
    })
    expect(tool.calls).toBe(0)

    const retryStorage = new MemoryToolExecutionStore()
    const retry = executionRequest(retryStorage, "call_retry", tool.name)
    await seedRunningExecution(retryStorage, retry, tool)
    await expect(registry.execute({
      ...retry,
      recoveryPolicy: new BoundedIdempotentRecoveryPolicy(2)
    })).resolves.toMatchObject({ invoked: true })
    expect(tool.calls).toBe(1)
    await expect(retryStorage.listToolExecutions({})).resolves.toMatchObject([
      { state: "succeeded", attempt: 2 }
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
    await expect(cancelled).rejects.toThrow("tool invocation aborted")
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

    await expect(cancelled).rejects.toThrow("tool invocation aborted")
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
      idempotent: tool.idempotent
    },
    permission: { status: "allow", reason: "test" },
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

  async invoke(): Promise<never> {
    return await new Promise<never>(() => {})
  }
}

class CleanupAwareTool implements ToolDefinition {
  readonly name = "cleanup_aware"
  readonly description = "Complete bounded cleanup after cancellation."
  readonly inputSchema = { type: "object", additionalProperties: true } as const
  readonly risk = "external" as const
  readonly idempotent = false
  readonly drainsCancellation = true as const
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

  async beginToolExecution(request: BeginToolExecutionRequest) {
    const existing = [...this.records.values()].find(
      (item) => item.runId === request.runId && item.toolCallId === request.toolCallId
    )
    if (existing !== undefined) return { execution: existing, created: false }
    const status = (request.permission as { readonly status?: string }).status
    const now = Date.now()
    const execution: ToolExecutionRecord = {
      id: `toolx_${request.toolCallId}`,
      sessionId: request.sessionId,
      runId: request.runId,
      inputId: request.inputId,
      principalId: request.principalId,
      toolCallId: request.toolCallId,
      toolName: request.toolName,
      input: request.input,
      descriptor: request.descriptor,
      permission: request.permission,
      state: status === "allow" ? "running" : status === "approval_required" ? "approval_required" : "denied",
      attempt: 1,
      idempotencyKey: request.idempotencyKey,
      createdAt: now,
      updatedAt: now
    }
    this.records.set(execution.id, execution)
    return { execution, created: true }
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

  async recoverToolExecution(request: RecoverToolExecutionRequest) {
    const existing = this.records.get(request.executionId)
    if (existing === undefined) return null
    const next: ToolExecutionRecord = {
      ...existing,
      state: request.action === "retry" ? "running" : "recovery_required",
      attempt: request.action === "retry" ? existing.attempt + 1 : existing.attempt,
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
}
