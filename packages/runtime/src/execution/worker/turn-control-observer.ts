import type { ActiveExecutionRegistration } from "../../jobs/active-abort.js"
import type { WanexSessionCore } from "../../sessions/index.js"

const CONTROL_OBSERVATION_INTERVAL_MS = 250

export interface TurnControlObserver {
  stop(): Promise<void>
}

export function startTurnControlObserver(request: {
  readonly session: WanexSessionCore
  readonly sessionId: string
  readonly turnId: string
  readonly attemptId: string
  readonly registration: ActiveExecutionRegistration
}): TurnControlObserver {
  let stopped = false
  let active: Promise<void> | undefined
  const poll = (): void => {
    if (stopped || active !== undefined) return
    active = observe(request)
      .catch(() => {})
      .finally(() => {
        active = undefined
      })
  }
  const timer = setInterval(poll, CONTROL_OBSERVATION_INTERVAL_MS)
  poll()
  return {
    async stop() {
      if (stopped) return
      stopped = true
      clearInterval(timer)
      await active
    }
  }
}

async function observe(request: {
  readonly session: WanexSessionCore
  readonly sessionId: string
  readonly turnId: string
  readonly attemptId: string
  readonly registration: ActiveExecutionRegistration
}): Promise<void> {
  const [cancelledTurns, controls] = await Promise.all([
    request.session.listTurns({
      sessionId: request.sessionId,
      state: "cancel_requested"
    }),
    request.session.listTurnControls({
      sessionId: request.sessionId,
      turnId: request.turnId,
      attemptId: request.attemptId,
      status: "pending"
    })
  ])
  const cancelled = cancelledTurns.find((turn) => turn.id === request.turnId)
  if (cancelled !== undefined) {
    request.registration.abort({
      kind: "cancel",
      message: cancelled.cancelReason ?? "durable turn cancellation requested"
    })
    return
  }
  const interrupt = controls.find((control) => control.kind === "interrupt")
  if (interrupt !== undefined) {
    request.registration.abort({
      kind: "interrupt",
      message: interrupt.reason ?? "durable turn interruption requested"
    })
  }
}
