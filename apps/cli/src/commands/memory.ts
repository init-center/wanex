import { sweepMemoryCompaction } from "@wanex/runtime/memory"
import type { CoreStore } from "@wanex/storage"

export async function memorySweepValue(
  storage: CoreStore,
  request: {
    readonly principalId: string
    readonly sessionLimit?: number
    readonly waterlineTokens?: number
    readonly minimumTokenSavings?: number
    readonly policyVersion?: string
    readonly idempotencyKeyPrefix?: string
  }
): Promise<unknown> {
  const receipt = await sweepMemoryCompaction({
    storage,
    principalId: request.principalId,
    sessions: {
      kind: "agent",
      status: "active",
      ...(request.sessionLimit === undefined
        ? {}
        : { limit: request.sessionLimit })
    },
    ...(request.waterlineTokens === undefined
      ? {}
      : { waterlineTokens: request.waterlineTokens }),
    ...(request.minimumTokenSavings === undefined
      ? {}
      : { minimumTokenSavings: request.minimumTokenSavings }),
    ...(request.policyVersion === undefined
      ? {}
      : { policy: { version: request.policyVersion } }),
    ...(request.idempotencyKeyPrefix === undefined
      ? {}
      : { idempotencyKeyPrefix: request.idempotencyKeyPrefix })
  })

  return {
    command: "memory-sweep",
    scannedSessionIds: receipt.scannedSessionIds,
    submittedJobs: receipt.submittedJobs.map((job) => ({
      id: job.id,
      kind: job.kind,
      state: job.state,
      sessionId: sessionIdFromPayload(job.payload),
      policyVersion: policyVersionFromPayload(job.payload),
      idempotencyKey: job.idempotencyKey
    })),
    skippedPlans: receipt.skippedPlans,
    plans: receipt.plans,
    idempotencyKeyPrefix: receipt.idempotencyKeyPrefix
  }
}

function sessionIdFromPayload(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return undefined
  }
  const value = (payload as { readonly sessionId?: unknown }).sessionId
  return typeof value === "string" ? value : undefined
}

function policyVersionFromPayload(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return undefined
  }
  const policy = (payload as { readonly policy?: unknown }).policy
  if (typeof policy !== "object" || policy === null || Array.isArray(policy)) {
    return undefined
  }
  const value = (policy as { readonly version?: unknown }).version
  return typeof value === "string" ? value : undefined
}
