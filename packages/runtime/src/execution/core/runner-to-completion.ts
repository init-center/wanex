import { ProviderStreamError } from "../../provider/index.js"
import type {
  JsonValue,
  SessionMessageRecord,
  ToolCallMessagePart
} from "@wanex/protocol"
import { throwIfAborted } from "./cancellable.js"
import { readActiveAbortReason } from "../../jobs/active-abort.js"
import { isToolCall } from "./replay.js"
import {
  RecoveryEvidenceError,
  type AgentRunnerExecutionContext
} from "./runner-context.js"
import type { ExecuteTurnRequest, ExecuteTurnResult } from "./types.js"

export async function executeAgentTurn(
  context: AgentRunnerExecutionContext,
  request: ExecuteTurnRequest
): Promise<ExecuteTurnResult> {
  const execution = request.execution
  if (execution.maxSteps <= 0) {
    throw new Error("turn maxSteps must be positive")
  }
  let step = 0
  try {
    const checkpoint = await recoveryCheckpoint(context, execution)
    step = checkpoint.nextStep
    if (checkpoint.pendingToolBatch !== undefined) {
      const preRecoveryControl = await context.drainTurnControls(execution, false)
      if (preRecoveryControl.status !== "continue") {
        return await settleControlRequest(
          context,
          execution,
          checkpoint.pendingToolBatch.step,
          preRecoveryControl
        )
      }
      await resumeToolBatch(
        context,
        request,
        checkpoint.pendingToolBatch.step,
        checkpoint.pendingToolBatch.message,
        checkpoint.pendingToolBatch.calls
      )
      const postRecoveryControl = await context.drainTurnControls(execution, true)
      if (postRecoveryControl.status !== "continue") {
        return await settleControlRequest(
          context,
          execution,
          checkpoint.pendingToolBatch.step,
          postRecoveryControl
        )
      }
      step = checkpoint.pendingToolBatch.step + 1
    }
    for (; step <= execution.maxSteps; step += 1) {
      await request.heartbeat()
      throwIfAborted(request.signal, "agent turn")
      const preProviderControl = await context.drainTurnControls(execution, true)
      if (preProviderControl.status !== "continue") {
        return await settleControlRequest(
          context,
          execution,
          step - 1,
          preProviderControl
        )
      }

      const replayMessages = await context.buildReplayMessages(execution.sessionId)
      const completion = await context.runProviderCompletion(
        replayMessages,
        request.signal,
        execution,
        step
      )
      const response = completion.response
      await request.heartbeat()
      throwIfAborted(request.signal, "agent turn")
      const postProviderControl = await context.drainTurnControls(execution, false)
      if (postProviderControl.status !== "continue") {
        return await settleControlRequest(
          context,
          execution,
          step,
          postProviderControl
        )
      }

      const toolCalls = response.parts.filter(isToolCall)
      if (toolCalls.length === 0) {
        const final = await settleOrContinueAfterFinalProvider(
          context,
          execution,
          step,
          completion
        )
        if (final.status === "settled") return final.result
        continue
      }

      const providerReceipt = await context.session.finishProviderInvocation({
        ...executionIdentity(execution),
        invocationId: completion.invocationId,
        outcome: "succeeded",
        assistantMessage: response.parts,
        providerState: response.providerState
      })
      if (providerReceipt === null || providerReceipt.assistantMessage === undefined) {
        throw new Error("turn lost its lease before persisting provider output")
      }
      const assistantMessage = providerReceipt.assistantMessage
      const tools = context.tools
      if (tools === undefined) {
        throw new Error("tool calls require a tool registry")
      }
      await request.heartbeat()
      const preToolControl = await context.drainTurnControls(execution, false)
      if (preToolControl.status !== "continue") {
        return await settleControlRequest(
          context,
          execution,
          step,
          preToolControl
        )
      }
      const toolResults = await context.runToolBatch(
        tools,
        toolCalls,
        execution,
        assistantMessage.id,
        request.signal
      )
      await request.heartbeat()
      const toolMessage = await context.session.appendMessage({
        ...executionIdentity(execution),
        idempotencyKey: `turn:${execution.turnId}:step:${step}:tools`,
        role: "tool",
        content: toolResults
      })
      if (toolMessage === null) {
        throw new Error("turn lost its lease before persisting tool results")
      }
      const postToolControl = await context.drainTurnControls(execution, true)
      if (postToolControl.status !== "continue") {
        return await settleControlRequest(
          context,
          execution,
          step,
          postToolControl
        )
      }
    }
    throw new Error(`agent turn exceeded maxSteps: ${execution.maxSteps}`)
  } catch (error) {
    const normalized = error instanceof Error ? error : new Error(String(error))
    const abortReason = readActiveAbortReason(request.signal)
    if (
      abortReason?.kind === "lease_lost" ||
      abortReason?.kind === "host_shutdown"
    ) {
      throw normalized
    }
    const providerAmbiguous =
      error instanceof ProviderStreamError && error.detail.outputObserved
    if (
      abortReason !== undefined &&
      !providerAmbiguous &&
      (abortReason.kind === "cancel" || abortReason.kind === "interrupt")
    ) {
      const control = await context.drainTurnControls(execution, false)
      if (control.status !== "continue") {
        return await settleControlRequest(
          context,
          execution,
          Math.max(0, step - 1),
          control
        )
      }
      const settlement = await context.session.settleTurn({
        ...executionIdentity(execution),
        outcome: "recovery_required",
        error: {
          name: "RecoveryEvidenceError",
          message: "active abort has no matching durable turn control"
        },
        reason: "active abort has no matching durable turn control"
      })
      return {
        outcome: "recovery_required",
        steps: Math.max(0, step - 1),
        settlement,
        error: normalized
      }
    }
    const openProviderInvocation = (
      await context.session.listProviderInvocations({
        turnId: execution.turnId
      })
    ).some(
      (invocation) =>
        invocation.attemptId === execution.attemptId &&
        (invocation.state === "dispatched" ||
          invocation.state === "output_observed")
    )
    const outcome =
      error instanceof RecoveryEvidenceError ||
      providerAmbiguous ||
      openProviderInvocation
        ? "recovery_required"
        : "failed"
    const settlement = await context.session.settleTurn({
      ...executionIdentity(execution),
      outcome,
      error: ({
        name: normalized.name,
        message: normalized.message,
        ...(error instanceof ProviderStreamError
          ? { provider: error.detail }
          : {})
      } as unknown as JsonValue),
      reason: normalized.message
    })
    return {
      outcome,
      steps: Math.max(0, step - 1),
      settlement,
      error: normalized
    }
  }
}

