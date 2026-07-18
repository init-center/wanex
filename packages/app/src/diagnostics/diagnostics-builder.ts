import {
  connectorActivityProjection,
  connectorDiagnosticProjection
} from "./diagnostics-connector.js"
import { configUpdatedDiagnostic } from "./diagnostics-config.js"
import { pluginStateDiagnostic } from "./diagnostics-plugin.js"
import {
  sortActivityEntries,
  sortDiagnosticEntries
} from "./diagnostics-sort.js"
import { teamRoundDiagnostic } from "./diagnostics-team.js"
import type {
  AppActivityEntry,
  AppDiagnosticEntry,
  AppDiagnosticsSnapshot,
  BuildAppDiagnosticsSnapshotInput
} from "./diagnostics-types.js"
import { workspaceApplyPlanDiagnostics } from "./diagnostics-workspace.js"
import { memoryJobProjection, schedulerJobProjection } from "./job-projection.js"
import {
  runtimeHostHealthProjection,
  runtimeHostProjection
} from "./runtime-host-projection.js"

export function buildAppDiagnosticsSnapshot(
  input: BuildAppDiagnosticsSnapshotInput
): AppDiagnosticsSnapshot {
  const generatedAt = input.now ?? Date.now()
  const jobDetailMode = input.jobDetailMode ?? "summary"
  const diagnostics: AppDiagnosticEntry[] = []
  const activity: AppActivityEntry[] = []

  diagnostics.push(
    ...(input.connectorDiagnostics ?? []).map(connectorDiagnosticProjection)
  )
  activity.push(
    ...(input.connectorActivity ?? []).map(connectorActivityProjection)
  )
  diagnostics.push(...(input.config ?? []).map(configUpdatedDiagnostic))

  for (const job of input.jobs ?? []) {
    const projected = job.kind === "memory.compaction"
      ? memoryJobProjection(job, jobDetailMode)
      : schedulerJobProjection(job, jobDetailMode)
    diagnostics.push(projected.diagnostic)
    activity.push(projected.activity)
  }

  diagnostics.push(...(input.memoryMaintenance?.diagnostics ?? []))
  activity.push(...(input.memoryMaintenance?.activity ?? []))
  diagnostics.push(
    ...workspaceApplyPlanDiagnostics(input.workspaceApplyPlan, generatedAt)
  )

  if (input.teamRound !== undefined) {
    diagnostics.push(teamRoundDiagnostic(input.teamRound, generatedAt))
  }

  if (input.runtimeHost !== undefined) {
    const projected = runtimeHostProjection(input.runtimeHost)
    diagnostics.push(...projected.diagnostics)
    activity.push(...projected.activity)
  }
  if (input.runtimeHostHealth !== undefined) {
    const projected = runtimeHostHealthProjection(input.runtimeHostHealth)
    diagnostics.push(...projected.diagnostics)
    activity.push(...projected.activity)
  }

  for (const manifest of input.plugin?.manifests ?? []) {
    diagnostics.push(pluginStateDiagnostic("manifest", manifest))
  }

  for (const install of input.plugin?.installs ?? []) {
    diagnostics.push(pluginStateDiagnostic("install", install))
  }

  return {
    generatedAt,
    diagnostics: sortDiagnosticEntries(diagnostics),
    activity: sortActivityEntries(activity)
  }
}
