import type { SessionId } from "@wanex/protocol"
import type { WanexSessionCore } from "../../sessions/index.js"
import type { ClaimedRun } from "./types.js"

export async function failClaimedRun(
  session: WanexSessionCore,
  sessionId: SessionId,
  claim: ClaimedRun,
  error: unknown
): Promise<void> {
  await session.failRun({
    sessionId,
    runId: claim.runId,
    inputId: claim.inputId,
    runnerId: claim.runnerId,
    leaseToken: claim.leaseToken,
    error: errorPayload(error)
  })
}

function errorPayload(error: unknown): { readonly [key: string]: string } {
  if (error instanceof Error && error.name === "WanexTimeoutError") {
    return {
      type: "timeout",
      message: error.message
    }
  }
  return {
    type: "error",
    message: error instanceof Error ? error.message : String(error)
  }
}
