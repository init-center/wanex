import { createHash } from "node:crypto"
import type { ResourceInputEvidence, RuntimeAbortSignal } from "@wanex/protocol"
import { canonicalJson } from "../../provider/replay.js"
import type { ProviderResponseCandidate, ProviderTurnResult, PreparedProviderReplayMessage } from "../../provider/types.js"
import type { WanexSessionCore } from "../../sessions/core.js"
import type { ActiveTurnAttempt } from "./types.js"
import { throwIfAborted } from "./cancellable.js"

function digestCanonicalJson(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex")
}

export function providerInputResources(messages: readonly PreparedProviderReplayMessage[]): readonly ResourceInputEvidence[] {
  const resources = new Map<string, ResourceInputEvidence>()
  for (const message of messages) {
    for (const part of message.content) {
      const inputs = part.type === "resource" ? [part] : part.type === "tool_result"
        ? part.content.filter((item) => item.type === "resource") : []
      for (const item of inputs) {
        const evidence: ResourceInputEvidence = {
          resourceId: item.resourceId, sha256: item.sha256, sizeBytes: item.sizeBytes, kind: item.kind,
          ...(item.mediaType === undefined ? {} : { mediaType: item.mediaType })
        }
        const existing = resources.get(item.resourceId)
        if (existing !== undefined && digestCanonicalJson(existing) !== digestCanonicalJson(evidence)) {
          throw new Error("provider input resource evidence conflicts")
        }
        resources.set(item.resourceId, evidence)
      }
    }
  }
  if (resources.size > 64) throw new Error("provider inputs exceed 64 resources")
  return [...resources.values()]
}

export async function persistProviderResponse(
  session: WanexSessionCore,
  candidate: ProviderResponseCandidate,
  execution: ActiveTurnAttempt,
  invocationId: string,
  signal: RuntimeAbortSignal | undefined
): Promise<ProviderTurnResult> {
  const parts: ProviderTurnResult["parts"][number][] = []
  let hasImages = false
  for (const part of candidate.parts) {
    if (part.type !== "image_candidate") { parts.push(part); continue }
    hasImages = true
    throwIfAborted(signal, "provider image materialization")
    const resource = await session.ingestResource({
      content: part.bytes, kind: "image", origin: "model_output", mediaType: part.mimeType,
      expectedSha256: createHash("sha256").update(part.bytes).digest("hex")
    })
    parts.push({ type: "resource", id: part.id, resourceId: resource.id,
      sha256: resource.sha256, sizeBytes: resource.sizeBytes, kind: resource.kind,
      ...(resource.mediaType === undefined ? {} : { mediaType: resource.mediaType }) })
  }
  const response: ProviderTurnResult = { ...candidate, parts }
  if (!hasImages) return response
  throwIfAborted(signal, "provider image checkpoint")
  const checkpoint = await session.checkpointProviderInvocation({
    sessionId: execution.sessionId, turnId: execution.turnId, attemptId: execution.attemptId,
    inputId: execution.inputId, jobId: execution.jobId, workerId: execution.workerId,
    leaseToken: execution.leaseToken, invocationId, response,
    responseDigest: digestCanonicalJson(response)
  })
  if (checkpoint?.responseCheckpoint === undefined) {
    throw new Error("turn lost its lease while checkpointing provider images")
  }
  return checkpoint.responseCheckpoint
}
