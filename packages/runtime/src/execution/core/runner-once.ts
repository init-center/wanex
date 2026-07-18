import { throwIfAborted } from "./cancellable.js"
import { failClaimedRun } from "./failure.js"
import type { AgentRunnerExecutionContext } from "./runner-context.js"
import { cancelledRunOnceResult } from "./runner-results.js"
import type { RunOnceRequest, RunOnceResult } from "./types.js"

export async function runAgentOnce(
  context: AgentRunnerExecutionContext,
  request: RunOnceRequest
): Promise<RunOnceResult> {
  throwIfAborted(request.signal, "agent run")
  const claim = await context.session.claimRunner({
    sessionId: request.sessionId,
    runnerId: context.runnerId,
    leaseMs: context.leaseMs
  })

  if (claim === null) {
    return {
      status: "idle",
      sessionId: request.sessionId
    }
  }

  try {
    throwIfAborted(request.signal, "agent run")
    const preProviderControl = await context.drainRunControls(
      request.sessionId,
      claim,
      { applySteer: true }
    )
    if (preProviderControl.status === "cancelled") {
      return cancelledRunOnceResult(
        request.sessionId,
        claim,
        preProviderControl
      )
    }
    const replayMessages = await context.buildReplayMessages(request.sessionId)
    throwIfAborted(request.signal, "agent run")
    await context.ensureClaimStillActive(request.sessionId, claim)
    const response = await context.runProviderCompletion(
      replayMessages,
      request.signal,
      claim,
      request.sessionId,
      request.budgetGrantId,
      1
    )

    throwIfAborted(request.signal, "agent run")
    const postProviderControl = await context.drainRunControls(
      request.sessionId,
      claim,
      { applySteer: false }
    )
    if (postProviderControl.status === "cancelled") {
      return cancelledRunOnceResult(
        request.sessionId,
        claim,
        postProviderControl
      )
    }
    await context.session.completeRun({
      sessionId: request.sessionId,
      runId: claim.runId,
      inputId: claim.inputId,
      runnerId: claim.runnerId,
      leaseToken: claim.leaseToken,
      assistantMessage: response.parts
    })
  } catch (error) {
    await failClaimedRun(context.session, request.sessionId, claim, error)
    throw error
  }

  return {
    status: "completed",
    sessionId: request.sessionId,
    inputId: claim.inputId,
    runId: claim.runId
  }
}
