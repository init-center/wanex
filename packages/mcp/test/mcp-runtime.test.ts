import { createHash } from "node:crypto"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"
import type {
  BeginToolExecutionRequest,
  FinishToolExecutionRequest,
  JsonValue,
  ResourceProvenanceRecord,
  ResourceRecord,
  RequireToolExecutionRecoveryReceipt,
  RequireToolExecutionRecoveryRequest,
  ResolveToolExecutionApprovalReceipt,
  ResolveToolExecutionApprovalRequest,
  ResolveToolExecutionRecoveryReceipt,
  ResolveToolExecutionRecoveryRequest,
  ToolExecutionAttemptRecord,
  ToolExecutionApprovalSuspensionReceipt,
  ToolExecutionRecord
} from "@wanex/protocol"
import {
  AllowAllToolsPolicy,
  createToolRuntimeBinding,
  EchoTool,
  jsonToolResultContent,
  ToolRegistry,
  toolResultPart,
  type ToolDefinition,
  type ToolExecutionRequest,
  type ToolInvocation,
  type ToolPermissionPolicy
} from "@wanex/runtime/tools"
import {
  NativeChildSupervisor,
  NativeExecutionEnvironment,
  type ManagedExecutionProcess,
  type ExecutionEnvironment
} from "@wanex/runtime/execution"
import {
  WanexMcpRuntimeClient,
  WanexMcpHttpServerHost
} from "../src/index.js"

type TestToolExecutionStore = ToolExecutionRequest["storage"]

