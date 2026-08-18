import { sessionTurnJobIdentity } from "../execution/worker/index.js"
import type { WorkerRunOnceResult } from "../jobs/index.js"
import type {
  RuntimeHostSessionTurnResultObserver,
  RuntimeHostSessionTurnResultSignal
} from "./types.js"

export function observeRuntimeHostSessionTurnResult(
  result: WorkerRunOnceResult,
  observer: RuntimeHostSessionTurnResultObserver | undefined
): void {
  if (observer === undefined || result.status === "idle" || result.job === null) {
    return
  }
  const signal = projectRuntimeHostSessionTurnResult(result)
  if (signal === undefined) {
    return
  }
  try {
    observer(signal)
  } catch {
    // Advisory observers cannot affect durable worker settlement.
  }
}

function projectRuntimeHostSessionTurnResult(
  result: Exclude<WorkerRunOnceResult, { readonly status: "idle" }>
): RuntimeHostSessionTurnResultSignal | undefined {
  if (result.job === null || result.job.kind !== "session.turn") {
    return undefined
  }
  try {
    const identity = sessionTurnJobIdentity(result.job)
    return {
      kind: "wanex-runtime.session-turn-result",
      outcome: result.job.state === "waiting" ? "suspended" : result.status,
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
