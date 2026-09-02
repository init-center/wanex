import type {
  DeferToolExecutionReceipt,
  RuntimeAbortSignal,
  RequireToolExecutionRecoveryReceipt,
  ToolExecutionApprovalSuspensionReceipt,
  ToolCallMessagePart,
  ToolResultMessagePart
} from "@wanex/protocol"
import type {
  BegunToolExecution,
  PreparedToolExecution,
  ToolExecutionRequest,
  ToolPermissionPolicy,
  ToolRegistry
} from "../../tools/index.js"
import { jsonToolResultContent, toolResultPart } from "../../tools/parts.js"
import {
  notifyAgentRuntimeExecutionStage,
  type AgentRuntimeExecutionStageObserver
} from "../stage.js"

export interface RunToolBatchRequest {
  readonly calls: readonly ToolCallMessagePart[]
  readonly principalId: string
  readonly sessionId: string
  readonly inputId: string
  readonly turnId: string
  readonly attemptId: string
  readonly sourceMessageId: string
  readonly jobId: string
  readonly workerId: string
  readonly leaseToken: string
  readonly permissionPolicy: ToolPermissionPolicy | undefined
  readonly storage: ToolExecutionRequest["storage"]
  readonly signal: RuntimeAbortSignal | undefined
  readonly timeoutMs: number | undefined
  readonly maxConcurrency: number
  readonly budgetGrantId: string | undefined
  readonly observeExecutionStage?: AgentRuntimeExecutionStageObserver
  readonly step?: number
}

export class ToolBatchRecoveryRequiredError extends Error {
  readonly recovery: RequireToolExecutionRecoveryReceipt

  constructor(recovery: RequireToolExecutionRecoveryReceipt) {
    super("tool batch requires recovery after an ambiguous outcome")
    this.name = "ToolBatchRecoveryRequiredError"
    this.recovery = recovery
  }
}

export class ToolBatchSuspendedError extends Error {
  readonly receipt: DeferToolExecutionReceipt

  constructor(receipt: DeferToolExecutionReceipt) {
    super("tool batch suspended for durable deferred execution")
    this.name = "ToolBatchSuspendedError"
    this.receipt = receipt
  }
}

export class ToolBatchApprovalRequiredError extends Error {
  readonly receipt: ToolExecutionApprovalSuspensionReceipt

  constructor(receipt: ToolExecutionApprovalSuspensionReceipt) {
    super("tool batch suspended for durable human approval")
    this.name = "ToolBatchApprovalRequiredError"
    this.receipt = receipt
  }
}

