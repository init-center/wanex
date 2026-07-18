import type { SessionId } from "@wanex/protocol"
import type {
  ClaimedRun,
  RunOnceResult,
  RunToCompletionResult
} from "./types.js"
import type { RunControlDrainResult } from "./run-control.js"

export function cancelledRunOnceResult(
  sessionId: SessionId,
  claim: ClaimedRun,
  control: Extract<RunControlDrainResult, { readonly status: "cancelled" }>
): RunOnceResult {
  return {
    status: "cancelled",
    sessionId,
    inputId: claim.inputId,
    runId: claim.runId,
    ...(control.reason === undefined ? {} : { reason: control.reason })
  }
}

export function cancelledRunToCompletionResult(
  sessionId: SessionId,
  claim: ClaimedRun,
  steps: number,
  control: Extract<RunControlDrainResult, { readonly status: "cancelled" }>
): RunToCompletionResult {
  return {
    status: "cancelled",
    sessionId,
    inputId: claim.inputId,
    runId: claim.runId,
    steps,
    ...(control.reason === undefined ? {} : { reason: control.reason })
  }
}
