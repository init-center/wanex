import type { SessionId, SessionRunControlRecord } from "@wanex/protocol"
import type { WanexSessionCore } from "../../sessions/index.js"
import type { ClaimedRun } from "./types.js"

export type RunControlDrainResult =
  | {
      readonly status: "continue"
    }
  | {
      readonly status: "cancelled"
      readonly reason?: string
    }

export async function drainRunControls(
  session: WanexSessionCore,
  request: {
    readonly sessionId: SessionId
    readonly claim: ClaimedRun
    readonly applySteer: boolean
  }
): Promise<RunControlDrainResult> {
  const controls = await session.listRunControls({
    sessionId: request.sessionId,
    runId: request.claim.runId,
    status: "pending",
    limit: 100
  })
  const interrupt = controls.find((control) => control.kind === "interrupt")
  if (interrupt !== undefined) {
    const receipt = await applyRunControl(session, request, interrupt)
    if (receipt === null) {
      throw new Error("agent run was cancelled or lease was lost")
    }
    if (receipt.effect === "interrupt_cancelled_run") {
      return {
        status: "cancelled",
        ...(interrupt.reason === undefined ? {} : { reason: interrupt.reason })
      }
    }
    return { status: "continue" }
  }

  if (!request.applySteer) {
    return { status: "continue" }
  }

  for (const control of controls) {
    if (control.kind !== "steer") {
      continue
    }
    const receipt = await applyRunControl(session, request, control)
    if (receipt === null) {
      throw new Error("agent run was cancelled or lease was lost")
    }
  }
  return { status: "continue" }
}

async function applyRunControl(
  session: WanexSessionCore,
  request: {
    readonly sessionId: SessionId
    readonly claim: ClaimedRun
  },
  control: SessionRunControlRecord
) {
  return await session.applyRunControl({
    sessionId: request.sessionId,
    runId: request.claim.runId,
    controlId: control.id,
    runnerId: request.claim.runnerId,
    leaseToken: request.claim.leaseToken
  })
}