export async function runToolBatch(
  tools: ToolRegistry,
  request: RunToolBatchRequest
): Promise<ToolResultMessagePart[]> {
  if (!Number.isInteger(request.maxConcurrency) || request.maxConcurrency <= 0) {
    throw new Error("tool maxConcurrency must be a positive integer")
  }
  const deferredCalls = request.calls.filter(
    (call) => tools.get(call.toolName)?.resultMode === "deferred"
  )
  if (deferredCalls.length > 0 && request.calls.length !== 1) {
    return request.calls.map((call) =>
      toolResultPart(
        call.toolCallId,
        jsonToolResultContent({
          error: "deferred_tool_batch_unsupported",
          message:
            "a deferred tool must be the only tool call in its provider batch"
        }),
        true
      )
    )
  }
  const outcomes = new Array<
    Awaited<ReturnType<ToolRegistry["execute"]>>
  >(request.calls.length)
  const errors = new Array<unknown>(request.calls.length)
  const prepared = new Array<PreparedToolExecution>(request.calls.length)
  let recovery: RequireToolExecutionRecoveryReceipt | undefined
  let suspension: DeferToolExecutionReceipt | undefined
  let approval: ToolExecutionApprovalSuspensionReceipt | undefined

  notifyToolStage(request, "tool_batch_preflight_started")

  const prepareCall = async (index: number): Promise<void> => {
    const call = request.calls[index]!
    const executionRequest = toolExecutionRequest(request, call)
    const existing = await request.storage.getToolExecutionByCall({
      turnId: request.turnId,
      sourceMessageId: request.sourceMessageId,
      toolCallId: call.toolCallId
    })
    prepared[index] = await tools.prepareExecution(executionRequest, existing)
  }

  const executeCall = async (
    index: number,
    begun?: BegunToolExecution
  ): Promise<void> => {
    const call = request.calls[index]!
    if (begun?.reused !== undefined) {
      outcomes[index] = begun.reused
      return
    }
    if (request.signal?.aborted === true) {
      if (begun !== undefined) {
        const preparedCall = prepared[index]
        if (preparedCall === undefined) {
          throw new Error("cancelled tool execution was not preflighted")
        }
        outcomes[index] = await tools.cancelPreparedExecution(
          toolExecutionRequest(request, call),
          preparedCall,
          begun
        )
      } else {
        outcomes[index] = completedWithoutInvocation(cancelledBeforeStart(call))
      }
      return
    }
    const executionRequest = toolExecutionRequest(request, call)
    const preparedCall = prepared[index]
    if (preparedCall === undefined) {
      throw new Error("tool execution was not preflighted")
    }
    const outcome = await tools.executePrepared(
      executionRequest,
      preparedCall,
      begun
    )
    outcomes[index] = outcome
    if (outcome.state === "recovery_required") recovery = outcome.recovery
    if (outcome.state === "suspended") suspension = outcome.receipt
    if (outcome.state === "approval_required") approval = outcome.receipt
  }

  const runParallelGroup = async (
    indexes: readonly number[],
    begun: readonly BegunToolExecution[] = []
  ): Promise<void> => {
    let next = 0
    const workerCount = Math.min(request.maxConcurrency, indexes.length)
    await Promise.all(Array.from({ length: workerCount }, async () => {
      // Every parallel-safe call must reach a durable outcome. Stopping the
      // dispatch queue after the first ambiguous result can leave later calls
      // without evidence, making a batch impossible to reconcile safely.
      while (true) {
        const groupIndex = next
        next += 1
        const index = indexes[groupIndex]
        if (index === undefined) return
        try {
          await executeCall(index, begun[index])
        } catch (error) {
          errors[index] = error
        }
      }
    }))
  }

  let cursor = 0
  while (cursor < request.calls.length) {
    const call = request.calls[cursor]!
    const concurrency = tools.get(call.toolName)?.concurrency ?? "exclusive"
    if (concurrency === "exclusive") {
      try {
        await prepareCall(cursor)
        notifyToolStage(request, "tool_batch_preflight_completed")
        notifyToolStage(request, "tool_execution_begin_requested")
        const begun = await tools.beginPreparedExecution(
          toolExecutionRequest(request, call),
          prepared[cursor]!
        )
        notifyToolStage(request, "tool_execution_begin_completed")
        await executeCall(cursor, begun)
        if (outcomes[cursor]?.state === "completed") {
          notifyToolStage(request, "tool_execution_settled")
        }
      } catch (error) {
        errors[cursor] = error
      }
      cursor += 1
    } else {
      const indexes: number[] = []
      while (cursor < request.calls.length) {
        const candidate = request.calls[cursor]!
        if ((tools.get(candidate.toolName)?.concurrency ?? "exclusive") !== "parallel_safe") {
          break
        }
        indexes.push(cursor)
        cursor += 1
      }
      for (const index of indexes) await prepareCall(index)
      notifyToolStage(request, "tool_batch_preflight_completed")
      if (indexes.some((index) => prepared[index]?.permission.status === "approval_required")) {
        throw new Error("parallel-safe Tool group cannot require human approval")
      }
      // Establish every logical execution before any Tool can fence the Turn
      // for recovery. This keeps a parallel provider batch fully recoverable.
      const begun = new Array<BegunToolExecution>(request.calls.length)
      await Promise.all(indexes.map(async (index) => {
        notifyToolStage(request, "tool_execution_begin_requested")
        begun[index] = await tools.beginPreparedExecution(
          toolExecutionRequest(request, request.calls[index]!),
          prepared[index]!
        )
        notifyToolStage(request, "tool_execution_begin_completed")
      }))
      await runParallelGroup(indexes, begun)
      if (indexes.every((index) => outcomes[index]?.state === "completed")) {
        notifyToolStage(request, "tool_execution_settled")
      }
    }

    if (recovery !== undefined) {
      throw new ToolBatchRecoveryRequiredError(recovery)
    }
    if (suspension !== undefined) {
      throw new ToolBatchSuspendedError(suspension)
    }
    if (approval !== undefined) {
      throw new ToolBatchApprovalRequiredError(approval)
    }
    const firstError = errors.find((error) => error !== undefined)
    if (firstError !== undefined) throw firstError
  }

  return outcomes.map((outcome) => {
    if (outcome.state !== "completed") {
      throw new Error("non-completed tool batch outcome was not propagated")
    }
    return outcome.result
  })
}

function notifyToolStage(
  request: RunToolBatchRequest,
  stage: Parameters<typeof notifyAgentRuntimeExecutionStage>[1]["stage"]
): void {
  notifyAgentRuntimeExecutionStage(request.observeExecutionStage, {
    kind: "wanex-runtime.execution-stage",
    stage,
    sessionId: request.sessionId,
    inputId: request.inputId,
    turnId: request.turnId,
    jobId: request.jobId,
    attemptId: request.attemptId,
    ...(request.step === undefined ? {} : { step: request.step }),
    toolCount: request.calls.length
  })
}

function toolExecutionRequest(
  request: RunToolBatchRequest,
  call: ToolCallMessagePart
): ToolExecutionRequest {
  return {
    principalId: request.principalId,
    sessionId: request.sessionId,
    inputId: request.inputId,
    turnId: request.turnId,
    attemptId: request.attemptId,
    sourceMessageId: request.sourceMessageId,
    jobId: request.jobId,
    workerId: request.workerId,
    leaseToken: request.leaseToken,
    call,
    idempotencyKey: `tool:${request.sourceMessageId}:${call.toolCallId}`,
    storage: request.storage,
    ...(request.permissionPolicy === undefined
      ? {}
      : { permissionPolicy: request.permissionPolicy }),
    ...(request.signal === undefined ? {} : { signal: request.signal }),
    ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs }),
    ...(request.budgetGrantId === undefined
      ? {}
      : {
          budget: {
            grantId: request.budgetGrantId,
            storage: request.storage as ToolExecutionRequest["storage"] &
              import("@wanex/storage").SchedulerStore
          }
        })
  }
}

function cancelledBeforeStart(
  call: ToolCallMessagePart
): ToolResultMessagePart {
  return toolResultPart(
    call.toolCallId,
    jsonToolResultContent({
      error: "tool_cancelled",
      message: "tool invocation cancelled before start"
    }),
    true
  )
}

function completedWithoutInvocation(result: ToolResultMessagePart) {
  return {
    state: "completed" as const,
    permission: { status: "deny" as const, reason: "tool_cancelled" },
    result,
    invoked: false
  }
}
