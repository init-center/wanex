import type {
  BackendCapabilityReadModel,
  BackendCommandRegistryReadModel,
  BackendDiagnosticsOptions,
  BackendOverviewReadModel,
  BackendOverviewOptions,
  BackendOverviewAction,
  BackendOverviewCommandCategorySummary,
  BackendOverviewCommandRow,
  BackendOverviewRuntimeHost,
  BackendOverviewSessionRow,
  BackendStatus
} from "../model/index.js"
import type { AppDiagnosticsSnapshot } from "@wanex/app/diagnostics"
import type {
  BackendRecentSessionsReadModel
} from "../model/read-model.js"

export interface ReadBackendOverviewHost {
  status(): BackendStatus
  readAssistantCapabilities(): BackendCapabilityReadModel
  readAssistantCommands(): BackendCommandRegistryReadModel
  readDiagnostics(
    options?: BackendDiagnosticsOptions
  ): Promise<AppDiagnosticsSnapshot>
  readRecentSessions(request?: {
    readonly kind?: "chat" | "agent"
    readonly status?: "active" | "archived"
    readonly limit?: number
  }): Promise<BackendRecentSessionsReadModel>
}

export async function readBackendOverview(
  host: ReadBackendOverviewHost,
  options?: BackendOverviewOptions
): Promise<BackendOverviewReadModel> {
  const status = host.status()
  const capabilities = host.readAssistantCapabilities()
  const commands = host.readAssistantCommands()
  const [diagnostics, recentSessions, archivedSessions] = await Promise.all([
    host.readDiagnostics(options),
    host.readRecentSessions({
      kind: "agent",
      status: "active",
      limit: options?.recentSessionLimit ?? 5
    }),
    host.readRecentSessions({
      kind: "agent",
      status: "archived",
      limit: options?.recentSessionLimit ?? 5
    })
  ])
  const runtimeHost = projectRuntimeHostOverview(diagnostics)
  const diagnosticsSummary = projectDiagnosticsSummary(diagnostics)

  return {
    kind: "assistant.backend.overview",
    generatedAt: diagnostics.generatedAt,
    ready: !status.disposed,
    lifecycle: {
      disposed: status.disposed,
      ready: !status.disposed,
      shutdownCommandId: "assistant.shutdown"
    },
    runtimeHost: projectRuntimeHostOverview(diagnostics),
    provider: {
      ...(status.activeModelEndpointId === undefined
        ? {}
        : { activeEndpointId: status.activeModelEndpointId })
    },
    context: {
      configured: status.agentContext.configured,
      revision: status.agentContext.revision,
      monitorRunning: status.agentContextMonitor.running,
      monitorIntervalMs: status.agentContextMonitor.intervalMs,
      refreshCount: status.agentContextMonitor.refreshCount,
      instructionSources:
        status.agentContext.context?.instructionSources ?? 0,
      skillCount: status.agentContext.context?.skillNames.length ?? 0,
      activationToolRegistered:
        status.agentContext.context?.activationToolRegistered ?? false
    },
    extensions: {
      configured: status.extensions.configured,
      contributionCount: status.extensions.contributionCount,
      diagnosticCount: status.extensions.diagnosticCount,
      byDomain: status.extensions.byDomain
    },
    capabilities: {
      selectedCount: capabilities.selectedCount,
      notSelectedCount: capabilities.notSelectedCount,
      selectedIds: capabilities.capabilities
        .filter((item) => item.state === "enabled")
        .map((item) => item.id),
      notSelectedIds: capabilities.capabilities
        .filter((item) => item.state === "not_selected")
        .map((item) => item.id)
    },
    commands: {
      totalCount: commands.commands.length,
      builtinCount: commands.commands.filter(
        (command) => command.sourceKind === "builtin"
      ).length,
      extensionCount: commands.commands.filter(
        (command) => command.sourceKind !== "builtin"
      ).length,
      diagnosticCount: commands.diagnostics.length,
      categories: summarizeCommandCategories(commands),
      primary: commands.commands.slice(0, 5).map(projectCommand)
    },
    sessions: {
      recentCount: recentSessions.rows.length,
      recentLimit: recentSessions.limit,
      recent: recentSessions.rows.map(projectRecentSession),
      archivedCount: archivedSessions.rows.length,
      archived: archivedSessions.rows.map(projectRecentSession)
    },
    recommendedActions: projectRecommendedActions({
      diagnostics: diagnosticsSummary,
      runtimeHost,
      status,
      recentSessions
    }),
    diagnostics: diagnosticsSummary
  }
}

