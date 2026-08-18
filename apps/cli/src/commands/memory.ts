import { sweepMemoryCompaction } from "@wanex/runtime/memory"
import type { ModelEndpointExecutionBinding } from "@wanex/protocol"
import type { CoreStore } from "@wanex/storage"

export async function memorySweepValue(
  storage: CoreStore,
  request: {
    readonly principalId: string
    readonly sessionLimit?: number
    readonly minimumTokenSavings?: number
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
    resolveModelEndpoint: async (sessionId) =>
      await latestTerminalModelEndpoint(storage, sessionId),
    ...(request.minimumTokenSavings === undefined
      ? {}
      : { policy: { minimumTokenSavings: request.minimumTokenSavings } }),
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
      ...compactionEvidenceSummary(job.payload),
      idempotencyKey: job.idempotencyKey
    })),
    skippedPlans: receipt.skippedPlans,
    plans: receipt.plans,
    idempotencyKeyPrefix: receipt.idempotencyKeyPrefix
  }
}

function compactionEvidenceSummary(payload: unknown): {
  readonly sessionId?: string
  readonly sourceDigest?: string
  readonly policyDigest?: string
  readonly cutSequence?: number
} {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return {}
  }
  const evidence = (payload as { readonly evidence?: unknown }).evidence
  if (typeof evidence !== "object" || evidence === null || Array.isArray(evidence)) {
    return {}
  }
  const record = evidence as Readonly<Record<string, unknown>>
  return {
    ...(typeof record.sessionId === "string"
      ? { sessionId: record.sessionId }
      : {}),
    ...(typeof record.sourceDigest === "string"
      ? { sourceDigest: record.sourceDigest }
      : {}),
    ...(typeof record.policyDigest === "string"
      ? { policyDigest: record.policyDigest }
      : {}),
    ...(typeof record.cutSequence === "number"
      ? { cutSequence: record.cutSequence }
      : {})
  }
}

async function latestTerminalModelEndpoint(
  storage: CoreStore,
  sessionId: string
): Promise<ModelEndpointExecutionBinding | null> {
  const [messages, turns] = await Promise.all([
    storage.listSessionMessages({ sessionId }),
    storage.listSessionTurns({ sessionId })
  ])
  const head = messages.reduce(
    (latest, message) =>
      latest === undefined || message.sequence > latest.sequence ? message : latest,
    undefined as (typeof messages)[number] | undefined
  )
  if (head === undefined) return null
  const turn = turns.find((candidate) => candidate.id === head.turnId)
  if (
    turn === undefined ||
    !["succeeded", "failed", "cancelled", "interrupted"].includes(turn.state)
  ) {
    return null
  }
  return turn.executionBinding.modelEndpoint
}
