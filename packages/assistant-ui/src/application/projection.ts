import type {
  Diagnostic,
  Snapshot,
  ViewModel
} from "./model.js"
import { projectProviderRunGate } from "./providers/readiness.js"
import {
  projectArchivedSessions,
  projectRecentSessions,
  resolveSelectedSessionTitle
} from "./sessions/projection.js"
import { projectCommandPalette } from "./commands/palette/projection.js"
import { buildActions } from "./view/actions.js"
import {
  projectAttachmentInput,
  projectSettings
} from "./view/settings.js"

export function buildViewModel(
  snapshot: Omit<Snapshot, "view">
): ViewModel {
  const state = snapshot.status.ok ? snapshot.status.value.state : undefined
  const settings = projectSettings(snapshot, state)
  const selectedSessionId = state?.selection?.kind === "session"
    ? state.selection.sessionId
    : undefined
  const recentSessions = projectRecentSessions({
    home: snapshot.home,
    selectedSessionId
  })
  const archivedSessions = projectArchivedSessions({
    home: snapshot.home
  })
  const selectedSessionTitle = resolveSelectedSessionTitle(recentSessions)
  const selectedTeamTitle =
    state?.selection?.kind === "team" && snapshot.team.state === "ready"
      ? snapshot.team.page?.conversation.title
      : undefined
  const commandPalette = projectCommandPalette(
    snapshot.commandCatalog
  )
  const providerRunGate = projectProviderRunGate(
    settings.profile.readiness
  )
  const attachmentInput = projectAttachmentInput(settings)
  return {
    title: selectedTeamTitle ?? selectedSessionTitle ?? "New conversation",
    ready:
      snapshot.descriptor.ok &&
      snapshot.status.ok &&
      snapshot.home.ok &&
      snapshot.settings.ok &&
      snapshot.modelEndpoints.ok &&
      snapshot.attachments.ok &&
      snapshot.teamList.ok,
    mode: settings.renderer.mode,
    layout: settings.renderer.layout,
    ...(state?.selection === undefined
      ? {}
      : { selection: { ...state.selection } }),
    ...(selectedSessionTitle === undefined ? {} : { selectedSessionTitle }),
    theme: settings.renderer.theme,
    density: settings.renderer.density,
    settings,
    sessionCount: recentSessions.length,
    recentSessions,
    archivedSessions,
    commandCount: snapshot.descriptor.ok
      ? snapshot.descriptor.value.commandCount
      : 0,
    commandPaletteCount: commandPalette.rows.length,
    eventCount: snapshot.events.ok ? snapshot.events.events.length : 0,
    workbenchState: snapshot.workbench.state,
    workbenchRowCount: snapshot.workbench.summary.rowCount,
    conversationCanSubmit:
      providerRunGate.canSubmitConversation && snapshot.conversation.canSubmit,
    conversationCanQueueFollowUp:
      providerRunGate.canSubmitConversation &&
      snapshot.conversation.canQueueFollowUp,
    conversationCanSteer:
      providerRunGate.canSubmitConversation && snapshot.conversation.canSteer,
    conversationCanCancel: snapshot.conversation.canCancel,
    conversationCanRegenerate: snapshot.conversation.canRegenerate,
    conversationState: snapshot.conversation.state,
    sideQueryCanStart:
      selectedSessionId !== undefined &&
      providerRunGate.canRun &&
      snapshot.sideQuery.state === "idle",
    sideQueryState: snapshot.sideQuery.state,
    planGenerationState: snapshot.plan.generation?.state ?? "idle",
    ...(snapshot.plan.proposal.kind === "assistant.plan-proposal.found"
      ? { planProposalState: snapshot.plan.proposal.proposal.state }
      : {}),
    planCanGenerate:
      selectedSessionId !== undefined &&
      providerRunGate.canRun &&
      snapshot.conversation.canSubmit &&
      snapshot.plan.generation?.state !== "running",
    goalState: snapshot.goal.state,
    goalCanStart:
      selectedSessionId !== undefined &&
      providerRunGate.canRun &&
      !isLiveGoalState(snapshot.goal.state),
    groupCount: snapshot.team.conversations.length,
    teamState: snapshot.team.state,
    teamCanSubmit:
      snapshot.team.state === "ready" &&
      snapshot.team.page !== undefined &&
      snapshot.team.page.conversation.activeAgentCount > 0 &&
      !snapshot.team.page.conversation.activeRound &&
      providerRunGate.canRun,
    team: snapshot.team,
    conversationAttachments: snapshot.attachments.ok
      ? snapshot.attachments.value.attachments
      : [],
    conversationAttachmentCanUpload:
      attachmentInput.canUpload && snapshot.conversation.canSubmit,
    conversationAttachmentAccept: attachmentInput.accept,
    conversationAttachmentMessage: attachmentInput.message,
    ...(snapshot.conversation.transientAssistantText === undefined
      ? {}
      : {
          transientAssistantText: snapshot.conversation.transientAssistantText
        }),
    ...(snapshot.workbench.summary.latestAssistantText === undefined
      ? {}
      : {
          latestAssistantText: snapshot.workbench.summary.latestAssistantText
        }),
    ...(snapshot.workbench.summary.latestUserText === undefined
      ? {}
      : { latestUserText: snapshot.workbench.summary.latestUserText }),
    operationStatus: snapshot.operationStatus,
    commandPreview: snapshot.commandPreview,
    commandExecution: snapshot.commandExecution,
    executionActivity: snapshot.executionActivity,
    commandPalette,
    providerRunGate,
    diagnostics: snapshot.diagnostics,
    actions: buildActions({
      recentSessions,
      archivedSessions,
      modelEndpoints: settings.profile.endpoints,
      commandPalette
    })
  }
}