function projectRuntimeHostOverview(
  diagnostics: AppDiagnosticsSnapshot
): BackendOverviewRuntimeHost {
  const summaryDetail = readActivityDetail(
    diagnostics,
    "runtime-host-activity:summary"
  )
  const healthDetail = readActivityDetail(
    diagnostics,
    "runtime-host-activity:health"
  )
  const observed =
    summaryDetail !== undefined ||
    healthDetail !== undefined ||
    diagnostics.diagnostics.some(
      (item) =>
        item.source === "app" && item.code.startsWith("app.runtime_host.")
    )
  const started =
    readBoolean(healthDetail, "started") ??
    readBoolean(summaryDetail, "started") ??
    false
  const workerCount = readNumber(summaryDetail, "workerCount")
  const memoryWorkerCount = readNumber(summaryDetail, "memoryWorkerCount")
  const totalJobs = readNumber(summaryDetail, "totalJobs")
  const backlogCount = readNumber(summaryDetail, "backlogCount")
  const runningLeaseCount = readNumber(summaryDetail, "runningLeaseCount")
  const staleRunningLeaseCount = readNumber(
    summaryDetail,
    "staleRunningLeaseCount"
  )
  const loopCount = readNumber(healthDetail, "loopCount")
  const activeLoopCount = readNumber(healthDetail, "activeLoopCount")
  const stoppedLoopCount = readNumber(healthDetail, "stoppedLoopCount")
  const runCount = readNumber(healthDetail, "runCount")
  const failureCount = readNumber(healthDetail, "failureCount")
  const errorCount = readNumber(healthDetail, "errorCount")
  const attentionRequired =
    diagnostics.diagnostics.some(
      (item) =>
        item.source === "app" &&
        item.code.startsWith("app.runtime_host.") &&
        item.severity !== "info"
    ) ||
    backlogCount > 0 ||
    staleRunningLeaseCount > 0 ||
    stoppedLoopCount > 0 ||
    failureCount > 0 ||
    errorCount > 0

  return {
    observed,
    started,
    workerCount,
    memoryWorkerCount,
    totalJobs,
    backlogCount,
    runningLeaseCount,
    staleRunningLeaseCount,
    loopCount,
    activeLoopCount,
    stoppedLoopCount,
    runCount,
    failureCount,
    errorCount,
    attentionRequired
  }
}

function projectDiagnosticsSummary(
  diagnostics: AppDiagnosticsSnapshot
): BackendOverviewReadModel["diagnostics"] {
  return {
    generatedAt: diagnostics.generatedAt,
    totalCount: diagnostics.diagnostics.length,
    errorCount: diagnostics.diagnostics.filter(
      (item) => item.severity === "error"
    ).length,
    warningCount: diagnostics.diagnostics.filter(
      (item) => item.severity === "warning"
    ).length,
    infoCount: diagnostics.diagnostics.filter(
      (item) => item.severity === "info"
    ).length,
    activityCount: diagnostics.activity.length,
    top: diagnostics.diagnostics.slice(0, 5).map((item) => ({
      source: item.source,
      severity: item.severity,
      code: item.code,
      message: item.message
    }))
  }
}

function projectRecentSession(
  session: BackendRecentSessionsReadModel["rows"][number]
): BackendOverviewSessionRow {
  return {
    sessionId: session.sessionId,
    ...(session.title === undefined ? {} : { title: session.title }),
    kind: session.kind,
    status: session.status,
    revision: session.revision,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    ...(session.archivedAt === undefined ? {} : { archivedAt: session.archivedAt })
  }
}

function projectRecommendedActions(options: {
  readonly diagnostics: BackendOverviewReadModel["diagnostics"]
  readonly runtimeHost: BackendOverviewRuntimeHost
  readonly status: BackendStatus
  readonly recentSessions: BackendRecentSessionsReadModel
}): readonly BackendOverviewAction[] {
  const actions: BackendOverviewAction[] = []
  if (options.diagnostics.errorCount > 0 || options.diagnostics.warningCount > 0) {
    actions.push({
      id: "diagnostics.review",
      commandId: "assistant.diagnostics.detail.read",
      label: "Review Diagnostics",
      priority: 10,
      reason: "diagnostic_attention"
    })
  }
  if (options.runtimeHost.attentionRequired) {
    actions.push({
      id: "runtime.review",
      commandId: "assistant.diagnostics.detail.read",
      label: "Review Runtime",
      priority: 20,
      reason: "runtime_attention"
    })
  }
  if (!options.status.agentContext.configured) {
    actions.push({
      id: "context.refresh",
      commandId: "assistant.context.refresh",
      label: "Refresh Context",
      priority: 30,
      reason: "context_not_configured"
    })
  }
  if (options.recentSessions.rows.length === 0) {
    actions.push({
      id: "session.start",
      commandId: "assistant.agent.submit",
      label: "Start Session",
      priority: 40,
      reason: "no_recent_sessions"
    })
  }
  actions.push({
    id: "agent.submit",
    commandId: "assistant.agent.submit",
    label: "Submit Agent Turn",
    priority: 50,
    reason: "ready"
  })
  return actions.sort((left, right) => left.priority - right.priority)
}

function readActivityDetail(
  diagnostics: AppDiagnosticsSnapshot,
  id: string
): Readonly<Record<string, unknown>> | undefined {
  const detail: unknown = diagnostics.activity.find((item) => item.id === id)
    ?.detail
  if (typeof detail !== "object" || detail === null || Array.isArray(detail)) {
    return undefined
  }
  return detail as Readonly<Record<string, unknown>>
}

function readBoolean(
  record: Readonly<Record<string, unknown>> | undefined,
  key: string
): boolean | undefined {
  const value = record?.[key]
  return typeof value === "boolean" ? value : undefined
}

function readNumber(
  record: Readonly<Record<string, unknown>> | undefined,
  key: string
): number {
  const value = record?.[key]
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function summarizeCommandCategories(
  commands: BackendCommandRegistryReadModel
): readonly BackendOverviewCommandCategorySummary[] {
  const counts = new Map<string, number>()
  for (const command of commands.commands) {
    const category = command.category ?? "uncategorized"
    counts.set(category, (counts.get(category) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([category, count]) => ({ category, count }))
}

function projectCommand(
  command: BackendCommandRegistryReadModel["commands"][number]
): BackendOverviewCommandRow {
  return {
    id: command.id,
    title: command.title,
    sourceKind: command.sourceKind,
    trust: command.trust,
    ...(command.category === undefined ? {} : { category: command.category })
  }
}
