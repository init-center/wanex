import { describe, expect, it } from "vitest"
import type {
  BeginToolExecutionRequest,
  BeginToolExecutionReceipt,
  FinishToolExecutionRequest,
  JsonValue,
  RequireToolExecutionRecoveryReceipt,
  RequireToolExecutionRecoveryRequest,
  ResolveToolExecutionApprovalReceipt,
  ResolveToolExecutionApprovalRequest,
  ResolveToolExecutionRecoveryReceipt,
  ResolveToolExecutionRecoveryRequest,
  ResourceProvenanceRecord,
  ResourceRecord,
  ToolExecutionAttemptRecord,
  ToolExecutionApprovalSuspensionReceipt,
  ToolExecutionRecord
} from "@wanex/protocol"
import {
  AllowAllToolsPolicy,
  createToolRuntimeBinding,
  EchoTool,
  jsonToolResultContent,
  RiskBoundToolPolicy,
  ToolRegistry,
  toolResultPart,
  type ToolDefinition,
  type ToolExecutionResult,
  type ToolExecutionRequest,
  type ToolInvocation,
  type ToolPermissionDecision,
  type ToolPermissionRequest,
  type ToolResourceOutputPort
} from "../src/tools/index.js"
import { runToolBatch } from "../src/execution/core/tool-execution.js"

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

