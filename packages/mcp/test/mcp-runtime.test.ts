import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import type {
  BeginToolExecutionRequest,
  FinishToolExecutionRequest,
  JsonValue,
  RecoverToolExecutionRequest,
  ToolExecutionRecord
} from "@wanex/protocol"
import type { ToolExecutionStore } from "@wanex/storage"
import {
  AllowAllToolsPolicy,
  EchoTool,
  ToolRegistry,
  type ToolDefinition,
  type ToolInvocation
} from "@wanex/runtime/tools"
import {
  WanexMcpRuntimeClient,
  WanexMcpHttpServerHost
} from "../src/index.js"

describe("@wanex/mcp", () => {
  it("adapts official stdio discovery, structured results, errors, cancellation, and restart", async () => {
    const client = new WanexMcpRuntimeClient({
      id: "stdio-fixture",
      transport: {
        kind: "stdio",
        command: process.execPath,
        args: [fileURLToPath(new URL("./fixtures/stdio-server.mjs", import.meta.url))],
        stderr: "pipe"
      },
      namePrefix: "fixture",
      requestTimeoutMs: 5_000
    })
    await expect(client.discoverTools()).rejects.toThrow("not started")
    await client.start()
    await client.start()

    const registry = await client.createRegistry()
    expect(registry.list().map((tool) => ({
      name: tool.name,
      risk: tool.risk,
      idempotent: tool.idempotent
    }))).toEqual([
      { name: "fixture__echo", risk: "read_only", idempotent: true },
      { name: "fixture__fail", risk: "read_only", idempotent: true },
      { name: "fixture__hang", risk: "read_only", idempotent: true }
    ])

    const storage = new MemoryToolExecutionStore()
    await expect(registry.execute(executionRequest(
      storage,
      "call_stdio_echo",
      "fixture__echo",
      { message: "hello" }
    ))).resolves.toMatchObject({
      invoked: true,
      result: {
        isError: false,
        result: {
          protocol: "mcp",
          structuredContent: { echo: { message: "hello" } }
        }
      }
    })
    await expect(registry.execute(executionRequest(
      storage,
      "call_stdio_fail",
      "fixture__fail",
      {}
    ))).resolves.toMatchObject({ result: { isError: true } })

    const controller = new AbortController()
    const cancelled = registry.execute({
      ...executionRequest(storage, "call_stdio_cancel", "fixture__hang", {}),
      signal: controller.signal
    })
    setTimeout(() => controller.abort(), 10)
    await expect(cancelled).rejects.toThrow("tool invocation aborted")
    await expect(storage.listToolExecutions({})).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({
        toolCallId: "call_stdio_cancel",
        state: "cancelled"
      })])
    )

    await client.stop()
    await client.stop()
    await client.start()
    await expect(client.discoverTools()).resolves.toHaveLength(3)
    await client.dispose()
    await client.dispose()
    await expect(client.start()).rejects.toThrow("disposed")
  })

  it("serves only a selected Runtime registry over stateless Streamable HTTP", async () => {
    const serverRegistry = new ToolRegistry()
    serverRegistry.register(new EchoTool())
    serverRegistry.register(new FailingTool())
    serverRegistry.register(new HangingTool())
    const serverStorage = new MemoryToolExecutionStore()
    const host = new WanexMcpHttpServerHost({
      registry: serverRegistry,
      resolveExecutionContext: async (request) => ({
        principalId: "http-principal",
        sessionId: "http-session",
        inputId: `http-input-${String(request.requestId)}`,
        runId: `http-run-${String(request.requestId)}`,
        idempotencyKey: `http:${String(request.requestId)}`,
        permissionPolicy: new AllowAllToolsPolicy(),
        storage: serverStorage
      })
    })
    await host.start()
    await host.start()
    const client = new WanexMcpRuntimeClient({
      id: "http-fixture",
      transport: { kind: "streamable_http", url: host.url() },
      requestTimeoutMs: 5_000
    })
    await client.start()
    const registry = await client.createRegistry()
    expect(registry.list().map((tool) => tool.name)).toEqual([
      "echo",
      "fail",
      "hang"
    ])

    const localStorage = new MemoryToolExecutionStore()
    await expect(registry.execute(executionRequest(
      localStorage,
      "call_http_echo",
      "echo",
      { source: "http" }
    ))).resolves.toMatchObject({
      result: {
        isError: false,
        result: {
          protocol: "mcp",
          structuredContent: { echo: { source: "http" } }
        }
      }
    })
    await expect(registry.execute(executionRequest(
      localStorage,
      "call_http_fail",
      "fail",
      {}
    ))).resolves.toMatchObject({ result: { isError: true } })
    const controller = new AbortController()
    const cancelled = registry.execute({
      ...executionRequest(localStorage, "call_http_cancel", "hang", {}),
      signal: controller.signal
    })
    setTimeout(() => controller.abort(), 10)
    await expect(cancelled).rejects.toThrow("tool invocation aborted")
    await expect(localStorage.listToolExecutions({})).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({
        toolCallId: "call_http_cancel",
        state: "cancelled"
      })])
    )
    await waitFor(async () => (await serverStorage.listToolExecutions({}))
      .some((execution) => execution.toolName === "hang" && execution.state === "cancelled"))
    expect((await serverStorage.listToolExecutions({})).map(
      (execution) => ({ name: execution.toolName, state: execution.state })
    )).toEqual(expect.arrayContaining([
      { name: "echo", state: "succeeded" },
      { name: "fail", state: "failed" },
      { name: "hang", state: "cancelled" }
    ]))

    await client.dispose()
    await host.stop()
    await host.stop()
    await host.start()
    expect(host.status()).toMatchObject({ started: true, disposed: false })
    await host.dispose()
    await expect(host.start()).rejects.toThrow("disposed")
  })
})

