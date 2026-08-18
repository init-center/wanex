import type { ContextEpochRecord, JsonValue, SessionRecord } from "@wanex/protocol"
import type { AppDiagnosticEntry } from "./diagnostics-types.js"
import type { MutableMemoryMaintenanceDiagnosticsSummary } from "./memory-diagnostics-summary.js"

export interface SessionEpochScan {
  readonly session: SessionRecord
  readonly activeEpochs: readonly ContextEpochRecord[]
}

export function projectSessionEpochDiagnostics(request: {
  readonly diagnostics: AppDiagnosticEntry[]
  readonly generatedAt: number
  readonly scans: readonly SessionEpochScan[]
  readonly staleAfterMs: number | undefined
  readonly summary: MutableMemoryMaintenanceDiagnosticsSummary
}): void {
  for (const scan of request.scans) {
    if (scan.activeEpochs.length === 0) {
      request.summary.noActiveEpochSessionCount += 1
      request.diagnostics.push({
        id: `memory-maintenance-session-no-active-epoch:${scan.session.id}`,
        source: "memory",
        severity: "warning",
        code: "memory.maintenance.session.no_active_epoch",
        message: "Memory maintenance session has no active context epoch",
        at: scan.session.updatedAt,
        detail: {
          sessionId: scan.session.id,
          sessionUpdatedAt: scan.session.updatedAt
        }
      })
      continue
    }

    request.summary.activeEpochCount += scan.activeEpochs.length
    const newestEpoch = newestEpochByUpdatedAt(scan.activeEpochs)
    request.diagnostics.push({
      id: `memory-maintenance-session-active-epoch:${scan.session.id}:${newestEpoch.id}`,
      source: "memory",
      severity: "info",
      code: "memory.maintenance.session.active_epoch",
      message: "Memory maintenance session has an active context epoch",
      at: newestEpoch.updatedAt,
      detail: epochDetail(newestEpoch)
    })

    if (
      request.staleAfterMs !== undefined &&
      request.generatedAt - newestEpoch.updatedAt > request.staleAfterMs
    ) {
      request.summary.staleEpochCount += 1
      request.diagnostics.push({
        id: `memory-maintenance-epoch-stale:${newestEpoch.id}`,
        source: "memory",
        severity: "warning",
        code: "memory.maintenance.epoch.stale",
        message: "Memory maintenance active epoch is stale",
        at: newestEpoch.updatedAt,
        detail: {
          ...epochDetail(newestEpoch),
          staleAfterMs: request.staleAfterMs,
          ageMs: request.generatedAt - newestEpoch.updatedAt
        }
      })
    }
  }
}

function newestEpochByUpdatedAt(
  epochs: readonly ContextEpochRecord[]
): ContextEpochRecord {
  return epochs.reduce((newest, epoch) =>
    epoch.updatedAt > newest.updatedAt ? epoch : newest
  )
}

function epochDetail(epoch: ContextEpochRecord): { readonly [key: string]: JsonValue } {
  return {
    epochId: epoch.id,
    sessionId: epoch.sessionId,
    jobId: epoch.jobId,
    state: epoch.state,
    generationState: epoch.generationState,
    generationAttempt: epoch.generationAttempt,
    maxProviderAttempts: epoch.maxProviderAttempts,
    cutSequence: epoch.cutSequence,
    cutMessageId: epoch.cutMessageId,
    retainedFromSequence: epoch.retainedFromSequence,
    retainedFromMessageId: epoch.retainedFromMessageId,
    sourceDigest: epoch.sourceDigest,
    policyDigest: epoch.policyDigest,
    endpointDigest: epoch.modelEndpoint.endpointDigest,
    requestDigest: epoch.requestDigest,
    ...(epoch.summaryDigest === undefined
      ? {}
      : { summaryDigest: epoch.summaryDigest }),
    tokenEstimateBefore: epoch.tokenEstimateBefore,
    tokenEstimateAfter: epoch.tokenEstimateAfter,
    tokenSavings: epoch.tokenSavings,
    updatedAt: epoch.updatedAt,
    ...(epoch.activatedAt === undefined ? {} : { activatedAt: epoch.activatedAt })
  }
}