async function recoveryCheckpoint(
  context: AgentRunnerExecutionContext,
  execution: ExecuteTurnRequest["execution"]
): Promise<{
  readonly nextStep: number
  readonly pendingToolBatch?: {
    readonly step: number
    readonly message: SessionMessageRecord
    readonly calls: readonly ToolCallMessagePart[]
  }
}> {
  const [messages, invocations] = await Promise.all([
    context.session.listMessages({ sessionId: execution.sessionId }),
    context.session.listProviderInvocations({ turnId: execution.turnId })
  ])
  const latest = invocations.at(-1)
  if (latest === undefined) return { nextStep: 1 }
  if (latest.state === "failed_before_output") {
    return { nextStep: latest.step }
  }
  if (latest.state !== "succeeded" || latest.assistantMessageId === undefined) {
    throw new RecoveryEvidenceError(
      `turn has no safe provider checkpoint: ${latest.state}`
    )
  }
  const assistant = messages.find(
    (message) => message.id === latest.assistantMessageId
  )
  if (assistant === undefined || assistant.turnId !== execution.turnId) {
    throw new RecoveryEvidenceError(
      "provider checkpoint assistant message is missing"
    )
  }
  const calls = assistant.content.filter(isToolCall)
  if (calls.length === 0) {
    const pendingSteer = await context.session.listTurnControls({
      sessionId: execution.sessionId,
      turnId: execution.turnId,
      attemptId: execution.attemptId,
      kind: "steer",
      status: "pending"
    })
    const promotedSteer = messages.some(
      (message) =>
        message.turnId === execution.turnId &&
        message.sequence > assistant.sequence &&
        message.role === "user" &&
        message.inputId !== execution.inputId
    )
    if (pendingSteer.length > 0 || promotedSteer) {
      return { nextStep: latest.step + 1 }
    }
    throw new RecoveryEvidenceError(
      "running turn contains an un-settled final assistant message"
    )
  }
  const toolMessages = messages.filter(
    (message) =>
      message.turnId === execution.turnId &&
      message.role === "tool" &&
      message.sequence > assistant.sequence
  )
  if (toolMessages.length === 0) {
    return {
      nextStep: latest.step,
      pendingToolBatch: { step: latest.step, message: assistant, calls }
    }
  }
  if (toolMessages.length !== 1 || !isExactToolBatch(toolMessages[0]!, calls)) {
    throw new RecoveryEvidenceError(
      "durable tool result batch does not match its assistant tool calls"
    )
  }
  return { nextStep: latest.step + 1 }
}

async function settleOrContinueAfterFinalProvider(
  context: AgentRunnerExecutionContext,
  execution: ExecuteTurnRequest["execution"],
  step: number,
  completion: Awaited<
    ReturnType<AgentRunnerExecutionContext["runProviderCompletion"]>
  >
): Promise<
  | { readonly status: "continue" }
  | { readonly status: "settled"; readonly result: ExecuteTurnResult }