function isLiveGoalState(state: ViewModel["goalState"]): boolean {
  return (
    state === "active" ||
    state === "paused" ||
    state === "blocked" ||
    state === "cancel_requested"
  )
}

export function projectDiagnostics(
  snapshot: Pick<
    Snapshot,
    | "descriptor"
    | "status"
    | "home"
    | "settings"
    | "modelEndpoints"
    | "commandCatalog"
    | "pluginManagement"
    | "scheduleList"
    | "attachments"
    | "teamList"
    | "events"
  >
): readonly Diagnostic[] {
  return [
    ...resultDiagnostic(
      snapshot.descriptor,
      "web.descriptor_failed",
      "descriptor"
    ),
    ...resultDiagnostic(
      snapshot.status,
      "web.status_failed",
      "status"
    ),
    ...resultDiagnostic(snapshot.home, "web.home_failed", "home"),
    ...resultDiagnostic(
      snapshot.settings,
      "web.settings_failed",
      "settings"
    ),
    ...resultDiagnostic(
      snapshot.modelEndpoints,
      "web.model_endpoints_failed",
      "model endpoints"
    ),
    ...resultDiagnostic(
      snapshot.commandCatalog,
      "web.command_catalog_failed",
      "command catalog"
    ),
    ...resultDiagnostic(
      snapshot.pluginManagement,
      "web.plugin_management_failed",
      "plugin management"
    ),
    ...resultDiagnostic(
      snapshot.scheduleList,
      "web.schedule_list_failed",
      "schedules"
    ),
    ...resultDiagnostic(
      snapshot.attachments,
      "web.attachments_failed",
      "conversation attachments"
    ),
    ...resultDiagnostic(
      snapshot.teamList,
      "web.team_list_failed",
      "group conversations"
    ),
    ...resultDiagnostic(
      snapshot.events,
      "web.events_failed",
      "events"
    )
  ]
}

function resultDiagnostic(
  result: {
    readonly ok: boolean
    readonly error?: { readonly message: string }
  },
  code: Diagnostic["code"],
  label: string
): readonly Diagnostic[] {
  if (result.ok) {
    return []
  }
  return [
    {
      code,
      severity:
        label === "events" || label === "plugin management" || label === "schedules"
          ? "warning"
          : "error",
      message: `${label} failed: ${result.error?.message ?? "unknown error"}`
    }
  ]
}