type TestToolExecutionStore = ToolExecutionRequest["storage"]

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
        idempotent: true,
        concurrency: "parallel_safe"
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
          outcome: "succeeded",
          toolCallId: invocation.toolCallId,
          content: jsonToolResultContent(null)
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
          outcome: "succeeded",
          toolCallId: invocation.toolCallId,
          content: jsonToolResultContent(null)
        }
      }
    })).toThrow("only JSON values")
    expect(() => registry.register({
      ...new EchoTool(),
      name: "unsafe_mutation",
      risk: "mutating",
      concurrency: "parallel_safe",
      async invoke(invocation) {
        return {
          outcome: "succeeded",
          toolCallId: invocation.toolCallId,
          content: jsonToolResultContent(null)
        }
      }
    })).toThrow("mutating tool cannot be parallel_safe")
    expect(() => registry.register({
      ...new EchoTool(),
      name: "result_only_presentation",
      presentResult() {
        return { summary: "Finished" }
      },
      async invoke(invocation) {
        return {
          outcome: "succeeded",
          toolCallId: invocation.toolCallId,
          content: jsonToolResultContent(null)
        }
      }
    })).toThrow("result presentation requires presentCall")
    expect(() => registry.register({
      ...new EchoTool(),
      name: "failure_only_presentation",
      presentFailure() {
        return { summary: "Failed" }
      },
      async invoke(invocation) {
        return {
          outcome: "succeeded",
          toolCallId: invocation.toolCallId,
          content: jsonToolResultContent(null)
        }
      }
    })).toThrow("failure presentation requires presentCall")
  })

  it("persists bounded Tool-owned activity evidence", async () => {
    const tool = new PresentedRecordingTool()
    const registry = new ToolRegistry()
    const storage = new MemoryToolExecutionStore()
    registry.register(tool)

    await expect(registry.execute(
      executionRequest(storage, "call_presented", tool.name)
    )).resolves.toMatchObject({ state: "completed", invoked: true })
    await expect(storage.listToolExecutions({})).resolves.toMatchObject([{
      activity: {
        call: {
          summary: "Record a value",
          details: [{ label: "Count", value: "2" }]
        },
        result: {
          summary: "Value recorded",
          details: [{ label: "Status", value: "Succeeded" }]
        }
      }
    }])
  })

  it("fails before Tool admission when call evidence is unsafe", async () => {
    const tool = new PresentedRecordingTool()
    tool.callSummary = "x".repeat(513)
    const registry = new ToolRegistry()
    const storage = new MemoryToolExecutionStore()
    registry.register(tool)

    await expect(registry.execute(
      executionRequest(storage, "call_unsafe_presentation", tool.name)
    )).rejects.toThrow("1 to 512 UTF-8 bytes")
    expect(storage.beginCalls).toBe(0)
    expect(tool.calls).toBe(0)
  })

  it("does not rewrite a completed Tool outcome when result evidence fails", async () => {
    const tool = new PresentedRecordingTool()
    tool.failResultPresentation = true
    const registry = new ToolRegistry()
    const storage = new MemoryToolExecutionStore()
    registry.register(tool)

    await expect(registry.execute(
      executionRequest(storage, "call_result_presentation_failure", tool.name)
    )).resolves.toMatchObject({
      state: "completed",
      invoked: true,
      result: { isError: false }
    })
    await expect(storage.listToolExecutions({})).resolves.toMatchObject([{
      state: "succeeded",
      activity: {
        call: { summary: "Record a value" }
      }
    }])
    expect((await storage.listToolExecutions({}))[0]?.activity).not.toHaveProperty(
      "result"
    )
  })

  it("persists bounded owner failure presentation without exposing the exception", async () => {
    const tool = new PresentedThrowingTool()
    const registry = new ToolRegistry()
    const storage = new MemoryToolExecutionStore()
    registry.register(tool)

    await expect(registry.execute(
      executionRequest(storage, "call_presented_failure", tool.name)
    )).resolves.toMatchObject({
      state: "completed",
      invoked: true,
      result: { isError: true }
    })
    const [execution] = await storage.listToolExecutions({})
    expect(execution).toMatchObject({
      state: "failed",
      activity: {
        call: { summary: "Attempt a recorded value" },
        result: {
          summary: "Value recording failed",
          details: [{ label: "Reason", value: "Exception" }]
        }
      }
    })
    expect(JSON.stringify(execution?.activity)).not.toContain(
      "private exception payload"
    )
    expect(execution?.error).toMatchObject({
      message: "private exception payload"
    })
    expect(tool.failureReasons).toEqual(["exception"])
  })

  it("keeps the real failure when failure presentation is invalid", async () => {
    const tool = new PresentedThrowingTool()
    tool.failFailurePresentation = true
    const registry = new ToolRegistry()
    const storage = new MemoryToolExecutionStore()
    registry.register(tool)

    await expect(registry.execute(
      executionRequest(storage, "call_invalid_failure_presentation", tool.name)
    )).resolves.toMatchObject({ state: "completed", result: { isError: true } })
    const [execution] = await storage.listToolExecutions({})
    expect(execution).toMatchObject({
      state: "failed",
      activity: { call: { summary: "Attempt a recorded value" } }
    })
    expect(execution?.activity).not.toHaveProperty("result")
  })

  it("uses result presentation, not failure presentation, for declared failures", async () => {
    const tool = new PresentedDeclaredFailureTool()
    const registry = new ToolRegistry()
    const storage = new MemoryToolExecutionStore()
    registry.register(tool)

    await expect(registry.execute(
      executionRequest(storage, "call_declared_failure", tool.name)
    )).resolves.toMatchObject({ state: "completed", result: { isError: true } })
    await expect(storage.listToolExecutions({})).resolves.toMatchObject([{
      state: "failed",
      activity: {
        result: { summary: "Value was rejected" }
      }
    }])
    expect(tool.failureCalls).toBe(0)
  })

  it("runs parallel-safe groups around exclusive barriers in provider order", async () => {
    const registry = new ToolRegistry()
    const first = controlledTool("first", "parallel_safe")
    const second = controlledTool("second", "parallel_safe")
    const barrier = controlledTool("barrier", "exclusive")
    const tail = controlledTool("tail", "parallel_safe")
    for (const controlled of [first, second, barrier, tail]) {
      registry.register(controlled.tool)
    }
    const storage = new MemoryToolExecutionStore()
    const run = runToolBatch(registry, {
      ...identity,
      calls: [first, second, barrier, tail].map(({ tool }, index) => ({
        type: "tool_call" as const,
        id: `part_${index}`,
        toolCallId: `call_${tool.name}`,
        toolName: tool.name,
        input: {}
      })),
      permissionPolicy: new AllowAllToolsPolicy(),
      storage,
      signal: undefined,
      timeoutMs: undefined,
      maxConcurrency: 2,
      budgetGrantId: undefined
    })

    await Promise.all([first.started.promise, second.started.promise])
    expect(barrier.started.settled).toBe(false)
    expect(tail.started.settled).toBe(false)

    second.release.resolve()
    await Promise.resolve()
    expect(barrier.started.settled).toBe(false)
    first.release.resolve()
    await barrier.started.promise
    expect(tail.started.settled).toBe(false)

    barrier.release.resolve()
    await tail.started.promise
    tail.release.resolve()

    await expect(run).resolves.toMatchObject([
      { toolCallId: "call_first", content: [{ value: { tool: "first" } }] },
      { toolCallId: "call_second", content: [{ value: { tool: "second" } }] },
      { toolCallId: "call_barrier", content: [{ value: { tool: "barrier" } }] },
      { toolCallId: "call_tail", content: [{ value: { tool: "tail" } }] }
    ])
  })

  it("admits every parallel-safe Tool before an ambiguous batch can fence the Turn", async () => {
    const registry = new ToolRegistry()
    const first = ambiguousParallelTool("ambiguous_first")
    const second = ambiguousParallelTool("ambiguous_second")
    registry.register(first)
    registry.register(second)
    const storage = new MemoryToolExecutionStore()

    await expect(runToolBatch(registry, {
      ...identity,
      calls: [first, second].map((tool, index) => ({
        type: "tool_call" as const,
        id: `part_ambiguous_${index}`,
        toolCallId: `call_${tool.name}`,
        toolName: tool.name,
        input: {}
      })),
      permissionPolicy: new AllowAllToolsPolicy(),
      storage,
      signal: undefined,
      timeoutMs: undefined,
      maxConcurrency: 2,
      budgetGrantId: undefined
    })).rejects.toThrow("tool batch requires recovery")

    expect(storage.beginCalls).toBe(2)
    expect(await storage.listToolExecutions({})).toEqual([
      expect.objectContaining({
        toolName: "ambiguous_first",
        state: "recovery_required"
      }),
      expect.objectContaining({
        toolName: "ambiguous_second",
        state: "recovery_required"
      })
    ])
  })

  it("durably cancels admitted Tools when a batch is aborted before invocation", async () => {
    const registry = new ToolRegistry()
    const first = controlledTool("cancel_first", "parallel_safe")
    const second = controlledTool("cancel_second", "parallel_safe")
    registry.register(first.tool)
    registry.register(second.tool)
    const storage = new MemoryToolExecutionStore()
    const controller = new AbortController()
    storage.onBegin = () => {
      if (storage.beginCalls === 2) controller.abort()
    }

    await expect(runToolBatch(registry, {
      ...identity,
      calls: [first, second].map((controlled, index) => ({
        type: "tool_call" as const,
        id: `part_cancel_${index}`,
        toolCallId: `call_${controlled.tool.name}`,
        toolName: controlled.tool.name,
        input: {}
      })),
      permissionPolicy: new AllowAllToolsPolicy(),
      storage,
      signal: controller.signal,
      timeoutMs: undefined,
      maxConcurrency: 2,
      budgetGrantId: undefined
    })).resolves.toMatchObject([
      { isError: true, content: [{ value: { error: "tool_cancelled" } }] },
      { isError: true, content: [{ value: { error: "tool_cancelled" } }] }
    ])

    expect(first.started.settled).toBe(false)
    expect(second.started.settled).toBe(false)
    expect(await storage.listToolExecutions({})).toEqual([
      expect.objectContaining({ toolName: "cancel_first", state: "cancelled" }),
      expect.objectContaining({ toolName: "cancel_second", state: "cancelled" })
    ])
  })

  it("suspends an exclusive Tool and reuses its persisted approval exactly once", async () => {
    const registry = new ToolRegistry()
    const tool = new RecordingTool()
    const storage = new MemoryToolExecutionStore()
    const policy = new ApprovalTestPolicy(tool.name)
    registry.register(tool)
    const request = {
      ...executionRequest(storage, "call_approval", tool.name),
      permissionPolicy: policy
    }

    const suspended = await registry.execute(request)
    expect(suspended).toMatchObject({
      state: "approval_required",
      invoked: false,
      permission: {
        status: "approval_required",
        presentation: { summary: "Approve the exact recording action" }
      },
      receipt: {
        execution: { state: "approval_required", approvalRevision: 0 },
        turn: { state: "waiting" },
        attempt: { state: "suspended" },
        job: { state: "waiting" }
      }
    })
    expect(tool.calls).toBe(0)
    expect(policy.calls).toBe(1)
    const execution = await storage.getToolExecutionByCall({
      turnId: identity.turnId,
      sourceMessageId: identity.sourceMessageId,
      toolCallId: request.call.toolCallId
    })
    if (execution === null) throw new Error("missing pending Tool approval")
    await storage.resolveToolExecutionApproval({
      executionId: execution.id,
      expectedApprovalRevision: 0,
      decision: "approve_once",
      principalId: identity.principalId,
      reason: "approved by unit reviewer",
      idempotencyKey: "approval:" + execution.id
    })

    await expect(registry.execute({
      ...request,
      attemptId: "attempt_after_approval",
      workerId: "worker_after_approval",
      leaseToken: "lease_after_approval"
    })).resolves.toMatchObject({ state: "completed", invoked: true })
    expect(policy.calls).toBe(1)
    expect(tool.calls).toBe(1)
    await expect(registry.execute({
      ...request,
      attemptId: "attempt_after_settlement",
      workerId: "worker_after_settlement",
      leaseToken: "lease_after_settlement"
    })).resolves.toMatchObject({ state: "completed", invoked: false })
    expect(policy.calls).toBe(1)
    expect(tool.calls).toBe(1)
  })

  it("preflights a parallel-safe group before any Tool admission or effect", async () => {
    const registry = new ToolRegistry()
    const first = controlledTool("parallel_first", "parallel_safe")
    const second = controlledTool("parallel_approval", "parallel_safe")
    registry.register(first.tool)
    registry.register(second.tool)
    const storage = new MemoryToolExecutionStore()
    const policy = new ApprovalTestPolicy(second.tool.name)

    await expect(runToolBatch(registry, {
      ...identity,
      calls: [first, second].map(({ tool }, index) => ({
        type: "tool_call" as const,
        id: `part_parallel_approval_${index}`,
        toolCallId: `call_${tool.name}`,
        toolName: tool.name,
        input: {}
      })),
      permissionPolicy: policy,
      storage,
      signal: undefined,
      timeoutMs: undefined,
      maxConcurrency: 2,
      budgetGrantId: undefined
    })).rejects.toThrow("approval-required Tool must be exclusive")
    expect(policy.calls).toBe(2)
    expect(storage.beginCalls).toBe(0)
    expect(first.started.settled).toBe(false)
    expect(second.started.settled).toBe(false)
  })

  it("rejects mixed and multiple deferred batches before Tool admission", async () => {
    const first = new NeverInvokedDeferredTool("deferred_first")
    const second = new NeverInvokedDeferredTool("deferred_second")
    const immediate = new EchoTool()
    const registry = new ToolRegistry()
    registry.register(first)
    registry.register(second)
    registry.register(immediate)

    for (const toolNames of [
      [first.name, immediate.name],
      [first.name, second.name]
    ]) {
      const storage = new MemoryToolExecutionStore()
      const result = await runToolBatch(registry, {
        ...identity,
        calls: toolNames.map((toolName, index) => ({
          type: "tool_call" as const,
          id: `part_deferred_batch_${index}`,
          toolCallId: `call_deferred_batch_${index}`,
          toolName,
          input: {}
        })),
        permissionPolicy: new AllowAllToolsPolicy(),
        storage,
        signal: undefined,
        timeoutMs: undefined,
        maxConcurrency: 2,
        budgetGrantId: undefined
      })
      expect(result).toHaveLength(2)
      expect(result.every((part) => part.isError)).toBe(true)
      expect(result.map((part) => part.content[0])).toMatchObject([
        { value: { error: "deferred_tool_batch_unsupported" } },
        { value: { error: "deferred_tool_batch_unsupported" } }
      ])
      expect(storage.beginCalls).toBe(0)
    }
    expect(first.calls).toBe(0)
    expect(second.calls).toBe(0)
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
      return {
        outcome: "succeeded",
        toolCallId: invocation.toolCallId,
        content: jsonToolResultContent(null)
      }
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
      idempotencyKey: "tool:call",
      resources: unavailableToolResources
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

  it("persists ambiguous outcomes and never reinvokes before reconciliation", async () => {
    const tool = new AmbiguousTool()
    const registry = new ToolRegistry()
    const storage = new MemoryToolExecutionStore()
    registry.register(tool)
    const request = executionRequest(storage, "call_ambiguous", tool.name)

    const outcome = await registry.execute(request)

    expect(outcome).toMatchObject({
      state: "recovery_required",
      invoked: true,
      recovery: {
        execution: {
          state: "recovery_required",
          recoveryRevision: 1,
          recovery: {
            type: "ambiguous_tool_outcome",
            reconciliationRef: "remote-operation-1"
          }
        },
        turn: { state: "recovery_required" },
        attempt: { state: "recovery_required" },
        job: { state: "failed" }
      }
    })
    expect(outcome).not.toHaveProperty("result")
    await expect(registry.execute(request)).rejects.toThrow(
      "requires reconciliation"
    )
    expect(tool.calls).toBe(1)
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
      result: {
        isError: true,
        content: [{ value: { error: "tool_timeout" } }]
      }
    })
    await expect(timeoutStorage.listToolExecutions({})).resolves.toMatchObject([
      {
        state: "cancelled",
        error: { reason: "timed_out" },
        activity: { result: { summary: "Wait timed out" } }
      }
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
      result: {
        isError: true,
        content: [{ value: { error: "tool_cancelled" } }]
      }
    })
    await expect(cancellationStorage.listToolExecutions({})).resolves.toMatchObject([
      {
        state: "cancelled",
        error: { reason: "aborted" },
        activity: { result: { summary: "Wait stopped" } }
      }
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
  concurrency: "parallel_safe"
  resultMode: "immediate"
  runtimeBinding: {
    implementationId: string
    implementationRevision: string
  }
  invoke: (invocation: ToolInvocation) => Promise<{
    outcome: "succeeded"
    toolCallId: string
    content: ReturnType<typeof jsonToolResultContent>
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
    concurrency: "parallel_safe",
    resultMode: "immediate",
    runtimeBinding: {
      implementationId: `wanex.test.${name}`,
      implementationRevision: "1"
    },
    async invoke(invocation) {
      calls.push("original")
      return {
        outcome: "succeeded",
        toolCallId: invocation.toolCallId,
        content: jsonToolResultContent(null)
      }
    }
  }
}

function executionRequest(
  storage: ToolExecutionRequest["storage"],
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
  storage: ToolExecutionRequest["storage"],
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
      concurrency: tool.concurrency,
      resultMode: tool.resultMode,
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
  readonly concurrency = "exclusive" as const
  readonly resultMode = "immediate" as const
  readonly runtimeBinding = createToolRuntimeBinding({
    implementationId: "wanex.test.tool.recording",
    implementationRevision: "1"
  })
  calls = 0
  lastInvocation: ToolInvocation | undefined

  async invoke(invocation: ToolInvocation): Promise<ToolExecutionResult> {
    this.calls += 1
    this.lastInvocation = invocation
    return {
      outcome: "succeeded" as const,
      toolCallId: invocation.toolCallId,
      content: jsonToolResultContent({ ok: true })
    }
  }
}

class PresentedRecordingTool extends RecordingTool {
  callSummary = "Record a value"
  failResultPresentation = false

  presentCall(input: JsonValue) {
    const count = typeof input === "object" && input !== null && !Array.isArray(input)
      ? (input as Readonly<Record<string, JsonValue>>).count
      : undefined
    return {
      summary: this.callSummary,
      details: [{ label: "Count", value: String(count) }]
    }
  }

  presentResult() {
    if (this.failResultPresentation) {
      throw new Error("presentation unavailable")
    }
    return {
      summary: "Value recorded",
      details: [{ label: "Status", value: "Succeeded" }]
    }
  }
}

class PresentedThrowingTool extends RecordingTool {
  override readonly name = "presented_throwing"
  failFailurePresentation = false
  failureReasons: string[] = []

  presentCall() {
    return { summary: "Attempt a recorded value" }
  }

  presentFailure(request: {
    readonly reason: "exception" | "cancelled" | "timed_out"
  }) {
    this.failureReasons.push(request.reason)
    if (this.failFailurePresentation) {
      throw new Error("failure presentation unavailable")
    }
    return {
      summary: "Value recording failed",
      details: [{ label: "Reason", value: "Exception" }]
    }
  }

  override async invoke(invocation: ToolInvocation): Promise<never> {
    this.calls += 1
    this.lastInvocation = invocation
    throw new Error("private exception payload")
  }
}

class PresentedDeclaredFailureTool extends PresentedRecordingTool {
  override readonly name = "presented_declared_failure"
  failureCalls = 0

  presentResult() {
    return {
      summary: "Value was rejected",
      details: [{ label: "Status", value: "Rejected" }]
    }
  }

  presentFailure(request: {
    readonly reason: "exception" | "cancelled" | "timed_out"
  }) {
    this.failureCalls += 1
    return { summary: `Unexpected ${request.reason}` }
  }

  override async invoke(invocation: ToolInvocation) {
    this.calls += 1
    this.lastInvocation = invocation
    return {
      outcome: "failed" as const,
      toolCallId: invocation.toolCallId,
      content: jsonToolResultContent({ reason: "declared" })
    }
  }
}

class ApprovalTestPolicy {
  calls = 0

  constructor(private readonly approvalToolName: string) {}

  snapshot() {
    return createToolRuntimeBinding({
      implementationId: "wanex.test.tool-policy.approval",
      implementationRevision: "1",
      configuration: { approvalToolName: this.approvalToolName }
    })
  }

  async authorize(
    request: ToolPermissionRequest
  ): Promise<ToolPermissionDecision> {
    this.calls += 1
    return request.call.toolName === this.approvalToolName
      ? {
          status: "approval_required",
          reason: "unit_review_required",
          presentation: {
            summary: "Approve the exact recording action",
            details: [{ label: "Tool", value: request.call.toolName }]
          },
          authorizationRef: "unit-policy:approval"
        }
      : { status: "allow", reason: "unit_policy_allow" }
  }
}

class IdempotentRecordingTool extends RecordingTool {
  override readonly name = "idempotent_record"
  override readonly idempotent = true
}

class AmbiguousTool implements ToolDefinition {
  readonly name = "ambiguous_remote"
  readonly description = "Lose a remote response after dispatch."
  readonly inputSchema = { type: "object", additionalProperties: true } as const
  readonly risk = "external" as const
  readonly idempotent = false
  readonly concurrency = "exclusive" as const
  readonly resultMode = "immediate" as const
  readonly runtimeBinding = createToolRuntimeBinding({
    implementationId: "wanex.test.tool.ambiguous-remote",
    implementationRevision: "1"
  })
  calls = 0

  async invoke(invocation: ToolInvocation) {
    this.calls += 1
    return {
      outcome: "ambiguous" as const,
      toolCallId: invocation.toolCallId,
      message: "remote response was lost",
      reconciliationRef: "remote-operation-1"
    }
  }
}

function ambiguousParallelTool(name: string): ToolDefinition {
  return {
    name,
    description: "Lose a remote response after dispatch.",
    inputSchema: { type: "object", additionalProperties: true },
    risk: "external",
    idempotent: false,
    concurrency: "parallel_safe",
    resultMode: "immediate",
    runtimeBinding: createToolRuntimeBinding({
      implementationId: `wanex.test.tool.${name}`,
      implementationRevision: "1"
    }),
    async invoke(invocation) {
      return {
        outcome: "ambiguous",
        toolCallId: invocation.toolCallId,
        message: "remote response was lost",
        reconciliationRef: `remote-${name}`
      }
    }
  }
}

class HangingTool implements ToolDefinition {
  readonly name = "hang"
  readonly description = "Wait until invocation control stops the call."
  readonly inputSchema = { type: "object", additionalProperties: true } as const
  readonly risk = "read_only" as const
  readonly idempotent = true
  readonly concurrency = "parallel_safe" as const
  readonly resultMode = "immediate" as const
  readonly runtimeBinding = createToolRuntimeBinding({
    implementationId: "wanex.test.tool.hanging",
    implementationRevision: "1"
  })

  presentCall() {
    return { summary: "Wait for completion" }
  }

  presentFailure(request: {
    readonly reason: "exception" | "cancelled" | "timed_out"
  }) {
    return {
      summary: request.reason === "timed_out" ? "Wait timed out" : "Wait stopped"
    }
  }

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

class NeverInvokedDeferredTool implements ToolDefinition {
  readonly description = "Suspend execution through durable media work."
  readonly inputSchema = { type: "object" } as const
  readonly risk = "external" as const
  readonly idempotent = true
  readonly concurrency = "exclusive" as const
  readonly resultMode = "deferred" as const
  readonly runtimeBinding
  calls = 0

  constructor(readonly name: string) {
    this.runtimeBinding = createToolRuntimeBinding({
      implementationId: `wanex.test.tool.${name}`,
      implementationRevision: "1"
    })
  }

  async invoke(): Promise<never> {
    this.calls += 1
    throw new Error("deferred batch validation invoked a Tool")
  }
}

class CleanupAwareTool implements ToolDefinition {
  readonly name = "cleanup_aware"
  readonly description = "Complete bounded cleanup after cancellation."
  readonly inputSchema = { type: "object", additionalProperties: true } as const
  readonly risk = "external" as const
  readonly idempotent = false
  readonly concurrency = "exclusive" as const
  readonly resultMode = "immediate" as const
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
      outcome: "failed" as const,
      toolCallId: invocation.toolCallId,
      content: jsonToolResultContent({ cleaned: true })
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
  beginCalls = 0
  onBegin: ((request: BeginToolExecutionRequest) => void) | undefined

  async deferToolExecution(): Promise<never> {
    throw new Error("deferred media handoff is not expected in this fixture")
  }

  async beginToolExecution(
    request: BeginToolExecutionRequest
  ): Promise<BeginToolExecutionReceipt> {
    this.beginCalls += 1
    this.onBegin?.(request)
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
      if (existing.state === "approved" && request.state === "approval_required") {
        const attempt = this.createAttempt(existing, request, existing.attemptCount + 1)
        const execution: ToolExecutionRecord = {
          ...existing,
          state: "running",
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
    const deniedResult = request.state === "denied"
      ? toolResultPart(
          request.toolCallId,
          jsonToolResultContent({
            error: "permission_denied",
            message: permissionReason(request.permission)
          }),
          true
        )
      : undefined
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
      ...(request.activity === undefined ? {} : { activity: request.activity }),
      state: request.state,
      attemptCount: request.state === "running" ? 1 : 0,
      idempotencyKey: request.idempotencyKey,
      approvalRevision: 0,
      recoveryRevision: 0,
      ...(deniedResult === undefined
        ? {}
        : {
            content: deniedResult.content,
            contentDigest: deniedResult.contentDigest,
            isError: true,
            error: { reason: "permission_denied" },
            finishedAt: now
          }),
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
    const approvalSuspension = request.state === "approval_required"
      ? testApprovalSuspension(request, stored)
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
    const next: ToolExecutionRecord = {
      ...existing,
      state: request.state,
      ...(request.content === undefined ? {} : { content: request.content }),
      ...(request.contentDigest === undefined
        ? {}
        : { contentDigest: request.contentDigest }),
      ...(request.isError === undefined ? {} : { isError: request.isError }),
      ...(request.resultPresentation === undefined || existing.activity === undefined
        ? {}
        : {
            activity: {
              ...existing.activity,
              result: request.resultPresentation
            }
          }),
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
    const attempt: ToolExecutionAttemptRecord = {
      ...toolAttempt,
      state: "recovery_required",
      error: recoveryError,
      updatedAt: now,
      finishedAt: now
    }
    this.records.set(execution.id, execution)
    this.attempts.set(attempt.id, attempt)
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
                source: "custom",
                catalogId: "test.model",
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
      turn: {
        ...suspension.turn,
        state: "queued",
        updatedAt: now
      },
      job: {
        ...suspension.job,
        state: "ready",
        updatedAt: now
      }
    }
    this.approvalDecisions.set(request.idempotencyKey, { request, receipt })
    return receipt
  }

  async getResource(): Promise<ResourceRecord | null> {
    return null
  }

  async ingestResource(): Promise<ResourceRecord> {
    throw new Error("unexpected resource publication in tool execution unit store")
  }

  async recordResourceProvenance(): Promise<ResourceProvenanceRecord> {
    throw new Error("unexpected resource provenance in tool execution unit store")
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

function testApprovalSuspension(
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
      executionBinding: testExecutionBinding(now),
      maxSteps: 4,
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

function testExecutionBinding(now: number) {
  return {
    digest: "test-binding",
    createdAt: now,
    modelEndpoint: {
      endpointId: "test-endpoint",
      endpointDigest: "test-endpoint-digest",
      connection: { id: "test-connection", providerId: "test-provider" },
      protocol: { id: "fake" },
      model: {
        id: "test-model",
        operations: ["conversation" as const],
        inputModalities: ["text" as const],
        outputModalities: ["text" as const],
        features: [],
        catalog: { source: "custom" as const, catalogId: "test.model", revision: "1" }
      }
    },
    completion: { maxOutputTokens: 4_096 },
    capabilityRoutes: [],
    resources: [],
    recovery: { providerMaxAttempts: 1, idempotentToolMaxAttempts: 2 }
  }
}

function permissionReason(value: JsonValue): string {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return "permission denied"
  }
  const record = value as { readonly [key: string]: JsonValue }
  return typeof record.reason === "string" ? record.reason : "permission denied"
}

function controlledTool(
  name: string,
  concurrency: "parallel_safe" | "exclusive"
): {
  readonly tool: ToolDefinition
  readonly started: Deferred<void>
  readonly release: Deferred<void>
} {
  const started = deferred<void>()
  const release = deferred<void>()
  return {
    started,
    release,
    tool: {
      name,
      description: `Controlled ${name} tool.`,
      inputSchema: { type: "object" },
      risk: "read_only",
      idempotent: true,
      concurrency,
      resultMode: "immediate",
      runtimeBinding: createToolRuntimeBinding({
        implementationId: `wanex.test.tool.${name}`,
        implementationRevision: "1"
      }),
      async invoke(invocation) {
        started.resolve()
        await release.promise
        return {
          outcome: "succeeded",
          toolCallId: invocation.toolCallId,
          content: jsonToolResultContent({ tool: name })
        }
      }
    }
  }
}

const unavailableToolResources: ToolResourceOutputPort = {
  async publish() {
    throw new Error("resource publication is unavailable in this direct Tool test")
  },
  async reference() {
    throw new Error("resource lookup is unavailable in this direct Tool test")
  }
}

interface Deferred<T> {
  readonly promise: Promise<T>
  readonly settled: boolean
  resolve(value: T): void
}

function deferred<T>(): Deferred<T> {
  let settled = false
  let resolvePromise!: (value: T) => void
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve
  })
  return {
    promise,
    get settled() { return settled },
    resolve(value) {
      if (settled) return
      settled = true
      resolvePromise(value)
    }
  }
}
