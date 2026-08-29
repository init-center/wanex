import type { WorkspaceTaskRunState } from "@wanex/protocol"
import { recoverWorkspaceTask } from "./recovery.js"
import type { WorkspaceTaskStore } from "./storage.js"
import type {
  WorkspaceTaskRecoveryAdmissionEntry,
  WorkspaceTaskRecoveryAdmissionRequest,
  WorkspaceTaskRecoveryAdmissionResult,
  WorkspaceTaskRuntimeOptions
} from "./types.js"

const RECOVERY_STATES: readonly WorkspaceTaskRunState[] = [
  "preparing",
  "active",
  "collecting",
  "proposed",
  "releasing"
]
const DEFAULT_MAX_RUNS = 16
const DEFAULT_BUDGET_MS = 1_000
const MAX_RUNS = 100
const MAX_BUDGET_MS = 10_000

export async function recoverExpiredWorkspaceTasks(
  options: {
    readonly storage: WorkspaceTaskStore
    readonly readOnlyIsolation: WorkspaceTaskRuntimeOptions["readOnlyIsolation"]
    readonly writableIsolation: WorkspaceTaskRuntimeOptions["writableIsolation"]
    readonly repositoryId: string
    readonly ownerId: string
    readonly leaseMs: number
    readonly defaultWorkspaceId: string
    readonly executionEnvironment: WorkspaceTaskRuntimeOptions["executionEnvironment"]
  },
  request: WorkspaceTaskRecoveryAdmissionRequest = {}
): Promise<WorkspaceTaskRecoveryAdmissionResult> {
  const maxRuns = boundedInteger(
    request.maxRuns ?? DEFAULT_MAX_RUNS,
    1,
    MAX_RUNS,
    "maxRuns"
  )
  const budgetMs = boundedInteger(
    request.budgetMs ?? DEFAULT_BUDGET_MS,
    1,
    MAX_BUDGET_MS,
    "budgetMs"
  )
  const workspaceId = request.workspaceId ?? options.defaultWorkspaceId
  const startedAt = Date.now()
  const candidates = await findCandidates(
    options.storage,
    workspaceId,
    options.repositoryId,
    maxRuns,
    startedAt,
    budgetMs
  )
  const entries: WorkspaceTaskRecoveryAdmissionEntry[] = []
  const diagnostics: Array<
    WorkspaceTaskRecoveryAdmissionResult["diagnostics"][number]
  > = [...candidates.diagnostics]
  let remaining = candidates.remaining

  for (const candidate of candidates.runs) {
    if (Date.now() - startedAt >= budgetMs) {
      remaining = true
      addDiagnostic(diagnostics, "budget_exceeded")
      break
    }
    let outcome: WorkspaceTaskRecoveryAdmissionEntry["outcome"]
    try {
      await recoverWorkspaceTask(
        {
          storage: options.storage,
          readOnlyIsolation: options.readOnlyIsolation,
          writableIsolation: options.writableIsolation,
          repositoryId: options.repositoryId,
          ownerId: options.ownerId,
          leaseMs: options.leaseMs,
          executionEnvironment: options.executionEnvironment
        },
        { runId: candidate.run.id }
      )
      const finalSnapshot = await options.storage.getWorkspaceTaskRun({
        runId: candidate.run.id
      })
      outcome = classifyOutcome(finalSnapshot)
    } catch {
      outcome = "failed"
      addDiagnostic(diagnostics, "recovery_failed")
    }
    if (outcome === "failed") {
      remaining = true
      addDiagnostic(diagnostics, "recovery_failed")
    }
    entries.push({
      runId: candidate.run.id,
      previousState: candidate.run.state,
      outcome
    })
  }

  const released = entries.filter((entry) => entry.outcome === "released").length
  const attention = entries.filter((entry) => entry.outcome === "attention").length
  const skipped = entries.filter((entry) => entry.outcome === "skipped").length
  const failed = entries.filter((entry) => entry.outcome === "failed").length
  return {
    attempted: entries.length,
    released,
    attention,
    skipped,
    failed,
    remaining,
    entries,
    diagnostics
  }
}

async function findCandidates(
  storage: WorkspaceTaskStore,
  workspaceId: string,
  repositoryId: string,
  maxRuns: number,
  startedAt: number,
  budgetMs: number
): Promise<{
  readonly runs: Awaited<ReturnType<WorkspaceTaskStore["listWorkspaceTaskRuns"]>>
  readonly remaining: boolean
  readonly diagnostics: readonly WorkspaceTaskRecoveryAdmissionResult["diagnostics"][number][]
}> {
  const byId = new Map<
    string,
    Awaited<ReturnType<WorkspaceTaskStore["listWorkspaceTaskRuns"]>>[number]
  >()
  const diagnostics: Array<
    WorkspaceTaskRecoveryAdmissionResult["diagnostics"][number]
  > = []
  let remaining = false
  for (const state of RECOVERY_STATES) {
    if (Date.now() - startedAt >= budgetMs) {
      remaining = true
      addDiagnostic(diagnostics, "budget_exceeded")
      break
    }
    const rows = await storage.listWorkspaceTaskRuns({
      workspaceId,
      repositoryId,
      state,
      leaseExpiresBefore: Date.now(),
      limit: maxRuns + 1
    })
    if (rows.length > maxRuns) {
      remaining = true
      addDiagnostic(diagnostics, "limit_reached")
    }
    for (const row of rows) {
      byId.set(row.run.id, row)
    }
  }
  const runs = [...byId.values()]
    .sort((left, right) => left.run.updatedAt - right.run.updatedAt)
  if (runs.length > maxRuns) {
    remaining = true
    addDiagnostic(diagnostics, "limit_reached")
  }
  return {
    runs: runs.slice(0, maxRuns),
    remaining,
    diagnostics
  }
}

function classifyOutcome(
  snapshot: Awaited<ReturnType<WorkspaceTaskStore["getWorkspaceTaskRun"]>>
): WorkspaceTaskRecoveryAdmissionEntry["outcome"] {
  if (snapshot?.run.state === "released") {
    return "released"
  }
  if (snapshot?.run.state === "attention") {
    return "attention"
  }
  if (
    snapshot?.activeAttempt !== undefined &&
    snapshot.activeAttempt.leaseExpiresAt > Date.now()
  ) {
    return "skipped"
  }
  return "failed"
}

function addDiagnostic(
  diagnostics: Array<
    WorkspaceTaskRecoveryAdmissionResult["diagnostics"][number]
  >,
  code: WorkspaceTaskRecoveryAdmissionResult["diagnostics"][number]["code"]
): void {
  if (!diagnostics.some((diagnostic) => diagnostic.code === code)) {
    diagnostics.push({ code })
  }
}

function boundedInteger(
  value: number,
  minimum: number,
  maximum: number,
  label: string
): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `workspace task recovery ${label} must be an integer between ${minimum} and ${maximum}`
    )
  }
  return value
}