> {
  if (await hasPendingSteer(context, execution)) {
    return await checkpointFinalProviderForSteer(
      context,
      execution,
      step,
      completion
    )
  }
  try {
    const response = completion.response
    const settlement = await context.session.settleTurn({
      ...executionIdentity(execution),
      outcome: "succeeded",
      providerInvocationId: completion.invocationId,
      assistantMessage: response.parts,
      providerState: response.providerState,
      result: { steps: step, finishReason: response.finish.reason }
    })
    return {
      status: "settled",
      result: { outcome: "succeeded", steps: step, settlement }
    }
  } catch (error) {
    const control = await context.drainTurnControls(execution, false)
    if (control.status !== "continue") {
      return {
        status: "settled",
        result: await settleControlRequest(context, execution, step, control)
      }
    }
    if (await hasPendingSteer(context, execution)) {
      return await checkpointFinalProviderForSteer(
        context,
        execution,
        step,
        completion
      )
    }
    throw error
  }
}

async function checkpointFinalProviderForSteer(
  context: AgentRunnerExecutionContext,
  execution: ExecuteTurnRequest["execution"],
  step: number,
  completion: Awaited<
    ReturnType<AgentRunnerExecutionContext["runProviderCompletion"]>
  >
): Promise<
  | { readonly status: "continue" }
  | { readonly status: "settled"; readonly result: ExecuteTurnResult }
> {
  const response = completion.response
  const receipt = await context.session.finishProviderInvocation({
    ...executionIdentity(execution),
    invocationId: completion.invocationId,
    outcome: "succeeded",
    assistantMessage: response.parts,
    providerState: response.providerState
  })
  if (receipt?.assistantMessage === undefined) {
    throw new Error("turn lost its lease while checkpointing provider output")
  }
  const control = await context.drainTurnControls(execution, true)
  if (control.status !== "continue") {
    return {
      status: "settled",
      result: await settleControlRequest(context, execution, step, control)
    }
  }
  if (!control.steered) {
    throw new RecoveryEvidenceError(
      "provider steering checkpoint has no promoted steer input"
    )
  }
  return { status: "continue" }
}

async function hasPendingSteer(
  context: AgentRunnerExecutionContext,
  execution: ExecuteTurnRequest["execution"]
): Promise<boolean> {
  const controls = await context.session.listTurnControls({
    sessionId: execution.sessionId,
    turnId: execution.turnId,
    attemptId: execution.attemptId,
    kind: "steer",
    status: "pending",
    limit: 1
  })
  return controls.length > 0
}

async function resumeToolBatch(
  context: AgentRunnerExecutionContext,
  request: ExecuteTurnRequest,
  step: number,
  assistantMessage: SessionMessageRecord,
  calls: readonly ToolCallMessagePart[]
): Promise<void> {
  await request.heartbeat()
  throwIfAborted(request.signal, "agent turn")
  const tools = context.tools
  if (tools === undefined) {
    throw new RecoveryEvidenceError(
      "incomplete durable tool batch requires a tool registry"
    )
  }
  const toolResults = await context.runToolBatch(
    tools,
    calls,
    request.execution,
    assistantMessage.id,
    request.signal
  )
  const toolMessage = await context.session.appendMessage({
    ...executionIdentity(request.execution),
    idempotencyKey: `turn:${request.execution.turnId}:step:${step}:tools`,
    role: "tool",
    content: toolResults
  })
  if (toolMessage === null) {
    throw new Error("turn lost its lease before persisting recovered tool results")
  }
}

function isExactToolBatch(
  message: SessionMessageRecord,
  calls: readonly ToolCallMessagePart[]
): boolean {
  if (message.content.length !== calls.length) return false
  const expected = new Set(calls.map((call) => call.toolCallId))
  const actual = message.content.flatMap((part) =>
    part.type === "tool_result" ? [part.toolCallId] : []
  )
  return actual.length === expected.size &&
    new Set(actual).size === actual.length &&
    actual.every((toolCallId) => expected.has(toolCallId))
}

async function settleControlRequest(
  context: AgentRunnerExecutionContext,
  execution: ExecuteTurnRequest["execution"],
  steps: number,
  control: Exclude<
    Awaited<ReturnType<AgentRunnerExecutionContext["drainTurnControls"]>>,
    { readonly status: "continue" }
  >
): Promise<ExecuteTurnResult> {
  if (control.status === "interrupt_requested") {
    return await settleInterrupted(context, execution, steps, control.reason)
  }
  const settlement = await context.session.settleTurn({
    ...executionIdentity(execution),
    outcome: "cancelled",
    ...(control.reason === undefined ? {} : { reason: control.reason })
  })
  return { outcome: "cancelled", steps, settlement }
}

async function settleInterrupted(
  context: AgentRunnerExecutionContext,
  execution: ExecuteTurnRequest["execution"],
  steps: number,
  reason: string | undefined
): Promise<ExecuteTurnResult> {
  const settlement = await context.session.settleTurn({
    ...executionIdentity(execution),
    outcome: "interrupted",
    ...(reason === undefined ? {} : { reason })
  })
  return { outcome: "interrupted", steps, settlement }
}

function executionIdentity(execution: ExecuteTurnRequest["execution"]) {
  return {
    sessionId: execution.sessionId,
    turnId: execution.turnId,
    attemptId: execution.attemptId,
    inputId: execution.inputId,
    jobId: execution.jobId,
    workerId: execution.workerId,
    leaseToken: execution.leaseToken
  }
}
