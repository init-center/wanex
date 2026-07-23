import type { SessionTurnControlRecord } from "@wanex/protocol"
import type { WanexSessionCore } from "../../sessions/index.js"
import type { ActiveTurnAttempt } from "./types.js"

export type TurnControlDrainResult =
  | { readonly status: "continue"; readonly steered: boolean }
  | { readonly status: "cancel_requested"; readonly reason?: string }
  | { readonly status: "interrupt_requested"; readonly reason?: string }

export async function drainTurnControls(
  session: WanexSessionCore,
  request: {
    readonly execution: ActiveTurnAttempt
    readonly applySteer: boolean
  }
): Promise<TurnControlDrainResult> {
  const cancellation = (
    await session.listTurns({
      sessionId: request.execution.sessionId,
      state: "cancel_requested"
    })
  ).find((turn) => turn.id === request.execution.turnId)
  if (cancellation !== undefined) {
    return {
      status: "cancel_requested",
      ...(cancellation.cancelReason === undefined
        ? {}
        : { reason: cancellation.cancelReason })
    }
  }
  const controls = await session.listTurnControls({
    sessionId: request.execution.sessionId,
    turnId: request.execution.turnId,
    attemptId: request.execution.attemptId,
    status: "pending",
    limit: 100
  })
  const interrupt = controls.find((control) => control.kind === "interrupt")
  if (interrupt !== undefined) {
    const receipt = await applyTurnControl(session, request.execution, interrupt)
    if (receipt === null) {
      throw new Error("turn control lost the scheduler lease")
    }
    if (receipt.effect === "interrupt_requested_cancel") {
      return {
        status: "interrupt_requested",
        ...(interrupt.reason === undefined ? {} : { reason: interrupt.reason })
      }
    }
    return { status: "continue", steered: false }
  }

  let steered = false
  if (request.applySteer) {
    for (const control of controls) {
      if (control.kind === "steer") {
        const receipt = await applyTurnControl(
          session,
          request.execution,
          control
        )
        if (receipt === null) {
          throw new Error("turn control lost the scheduler lease")
        }
        if (receipt.effect === "steer_promoted_input") {
          steered = true
        }
      }
    }
  }
  return { status: "continue", steered }
}

async function applyTurnControl(
  session: WanexSessionCore,
  execution: ActiveTurnAttempt,
  control: SessionTurnControlRecord
) {
  return await session.applyTurnControl({
    sessionId: execution.sessionId,
    turnId: execution.turnId,
    attemptId: execution.attemptId,
    controlId: control.id,
    jobId: execution.jobId,
    workerId: execution.workerId,
    leaseToken: execution.leaseToken
  })
}
