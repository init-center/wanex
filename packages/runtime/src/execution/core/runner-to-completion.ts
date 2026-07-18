import type { ToolResultMessagePart } from "@wanex/protocol"
import { throwIfAborted } from "./cancellable.js"
import { failClaimedRun } from "./failure.js"
import { isToolCall } from "./replay.js"
import type { AgentRunnerExecutionContext } from "./runner-context.js"
import { cancelledRunToCompletionResult } from "./runner-results.js"
import type {
  RunToCompletionRequest,
  RunToCompletionResult
} from "./types.js"

export async function runAgentToCompletion(
  context: AgentRunnerExecutionContext,
  request: RunToCompletionRequest
): Promise<RunToCompletionResult> {
  throwIfAborted(request.signal, "agent run")
  const maxSteps = request.maxSteps ?? 8
  if (maxSteps <= 0) {
    throw new Error("maxSteps must be positive")
  }

  const claim = await context.session.claimRunner({
    sessionId: request.sessionId,
    runnerId: context.runnerId,
    leaseMs: context.leaseMs
  })

  if (claim === null) {
    return {
      status: "idle",
      sessionId: request.sessionId,
      steps: 0
    }
  }

  try {
    for (let step = 1; step <= maxSteps; step += 1) {
      throwIfAborted(request.signal, "agent run")
      await context.ensureClaimStillActive(request.sessionId, claim)
      const preProviderControl = await context.drainRunControls(
        request.sessionId,
        claim,
        { applySteer: true }
      )
      if (preProviderControl.status === "cancelled") {
        return cancelledRunToCompletionResult(
          request.sessionId,
          claim,
          step - 1,
          preProviderControl
        )
      }
      const replayMessages = await context.buildReplayMessages(request.sessionId)
      throwIfAborted(request.signal, "agent run")
      const response = await context.runProviderCompletion(
        replayMessages,
        request.signal,
        claim,
        request.sessionId,
        request.budgetGrantId,
        step
      )
      throwIfAborted(request.signal, "agent run")
      const postProviderControl = await context.drainRunControls(
        request.sessionId,
        claim,
        { applySteer: false }
      )
      if (postProviderControl.status === "cancelled") {
        return cancelledRunToCompletionResult(
          request.sessionId,
          claim,
          step,
          postProviderControl
        )
      }
      const toolCalls = response.parts.filter(isToolCall)

      if (toolCalls.length === 0) {
        await context.session.completeRun({
          sessionId: request.sessionId,
          runId: claim.runId,
          inputId: claim.inputId,
          runnerId: claim.runnerId,
          leaseToken: claim.leaseToken,
          assistantMessage: response.parts
        })

        return {
          status: "completed",
          sessionId: request.sessionId,
          inputId: claim.inputId,
          runId: claim.runId,
          steps: step
        }
      }

      await context.session.appendMessage({
        sessionId: request.sessionId,
        runId: claim.runId,
        inputId: claim.inputId,
        runnerId: claim.runnerId,
        leaseToken: claim.leaseToken,
        idempotencyKey: `run:${claim.runId}:step:${step}:assistant`,
        role: "assistant",
        content: response.parts
      })

      const tools = context.tools
      if (tools === undefined) {
        throw new Error("tool calls require a tool registry")
      }

      throwIfAborted(request.signal, "agent run")
      await context.ensureClaimStillActive(request.sessionId, claim)
      const preToolControl = await context.drainRunControls(
        request.sessionId,
        claim,
        { applySteer: true }
      )
      if (preToolControl.status === "cancelled") {
        return cancelledRunToCompletionResult(
          request.sessionId,
          claim,
          step,
          preToolControl
        )
      }
      const principalId = await context.principalId(
        request.sessionId,
        claim.inputId
      )
      const toolResults: ToolResultMessagePart[] = await context.runToolBatch(
        tools,
        toolCalls,
        {
          sessionId: request.sessionId,
          inputId: claim.inputId,
          runId: claim.runId,
          principalId
        },
        request.signal,
        request.budgetGrantId
      )

      throwIfAborted(request.signal, "agent run")
      const postToolControl = await context.drainRunControls(
        request.sessionId,
        claim,
        { applySteer: true }
      )
      if (postToolControl.status === "cancelled") {
        return cancelledRunToCompletionResult(
          request.sessionId,
          claim,
          step,
          postToolControl
        )
      }
      await context.session.appendMessage({
        sessionId: request.sessionId,
        runId: claim.runId,
        inputId: claim.inputId,
        runnerId: claim.runnerId,
        leaseToken: claim.leaseToken,
        idempotencyKey: `run:${claim.runId}:step:${step}:tools`,
        role: "tool",
        content: toolResults
      })
    }

    throw new Error(`agent run exceeded maxSteps: ${maxSteps}`)
  } catch (error) {
    await failClaimedRun(context.session, request.sessionId, claim, error)
    throw error
  }
}