async function waitFor(check: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 1_000
  while (!(await check())) {
    if (Date.now() >= deadline) throw new Error("timed out waiting for MCP state")
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

function executionRequest(
  storage: ToolExecutionStore,
  toolCallId: string,
  toolName: string,
  input: JsonValue
) {
  return {
    principalId: "local-principal",
    sessionId: "local-session",
    inputId: `input_${toolCallId}`,
    runId: "local-run",
    call: {
      type: "tool_call" as const,
      id: `part_${toolCallId}`,
      toolCallId,
      toolName,
      input
    },
    idempotencyKey: `tool:local-run:${toolCallId}`,
    permissionPolicy: new AllowAllToolsPolicy(),
    storage
  }
}

class FailingTool implements ToolDefinition {
  readonly name = "fail"
  readonly description = "Fail for MCP error mapping tests."
  readonly inputSchema = { type: "object", additionalProperties: true } as const
  readonly risk = "read_only" as const
  readonly idempotent = true

  async invoke(): Promise<never> {
    throw new Error("HTTP fixture failure")
  }
}

class HangingTool implements ToolDefinition {
  readonly name = "hang"
  readonly description = "Wait for MCP cancellation tests."
  readonly inputSchema = { type: "object", additionalProperties: true } as const
  readonly risk = "read_only" as const
  readonly idempotent = true

  async invoke(_invocation: ToolInvocation): Promise<never> {
    return await new Promise<never>(() => {})
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
      id: `toolx_${this.records.size}_${request.toolCallId}`,
      sessionId: request.sessionId,
      runId: request.runId,
      inputId: request.inputId,
      principalId: request.principalId,
      toolCallId: request.toolCallId,
      toolName: request.toolName,
      input: request.input,
      descriptor: request.descriptor,
      permission: request.permission,
      state: status === "allow"
        ? "running"
        : status === "approval_required"
          ? "approval_required"
          : "denied",
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