const serviceBin = fileURLToPath(new URL(
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`,
  import.meta.url
))
const fixtureRoot = fileURLToPath(new URL("./fixtures", import.meta.url))
const executionEnvironments: ExecutionEnvironment[] = []
let nextExecutionScope = 0

afterEach(async () => {
  while (executionEnvironments.length > 0) {
    await executionEnvironments.pop()?.close()
  }
})

describe("@wanex/mcp", () => {
  it("adapts managed stdio discovery, structured results, errors, cancellation, and restart", async () => {
    const execution = await createMcpExecution()
    let processStarts = 0
    let activeProcess: ManagedExecutionProcess | undefined
    const countedExecution = {
      binding: execution.binding,
      process: {
        execute: execution.process.execute.bind(execution.process),
        async start(request: Parameters<typeof execution.process.start>[0]) {
          processStarts += 1
          activeProcess = await execution.process.start(request)
          return activeProcess
        }
      }
    }
    const client = new WanexMcpRuntimeClient({
      id: "stdio-fixture",
      capabilityRevision: "fixture-v1",
      transport: {
        kind: "stdio",
        command: process.execPath,
        args: [fileURLToPath(new URL("./fixtures/stdio-server.mjs", import.meta.url))],
        cwd: fixtureRoot,
        execution: countedExecution
      },
      namePrefix: "fixture",
      connectTimeoutMs: 5_000,
      requestTimeoutMs: 5_000
    })
    await expect(client.discoverTools()).rejects.toThrow("not started")
    await Promise.all([client.start(), client.start()])
    expect(processStarts).toBe(1)

    const registry = await client.createRegistry()
    const admittedSnapshot = registry.snapshot()
    expect(registry.list().map((tool) => ({
      name: tool.name,
      risk: tool.risk,
      idempotent: tool.idempotent
    }))).toEqual([
      { name: "fixture__echo", risk: "read_only", idempotent: true },
      { name: "fixture__external_read", risk: "external", idempotent: true },
      { name: "fixture__fail", risk: "read_only", idempotent: true },
      { name: "fixture__hang", risk: "read_only", idempotent: true },
      { name: "fixture__media", risk: "read_only", idempotent: true }
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
        content: [
          { type: "text", text: '{"echo":{"message":"hello"}}' },
          { type: "json", value: { echo: { message: "hello" } } }
        ]
      }
    })
    await expect(registry.execute(executionRequest(
      storage,
      "call_stdio_fail",
      "fixture__fail",
      {}
    ))).resolves.toMatchObject({ result: { isError: true } })
    await expect(registry.execute(executionRequest(
      storage,
      "call_stdio_media",
      "fixture__media",
      {}
    ))).resolves.toMatchObject({
      result: {
        isError: false,
        content: [
          { type: "resource", kind: "image", mediaType: "image/png" },
          { type: "resource", kind: "artifact", mediaType: "application/octet-stream" }
        ]
      }
    })
    await expect(storage.listResourceProvenance({
      causeKind: "tool_execution",
      causeId: "toolx_2_call_stdio_media"
    })).resolves.toEqual([
      expect.objectContaining({
        cause: expect.objectContaining({ toolCallId: "call_stdio_media" }),
        resource: expect.objectContaining({ kind: "image", mediaType: "image/png" })
      }),
      expect.objectContaining({
        cause: expect.objectContaining({ toolCallId: "call_stdio_media" }),
        resource: expect.objectContaining({
          kind: "artifact",
          mediaType: "application/octet-stream"
        })
      })
    ])

    const controller = new AbortController()
    const cancelled = registry.execute({
      ...executionRequest(storage, "call_stdio_cancel", "fixture__hang", {}),
      signal: controller.signal
    })
    setTimeout(() => controller.abort(), 10)
    await expect(cancelled).resolves.toMatchObject({
      state: "recovery_required",
      invoked: true,
      recovery: { execution: { state: "recovery_required" } }
    })
    await expect(storage.listToolExecutions({})).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({
        toolCallId: "call_stdio_cancel",
        state: "recovery_required",
        error: expect.objectContaining({
          type: "ambiguous_tool_outcome",
          message: "MCP tool response was not observed."
        })
      })])
    )
    expect(JSON.stringify(await storage.listToolExecutions({}))).not.toContain(
      "Request was cancelled"
    )

    await client.stop()
    await client.stop()
    expect(client.status()).toEqual({ started: false, disposed: false })
    await client.start()
    const restartedRegistry = await client.createRegistry()
    expect(restartedRegistry.snapshot()).toEqual(admittedSnapshot)
    const unexpectedlyExited = activeProcess
    if (unexpectedlyExited === undefined) {
      throw new Error("managed MCP fixture process was not captured")
    }
    await unexpectedlyExited.terminate("cancelled")
    await expect(unexpectedlyExited.wait()).resolves.toMatchObject({
      cleanup: "completed",
      termination: "cancelled"
    })
    await waitFor(async () => !client.status().started)
    expect(client.status()).toEqual({ started: false, disposed: false })
    await client.start()
    expect((await client.createRegistry()).snapshot()).toEqual(admittedSnapshot)
    await client.dispose()
    await client.dispose()
    await expect(client.start()).rejects.toThrow("disposed")

    const changedExecution = await createMcpExecution({ providerRevision: "2" })
    const changedExecutionBinding = new WanexMcpRuntimeClient({
      id: "stdio-fixture",
      capabilityRevision: "fixture-v1",
      transport: {
        kind: "stdio",
        command: process.execPath,
        args: [fileURLToPath(new URL("./fixtures/stdio-server.mjs", import.meta.url))],
        cwd: fixtureRoot,
        execution: changedExecution
      },
      namePrefix: "fixture",
      connectTimeoutMs: 5_000,
      requestTimeoutMs: 5_000
    })
    await changedExecutionBinding.start()
    expect((await changedExecutionBinding.createRegistry()).snapshot()).not.toEqual(
      admittedSnapshot
    )
    await Promise.all([
      changedExecutionBinding.dispose(),
      changedExecutionBinding.dispose()
    ])
  })

  it("serves only a selected Runtime registry over stateless Streamable HTTP", async () => {
    const serverRegistry = new ToolRegistry()
    serverRegistry.register(new EchoTool())
    serverRegistry.register(new FailingTool())
    serverRegistry.register(new HangingTool())
    const approvalTool = new ApprovalProbeTool()
    serverRegistry.register(approvalTool)
    const deferredTool = new DeferredProbeTool()
    serverRegistry.register(deferredTool)
    const serverStorage = new MemoryToolExecutionStore()
    let nextServerExecution = 0
    const host = new WanexMcpHttpServerHost({
      registry: serverRegistry,
      resolveExecutionContext: async (request) => {
        const executionNumber = nextServerExecution
        nextServerExecution += 1
        return {
          principalId: "http-principal",
          sessionId: "http-session",
          inputId: `http-input-${executionNumber}`,
          turnId: `http-turn-${executionNumber}`,
          attemptId: `http-attempt-${executionNumber}`,
          sourceMessageId: `http-message-${executionNumber}`,
          jobId: `http-job-${executionNumber}`,
          workerId: "http-worker",
          leaseToken: `http-lease-${executionNumber}`,
          idempotencyKey: `http:${executionNumber}`,
          permissionPolicy: request.toolName === approvalTool.name
            ? new ApprovalRequiredToolsPolicy()
            : new AllowAllToolsPolicy(),
          storage: serverStorage
        }
      }
    })
    await host.start()
    await host.start()
    const client = new WanexMcpRuntimeClient({
      id: "http-fixture",
      capabilityRevision: "fixture-v1",
      transport: {
        kind: "streamable_http",
        url: host.url(),
        headers: { authorization: "Bearer mcp-http-test-secret" }
      },
      connectTimeoutMs: 5_000,
      requestTimeoutMs: 5_000
    })
    await client.start()
    const registry = await client.createRegistry()
    expect(registry.list().map((tool) => tool.name)).toEqual([
      "approval_probe",
      "echo",
      "fail",
      "hang"
    ])
    expect(JSON.stringify(registry.snapshot())).not.toContain(
      "mcp-http-test-secret"
    )

    const rawClient = new Client(
      { name: "wanex-deferred-probe", version: "0.0.0" },
      { capabilities: {} }
    )
    await rawClient.connect(
      new StreamableHTTPClientTransport(new URL(host.url())) as Transport
    )
    await expect(rawClient.callTool({
      name: "deferred_probe",
      arguments: { prompt: "must not execute" }
    })).rejects.toThrow(/deferred tool cannot be exposed/)
    expect(deferredTool.invocationCount).toBe(0)
    await expect(rawClient.callTool({
      name: "approval_probe",
      arguments: { prompt: "must wait" }
    })).rejects.toThrow(/tool execution requires approval/)
    expect(approvalTool.invocationCount).toBe(0)
    await expect(serverStorage.listToolExecutions({})).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({
        toolName: "approval_probe",
        state: "approval_required",
        approvalRevision: 0,
        attemptCount: 0
      })])
    )
    await rawClient.close()

    const localStorage = new MemoryToolExecutionStore()
    await expect(registry.execute(executionRequest(
      localStorage,
      "call_http_echo",
      "echo",
      { source: "http" }
    ))).resolves.toMatchObject({
      result: {
        isError: false,
        content: [
          { type: "text", text: '{"echo":{"source":"http"}}' },
          { type: "json", value: { echo: { source: "http" } } }
        ]
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
    await expect(cancelled).resolves.toMatchObject({
      state: "recovery_required",
      invoked: true,
      recovery: { execution: { state: "recovery_required" } }
    })
    await expect(localStorage.listToolExecutions({})).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({
        toolCallId: "call_http_cancel",
        state: "recovery_required"
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

  it("rejects unsafe stdio execution and bounds an unresponsive initialize", async () => {
    const unsafeExecution = await createMcpExecution({ supervised: false })
    expect(() => new WanexMcpRuntimeClient({
      id: "unsafe-stdio",
      capabilityRevision: "fixture-v1",
      transport: {
        kind: "stdio",
        command: process.execPath,
        args: ["-e", "setInterval(() => {}, 1000)"],
        cwd: fixtureRoot,
        execution: unsafeExecution
      },
      connectTimeoutMs: 50,
      requestTimeoutMs: 50
    })).toThrow("managed durable-supervisor execution")

    const execution = await createMcpExecution()
    let processStarts = 0
    let silentProcess: ManagedExecutionProcess | undefined
    const client = new WanexMcpRuntimeClient({
      id: "silent-stdio",
      capabilityRevision: "fixture-v1",
      transport: {
        kind: "stdio",
        command: process.execPath,
        args: ["-e", "process.stdin.resume();setInterval(() => {}, 1000)"],
        cwd: fixtureRoot,
        execution: {
          binding: execution.binding,
          process: {
            execute: execution.process.execute.bind(execution.process),
            async start(request) {
              processStarts += 1
              silentProcess = await execution.process.start(request)
              return silentProcess
            }
          }
        }
      },
      connectTimeoutMs: 50,
      requestTimeoutMs: 50
    })

    await expect(client.start()).rejects.toThrow()
    expect(processStarts).toBe(1)
    if (silentProcess === undefined) {
      throw new Error("silent MCP fixture process was not captured")
    }
    await expect(silentProcess.wait()).resolves.toMatchObject({
      cleanup: "completed",
      termination: "cancelled"
    })
    expect(client.status()).toEqual({ started: false, disposed: false })
    await Promise.all([client.dispose(), client.dispose()])
    expect(client.status()).toEqual({ started: false, disposed: true })
  })
})

async function createMcpExecution(options: {
  readonly supervised?: boolean
  readonly providerRevision?: string
} = {}): Promise<
  Pick<import("@wanex/runtime/execution").BorrowedExecutionScope, "binding" | "process">
> {
  const sequence = nextExecutionScope
  nextExecutionScope += 1
  const environment = new NativeExecutionEnvironment({
    environmentId: `mcp_test_${sequence}`,
    ...(options.providerRevision === undefined
      ? {}
      : { providerRevision: options.providerRevision }),
    strategy: options.supervised === false
      ? { kind: "direct" }
      : {
          kind: "supervised",
          childSupervisor: new NativeChildSupervisor({ serviceBin })
        },
    managedProcess: true
  })
  executionEnvironments.push(environment)
  const scope = await environment.bind({
    scopeId: `mcp_scope_${sequence}`,
    policy: {
      revision: 1,
      filesystem: {
        roots: [{ id: "mcp_fixture", effects: ["read"] }],
        maxReadBytes: 1,
        maxDirectoryEntries: 1
      },
      process: {
        oneShot: false,
        managed: true,
        cleanup: options.supervised === false
          ? "runtime_process_tree"
          : "durable_supervisor",
        environmentVariables: []
      },
      network: "unrestricted",
      isolation: "none",
      pty: false
    },
    fileSystemRoots: [{ id: "mcp_fixture", path: fixtureRoot }],
    ...(options.supervised === false
      ? {}
      : {
          supervisorClaim: {
            runId: `mcp_run_${sequence}`,
            attemptId: `mcp_attempt_${sequence}`,
            claimToken: createHash("sha256")
              .update(`mcp-claim-${sequence}`)
              .digest("hex")
          }
        })
  })
  return { binding: scope.binding, process: scope.process }
}

async function waitFor(check: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 1_000
  while (!(await check())) {
    if (Date.now() >= deadline) throw new Error("timed out waiting for MCP state")
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

function executionRequest(
  storage: TestToolExecutionStore,
  toolCallId: string,
  toolName: string,
  input: JsonValue
) {
  return {
    principalId: "local-principal",
    sessionId: "local-session",
    inputId: `input_${toolCallId}`,
    turnId: "local-turn",
    attemptId: "local-attempt",
    sourceMessageId: `message_${toolCallId}`,
    jobId: "local-job",
    workerId: "local-worker",
    leaseToken: "local-lease",
    call: {
      type: "tool_call" as const,
      id: `part_${toolCallId}`,
      toolCallId,
      toolName,
      input
    },
    idempotencyKey: `tool:local-turn:${toolCallId}`,
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
  readonly concurrency = "parallel_safe" as const
  readonly resultMode = "immediate" as const
  readonly runtimeBinding = createToolRuntimeBinding({
    implementationId: "wanex.test.mcp.failing",
    implementationRevision: "1"
  })

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
  readonly concurrency = "parallel_safe" as const
  readonly resultMode = "immediate" as const
  readonly runtimeBinding = createToolRuntimeBinding({
    implementationId: "wanex.test.mcp.hanging",
    implementationRevision: "1"
  })

  async invoke(invocation: ToolInvocation): Promise<never> {
    const signal = invocation.signal
    if (signal === undefined) throw new Error("HTTP hanging fixture requires an abort signal")
    if (!signal.aborted) {
      await new Promise<void>((resolve) => {
        signal.addEventListener("abort", () => resolve(), { once: true })
      })
    }
    throw new Error("HTTP hanging fixture completed cancellation cleanup")
  }
}

class DeferredProbeTool implements ToolDefinition {
  readonly name = "deferred_probe"
  readonly description = "Must not cross the request-response MCP boundary."
  readonly inputSchema = { type: "object", additionalProperties: true } as const
  readonly risk = "external" as const
  readonly idempotent = true
  readonly concurrency = "exclusive" as const
  readonly resultMode = "deferred" as const
  readonly runtimeBinding = createToolRuntimeBinding({
    implementationId: "wanex.test.mcp.deferred-probe",
    implementationRevision: "1"
  })
  invocationCount = 0

  async invoke(): Promise<never> {
    this.invocationCount += 1
    throw new Error("deferred MCP probe must be rejected before invocation")
  }
}

class ApprovalProbeTool implements ToolDefinition {
  readonly name = "approval_probe"
  readonly description = "Prove request-response MCP approval suspension."
  readonly inputSchema = { type: "object", additionalProperties: true } as const
  readonly risk = "external" as const
  readonly idempotent = false
  readonly concurrency = "exclusive" as const
  readonly resultMode = "immediate" as const
  readonly runtimeBinding = createToolRuntimeBinding({
    implementationId: "wanex.test.mcp.approval-probe",
    implementationRevision: "1"
  })
  invocationCount = 0

  async invoke() {
    this.invocationCount += 1
    return {
      outcome: "succeeded" as const,
      toolCallId: "unexpected",
      content: jsonToolResultContent({ unexpected: true })
    }
  }
}

class ApprovalRequiredToolsPolicy implements ToolPermissionPolicy {
  snapshot() {
    return createToolRuntimeBinding({
      implementationId: "wanex.test.mcp.approval-policy",
      implementationRevision: "1"
    })
  }

  async authorize() {
    return {
      status: "approval_required" as const,
      reason: "MCP approval probe requires a reviewer",
      presentation: {
        summary: "Allow the MCP approval probe?",
        details: [{ label: "Boundary", value: "request-response MCP" }]
      }
    }
  }
}

class MemoryToolExecutionStore implements TestToolExecutionStore {
  private readonly records = new Map<string, ToolExecutionRecord>()
  private readonly attempts = new Map<string, ToolExecutionAttemptRecord>()
  private readonly approvalSuspensions = new Map<
    string,
    ToolExecutionApprovalSuspensionReceipt
  >()
  private readonly approvalDecisions = new Map<
    string,
    {
      readonly request: ResolveToolExecutionApprovalRequest
      readonly receipt: ResolveToolExecutionApprovalReceipt
    }
  >()
  private readonly resources = new Map<string, ResourceRecord>()
  private readonly provenance = new Map<string, ResourceProvenanceRecord>()

  async deferToolExecution(): Promise<never> {
    throw new Error("MCP test store must not receive deferred Tool handoff")
  }

  async beginToolExecution(request: BeginToolExecutionRequest) {
    const existing = [...this.records.values()].find(
      (item) =>
        item.sourceMessageId === request.sourceMessageId &&
        item.toolCallId === request.toolCallId
    )
    if (existing !== undefined) {
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
      id: `toolx_${this.records.size}_${request.toolCallId}`,
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
      approvalRevision: 0,
      recoveryRevision: 0,
      createdAt: now,
      updatedAt: now
    }
    const invocationAttempt = request.state === "running"
      ? this.createAttempt(execution.id, request)
      : undefined
    const stored = invocationAttempt === undefined
      ? execution
      : { ...execution, currentInvocationAttemptId: invocationAttempt.id }
    this.records.set(stored.id, stored)
    const approvalSuspension = request.state === "approval_required"
      ? approvalSuspensionReceipt(request, stored)
      : undefined
    if (approvalSuspension !== undefined) {
      this.approvalSuspensions.set(stored.id, approvalSuspension)
    }
    return {
      execution: stored,
      ...(invocationAttempt === undefined ? {} : { invocationAttempt }),
      ...(approvalSuspension === undefined ? {} : { approvalSuspension }),
      created: true
    }
  }

  async finishToolExecution(request: FinishToolExecutionRequest) {
    const existing = this.records.get(request.executionId)
    if (existing === undefined) return null
    const attempt = this.attempts.get(request.invocationAttemptId)
    if (
      attempt === undefined ||
      attempt.executionId !== request.executionId ||
      attempt.sessionAttemptId !== request.sessionAttemptId ||
      attempt.workerId !== request.workerId
    ) {
      return null
    }
    this.attempts.set(attempt.id, {
      ...attempt,
      state: request.state,
      ...(request.error === undefined ? {} : { error: request.error }),
      finishedAt: Date.now(),
      updatedAt: Date.now()
    })
    const next: ToolExecutionRecord = {
      ...existing,
      state: request.state,
      ...(request.content === undefined ? {} : { content: request.content }),
      ...(request.contentDigest === undefined
        ? {}
        : { contentDigest: request.contentDigest }),
      ...(request.isError === undefined ? {} : { isError: request.isError }),
      ...(request.error === undefined ? {} : { error: request.error }),
      finishedAt: Date.now(),
      updatedAt: Date.now()
    }
    this.records.set(next.id, next)
    return next
  }

  async requireToolExecutionRecovery(
    request: RequireToolExecutionRecoveryRequest
  ): Promise<RequireToolExecutionRecoveryReceipt | null> {
    const existing = this.records.get(request.executionId)
    const toolAttempt = this.attempts.get(request.invocationAttemptId)
    if (
      existing === undefined ||
      toolAttempt === undefined ||
      existing.currentInvocationAttemptId !== toolAttempt.id ||
      existing.state !== "running" ||
      toolAttempt.state !== "running"
    ) {
      return null
    }
    const now = Date.now()
    const recoveryError = JSON.parse(
      JSON.stringify(request.evidence)
    ) as JsonValue
    const execution: ToolExecutionRecord = {
      ...existing,
      state: "recovery_required",
      recoveryRevision: existing.recoveryRevision + 1,
      recovery: request.evidence,
      error: recoveryError,
      updatedAt: now,
      finishedAt: now
    }
    const toolExecutionAttempt: ToolExecutionAttemptRecord = {
      ...toolAttempt,
      state: "recovery_required",
      error: recoveryError,
      updatedAt: now,
      finishedAt: now
    }
    this.records.set(execution.id, execution)
    this.attempts.set(toolExecutionAttempt.id, toolExecutionAttempt)
    return recoveryReceipt(request, execution, now)
  }

  async resolveToolExecutionRecovery(
    _request: ResolveToolExecutionRecoveryRequest
  ): Promise<ResolveToolExecutionRecoveryReceipt> {
    throw new Error("test store recovery decisions are not implemented")
  }

  async resolveToolExecutionApproval(
    request: ResolveToolExecutionApprovalRequest
  ): Promise<ResolveToolExecutionApprovalReceipt> {
    const prior = this.approvalDecisions.get(request.idempotencyKey)
    if (prior !== undefined) {
      if (JSON.stringify(prior.request) !== JSON.stringify(request)) {
        throw new Error("conflicting repeated tool approval decision")
      }
      return prior.receipt
    }
    const existing = this.records.get(request.executionId)
    const suspension = this.approvalSuspensions.get(request.executionId)
    if (
      existing === undefined ||
      suspension === undefined ||
      existing.state !== "approval_required" ||
      existing.principalId !== request.principalId ||
      existing.approvalRevision !== request.expectedApprovalRevision
    ) {
      throw new Error("tool approval decision is stale or unauthorized")
    }
    const now = Date.now()
    const approvalRevision = existing.approvalRevision + 1
    const deniedResult = request.decision === "deny"
      ? toolResultPart(
          existing.toolCallId,
          jsonToolResultContent({
            error: "approval_denied",
            message: request.reason
          }),
          true
        )
      : undefined
    const execution: ToolExecutionRecord = {
      ...existing,
      state: request.decision === "approve_once" ? "approved" : "denied",
      approvalRevision,
      ...(deniedResult === undefined
        ? {}
        : {
            content: deniedResult.content,
            contentDigest: deniedResult.contentDigest,
            isError: true,
            error: { reason: "approval_denied" },
            finishedAt: now
          }),
      updatedAt: now
    }
    this.records.set(execution.id, execution)
    const receipt: ResolveToolExecutionApprovalReceipt = {
      execution,
      approvalDecision: {
        id: `toolapproval_${execution.id}_${approvalRevision}`,
        executionId: execution.id,
        approvalRevision,
        decision: request.decision,
        principalId: request.principalId,
        reason: request.reason,
        idempotencyKey: request.idempotencyKey,
        action: "turn_requeued",
        createdAt: now
      },
      turn: { ...suspension.turn, state: "queued", updatedAt: now },
      job: { ...suspension.job, state: "ready", updatedAt: now }
    }
    this.approvalDecisions.set(request.idempotencyKey, { request, receipt })
    return receipt
  }

  async getResource(request: { readonly resourceId: string }) {
    return this.resources.get(request.resourceId) ?? null
  }

  async ingestResource(
    request: Parameters<TestToolExecutionStore["ingestResource"]>[0]
  ): Promise<ResourceRecord> {
    const sha256 = createHash("sha256").update(request.content).digest("hex")
    if (request.expectedSha256 !== undefined && request.expectedSha256 !== sha256) {
      throw new Error("test resource sha256 mismatch")
    }
    const existing = [...this.resources.values()].find(
      (resource) => resource.sha256 === sha256
    )
    if (existing !== undefined) return existing
    const now = Date.now()
    const record: ResourceRecord = {
      id: request.id ?? `resource_${sha256}`,
      logicalPath: request.logicalPath ?? `resources/${sha256}`,
      kind: request.kind ?? "artifact",
      origin: request.origin ?? "system",
      state: "available",
      ...(request.mediaType === undefined ? {} : { mediaType: request.mediaType }),
      ...(request.label === undefined ? {} : { label: request.label }),
      ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
      sizeBytes: request.content.byteLength,
      sha256,
      createdAt: now,
      updatedAt: now
    }
    this.resources.set(record.id, record)
    return record
  }

  async recordResourceProvenance(
    request: Parameters<TestToolExecutionStore["recordResourceProvenance"]>[0]
  ): Promise<ResourceProvenanceRecord> {
    const digest = createHash("sha256")
      .update(JSON.stringify(request))
      .digest("hex")
    const existing = this.provenance.get(digest)
    if (existing !== undefined) return existing
    const record: ResourceProvenanceRecord = {
      id: `provenance_${digest}`,
      ...request,
      digest,
      createdAt: Date.now()
    }
    this.provenance.set(digest, record)
    return record
  }

  async listResourceProvenance(request: {
    readonly causeKind?: "tool_execution" | "media_generation"
    readonly causeId?: string
  }): Promise<ResourceProvenanceRecord[]> {
    return [...this.provenance.values()].filter((record) => {
      if (request.causeKind !== undefined && record.cause.kind !== request.causeKind) {
        return false
      }
      if (request.causeId === undefined) return true
      return record.cause.kind === "tool_execution"
        ? record.cause.executionId === request.causeId
        : record.cause.operationId === request.causeId
    })
  }

  async getToolExecution(executionId: string) {
    return this.records.get(executionId) ?? null
  }

  async getToolExecutionByCall(request: {
    readonly turnId: string
    readonly sourceMessageId: string
    readonly toolCallId: string
  }) {
    return [...this.records.values()].find((record) =>
      record.turnId === request.turnId &&
      record.sourceMessageId === request.sourceMessageId &&
      record.toolCallId === request.toolCallId
    ) ?? null
  }

  async listToolExecutions(_request: unknown = {}) {
    return [...this.records.values()]
  }

  async listToolExecutionAttempts(request: { readonly executionId: string }) {
    return [...this.attempts.values()].filter(
      (attempt) => attempt.executionId === request.executionId
    )
  }

  private createAttempt(
    executionId: string,
    request: BeginToolExecutionRequest
  ): ToolExecutionAttemptRecord {
    const now = Date.now()
    const attempt: ToolExecutionAttemptRecord = {
      id: `toolattempt_${executionId}`,
      executionId,
      sessionAttemptId: request.attemptId,
      jobId: request.jobId,
      workerId: request.workerId,
      attemptNumber: 1,
      state: "running",
      startedAt: now,
      updatedAt: now
    }
    this.attempts.set(attempt.id, attempt)
    return attempt
  }
}

function approvalSuspensionReceipt(
  request: BeginToolExecutionRequest,
  execution: ToolExecutionRecord
): ToolExecutionApprovalSuspensionReceipt {
  const now = Date.now()
  return {
    execution,
    turn: {
      id: request.turnId,
      sessionId: request.sessionId,
      primaryInputId: request.inputId,
      jobId: request.jobId,
      state: "waiting",
      executionBinding: {
        digest: "test-binding",
        createdAt: now,
        modelEndpoint: {
          endpointId: "test-endpoint",
          endpointDigest: "test-endpoint-digest",
          connection: { id: "test-connection", providerId: "test-provider" },
          protocol: { id: "fake" },
          model: {
            id: "test-model",
            operations: ["conversation"],
            inputModalities: ["text"],
            outputModalities: ["text"],
            features: [],
            catalog: { source: "custom", catalogId: "mcp.test", revision: "1" }
          }
        },
        completion: { maxOutputTokens: 4_096 },
        capabilityRoutes: [],
        resources: [],
        recovery: { providerMaxAttempts: 1, idempotentToolMaxAttempts: 2 }
      },
      maxSteps: 1,
      currentAttemptId: request.attemptId,
      createdAt: now,
      updatedAt: now
    },
    attempt: {
      id: request.attemptId,
      sessionId: request.sessionId,
      turnId: request.turnId,
      inputId: request.inputId,
      jobId: request.jobId,
      attemptNumber: 1,
      workerId: request.workerId,
      leaseToken: request.leaseToken,
      state: "suspended",
      startedAt: now,
      updatedAt: now,
      finishedAt: now
    },
    job: {
      id: request.jobId,
      kind: "session.turn",
      queue: "default",
      state: "waiting",
      principalId: request.principalId,
      payload: {},
      scheduledAt: now,
      priority: 0,
      attempt: 1,
      maxAttempts: 1,
      retryPolicy: { strategy: "none" },
      createdAt: now,
      updatedAt: now
    }
  }
}

function recoveryReceipt(
  request: RequireToolExecutionRecoveryRequest,
  execution: ToolExecutionRecord,
  now: number
): RequireToolExecutionRecoveryReceipt {
  const recoveryError = JSON.parse(
    JSON.stringify(request.evidence)
  ) as JsonValue
  return {
    execution,
    turn: {
      id: request.turnId,
      sessionId: request.sessionId,
      primaryInputId: request.inputId,
      jobId: request.jobId,
      state: "recovery_required",
      executionBinding: {
        digest: "test-binding",
        createdAt: now,
        modelEndpoint: {
          endpointId: "test-endpoint",
          endpointDigest: "test-endpoint-digest",
          connection: {
            id: "test-connection",
            providerId: "test-provider"
          },
          protocol: { id: "fake" },
          model: {
            id: "test-model",
            operations: ["conversation"],
            inputModalities: ["text"],
            outputModalities: ["text"],
            features: [],
            catalog: {
              source: "builtin",
              catalogId: "mcp.test",
              revision: "1"
            }
          }
        },
        completion: { maxOutputTokens: 4_096 },
        capabilityRoutes: [],
        resources: [],
        recovery: {
          providerMaxAttempts: 1,
          idempotentToolMaxAttempts: 2
        }
      },
      maxSteps: 1,
      currentAttemptId: request.sessionAttemptId,
      createdAt: now,
      updatedAt: now
    },
    attempt: {
      id: request.sessionAttemptId,
      sessionId: request.sessionId,
      turnId: request.turnId,
      inputId: request.inputId,
      jobId: request.jobId,
      attemptNumber: 1,
      workerId: request.workerId,
      leaseToken: request.leaseToken,
      state: "recovery_required",
      error: recoveryError,
      startedAt: now,
      updatedAt: now,
      finishedAt: now
    },
    job: {
      id: request.jobId,
      kind: "session.turn",
      queue: "default",
      state: "failed",
      principalId: execution.principalId,
      payload: {},
      scheduledAt: now,
      priority: 0,
      attempt: 1,
      maxAttempts: 1,
      retryPolicy: { strategy: "none" },
      createdAt: now,
      updatedAt: now,
      finishedAt: now
    }
  }
}
