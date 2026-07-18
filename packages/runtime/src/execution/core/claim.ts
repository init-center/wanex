import type { SessionId } from "@wanex/protocol"
import type { WanexSessionCore } from "../../sessions/index.js"
import type { ClaimedRun } from "./types.js"

export async function ensureClaimStillActive(
  session: WanexSessionCore,
  request: {
    readonly sessionId: SessionId
    readonly claim: ClaimedRun
    readonly leaseMs: number
  }
): Promise<void> {
  const heartbeat = await session.heartbeatRunner({
    sessionId: request.sessionId,
    runnerId: request.claim.runnerId,
    leaseToken: request.claim.leaseToken,
    leaseMs: request.leaseMs
  })
  if (heartbeat === null) {
    throw new Error("agent run was cancelled or lease was lost")
  }
}
