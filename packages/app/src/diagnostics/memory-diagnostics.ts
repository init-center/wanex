import type { CoreStore } from "@wanex/storage"
import type { AppActivityEntry, AppDiagnosticEntry } from "./diagnostics-types.js"
import {
  sortActivityEntries,
  sortDiagnosticEntries
} from "./diagnostics-sort.js"
import { projectJobDiagnostics } from "./memory-diagnostics-jobs.js"
import {
  buildEmptyMemoryMaintenanceSummary,
  type MemoryMaintenanceDiagnosticsSummary
} from "./memory-diagnostics-summary.js"
import { projectSessionEpochDiagnostics } from "./memory-diagnostics-session.js"

export type { MemoryMaintenanceDiagnosticsSummary } from "./memory-diagnostics-summary.js"

export interface MemoryMaintenanceDiagnosticsOptions {
  readonly sessionLimit?: number
  readonly jobLimit?: number
  readonly staleAfterMs?: number
  readonly now?: number
}

export interface MemoryMaintenanceDiagnosticsSnapshot {
  readonly generatedAt: number
  readonly diagnostics: readonly AppDiagnosticEntry[]
  readonly activity: readonly AppActivityEntry[]
  readonly summary: MemoryMaintenanceDiagnosticsSummary
}

export interface GetMemoryMaintenanceDiagnosticsSnapshotOptions
  extends MemoryMaintenanceDiagnosticsOptions {
  readonly storage: CoreStore
}

const defaultSessionLimit = 50
const defaultJobLimit = 50

export async function getMemoryMaintenanceDiagnosticsSnapshot(
  options: GetMemoryMaintenanceDiagnosticsSnapshotOptions
): Promise<MemoryMaintenanceDiagnosticsSnapshot> {
  const generatedAt = options.now ?? Date.now()
  const [sessions, jobs] = await Promise.all([
    options.storage.listSessions({
      kind: "agent",
      status: "active",
      limit: options.sessionLimit ?? defaultSessionLimit
    }),
    options.storage.listJobs({
      kind: "memory.compaction",
      limit: options.jobLimit ?? defaultJobLimit
    })
  ])
  const scans = await Promise.all(
    sessions.map(async (session) => ({
      session,
      activeEpochs: await options.storage.listContextEpochs({
        sessionId: session.id,
        state: "active"
      })
    }))
  )

  const diagnostics: AppDiagnosticEntry[] = []
  const activity: AppActivityEntry[] = []
  const summary = buildEmptyMemoryMaintenanceSummary(sessions.length)
  projectSessionEpochDiagnostics({
    diagnostics,
    generatedAt,
    scans,
    staleAfterMs: options.staleAfterMs,
    summary
  })
  projectJobDiagnostics({
    diagnostics,
    activity,
    generatedAt,
    jobs,
    summary
  })

  return {
    generatedAt,
    diagnostics: sortDiagnosticEntries(diagnostics),
    activity: sortActivityEntries(activity),
    summary
  }
}
