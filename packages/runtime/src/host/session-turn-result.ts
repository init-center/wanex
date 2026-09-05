import { sessionTurnJobIdentity } from "../execution/worker/index.js"
import type { WorkerRunOnceResult } from "../jobs/index.js"
import type {
  RuntimeHostSessionTurnLifecycleObserver,
  RuntimeHostSessionTurnLifecycleSignal
} from "./types.js"

export function observeRuntimeHostSessionTurnLifecycle(
  result: WorkerRunOnceResult,
  observer: RuntimeHostSessionTurnLifecycleObserver | undefined
): void {
  if (observer === undefined || result.status === "idle" || result.job === null) {
    return
  }
  const signal = projectRuntimeHostSessionTurnLifecycle(result)
  if (signal === undefined) {
    return
  }
  notifyRuntimeHostSessionTurnLifecycle(observer, signal)
}

function projectRuntimeHostSessionTurnLifecycle(
  result: Exclude<WorkerRunOnceResult, { readonly status: "idle" }>
): RuntimeHostSessionTurnLifecycleSignal | undefined {
  if (result.job === null || result.job.kind !== "session.turn") {
    return undefined
  }
  try {
    const identity = sessionTurnJobIdentity(result.job)
    return {
      kind: "wanex-runtime.session-turn-lifecycle",
      phase: result.job.state === "waiting" ? "suspended" : "terminal",
      reference: {
        sessionId: identity.sessionId,
        inputId: identity.inputId,
        turnId: identity.turnId,
        jobId: result.job.id
      }
    }
  } catch {
    return undefined
  }
}

export function notifyRuntimeHostSessionTurnLifecycle(
  observer: RuntimeHostSessionTurnLifecycleObserver | undefined,
  signal: RuntimeHostSessionTurnLifecycleSignal
): void {
  try {
    observer?.(signal)
  } catch {
    // Advisory observers cannot affect durable state transitions.
  }
}
