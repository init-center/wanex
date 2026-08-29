import type {
  TuiConversationOperation,
  TuiRenderedFrame,
  TuiSurfaceSnapshot
} from "../model.js"
import type { ReadGoalResult } from "@wanex/assistant/surface"
import { selectedSessionId } from "../selection.js"

export function renderTuiFrame(
  snapshot: TuiSurfaceSnapshot
): TuiRenderedFrame {
  const state = snapshot.status.ok ? snapshot.status.value.state : undefined
  const sessionId = selectedSessionId(state)
  const settings = snapshot.settings.ok ? snapshot.settings.value : undefined
  const eventCount = snapshot.events.ok ? snapshot.events.events.length : 0
  const assistantCommandCount = snapshot.commandCatalog.ok
    ? snapshot.commandCatalog.value.commands.length
    : 0
  const conversationState = snapshot.conversation.ok
    ? conversationStateFromResult(snapshot.conversation.value)
    : "unavailable"
  const goalState = snapshot.goal.ok
    ? goalStateFromResult(snapshot.goal.value)
    : "unavailable"
  const ready = snapshot.home.ok && snapshot.settings.ok
  const statusLabels = [
    ready ? "ready" : "not-ready",
    `mode:${settings?.renderer.mode ?? state?.mode ?? "unknown"}`,
    `layout:${settings?.renderer.layout ?? state?.layout ?? "unknown"}`,
    `model:${settings?.profile.activeModelEndpointId ?? "unknown"}`,
    `provider:${snapshot.home.ok ? snapshot.home.value.providerReadiness.status : "unknown"}`,
    `theme:${settings?.renderer.preferences.theme ?? state?.preferences.theme ?? "system"}`,
    `density:${settings?.renderer.preferences.density ?? state?.preferences.density ?? "comfortable"}`,
    `session:${sessionId ?? "none"}`
  ]
  const lines = [
    "Workbench",
    [
      `status:${ready ? "ready" : "not-ready"}`,
      `mode:${settings?.renderer.mode ?? state?.mode ?? "unknown"}`,
      `layout:${settings?.renderer.layout ?? state?.layout ?? "unknown"}`,
      `model:${settings?.profile.activeModelEndpointId ?? "unknown"}`,
      `theme:${settings?.renderer.preferences.theme ?? state?.preferences.theme ?? "system"}`,
      `density:${settings?.renderer.preferences.density ?? state?.preferences.density ?? "comfortable"}`,
      `session:${sessionId ?? "none"}`,
      `conversation:${conversationState}`,
      `goal:${goalState}`,
      `assistant-commands:${assistantCommandCount}`,
      `events:${eventCount}`,
      `diagnostics:${snapshot.diagnostics.length}`
    ].join(" | "),
    "",
    "Status",
    ...statusLabels.map((label) => `  ${label}`)
  ]
  return {
    kind: "tui.frame",
    generatedAt: snapshot.generatedAt,
    title: "Workbench",
    ready,
    mode: settings?.renderer.mode ?? state?.mode ?? "unknown",
    layout: settings?.renderer.layout ?? state?.layout ?? "unknown",
    ...(sessionId === undefined
      ? {}
      : { selectedSessionId: sessionId }),
    commandCount: snapshot.descriptor.ok
      ? snapshot.descriptor.value.commandCount
      : 0,
    assistantCommandCount,
    statusCount: statusLabels.length,
    diagnosticCount: snapshot.diagnostics.length,
    eventCount,
    lines,
    text: lines.join("\n")
  }
}

function goalStateFromResult(
  result: ReadGoalResult
): string {
  if (result.kind === "assistant.goal.found") return result.goal.state
  if (result.kind === "assistant.goal.missing") return "missing"
  return "no-session"
}

function conversationStateFromResult(
  result: TuiConversationOperation
): string {
  if (result.kind === "assistant.conversation-operation.found") {
    return result.operation.state
  }
  if (result.kind === "assistant.conversation-operation.rejected") {
    return "rejected"
  }
  if (result.kind === "assistant.conversation-operation.missing") {
    return "missing"
  }
  return "untracked"
}
