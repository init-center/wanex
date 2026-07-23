import type {
  ProductAppWebActionDescriptor,
  ProductAppWebActionFieldDescriptor,
  ProductAppWebConversationViewModel,
  ProductAppWebRecentSessionRow,
  ProductAppWebSnapshot,
  ProductAppWebWorkbenchTranscriptRow,
  ProductAppWebWorkbenchViewModel
} from "./types.js"
import {
  renderProductAppWebProviderRunGate
} from "./provider-run-gate-render.js"
import {
  renderProductAppWebCommandPreview
} from "./command-preview-render.js"
import {
  renderProductAppWebOperationStatus
} from "./operation-status-render.js"
import {
  escapeHtml
} from "./escape-html.js"
import { renderProductAppWebCommandCatalog } from "./command-catalog-render.js"
import { renderProductAppWebCommandExecution } from "./command-execution-render.js"
import { renderProductAppWebExecutionActivity } from "./execution-activity-render.js"
import { renderProductAppWebCommandAction } from "./command-input-render.js"

export {
  escapeHtml
} from "./escape-html.js"

export function renderProductAppWebHtml(snapshot: ProductAppWebSnapshot): string {
  const state = snapshot.view
  const actions = state.actions
    .filter(
      (action) =>
        action.id !== "submit-conversation" &&
        action.id !== "refresh-conversation" &&
        action.id !== "cancel-conversation" &&
        action.id !== "regenerate-conversation" &&
        action.id !== "remove-conversation-attachment" &&
        action.id !== "set-layout" &&
        action.id !== "set-mode" &&
        action.id !== "set-active-provider-profile" &&
        action.id !== "update-preferences"
    )
    .map((action) => renderAction(action))
    .join("")

  return [
    [
      `<section data-wanex-product-app-web="surface"`,
      `data-product-layout="${escapeHtml(state.layout)}"`,
      `data-product-mode="${escapeHtml(state.mode)}"`,
      `data-product-theme="${escapeHtml(state.theme)}"`,
      `data-product-density="${escapeHtml(state.density)}">`
    ].join(" "),
    `<header data-product-shell-header>`,
    `<div data-product-title>`,
    `<h1>${escapeHtml(state.title)}</h1>`,
    `<p>${escapeHtml(state.selectedSessionTitle ?? state.selectedSessionId ?? "No session selected")}</p>`,
    `</div>`,
    `<div data-product-status>`,
    `<span>${escapeHtml(state.ready ? "ready" : "not ready")}</span>`,
    `<span>${escapeHtml(state.mode)}</span>`,
    `<span>${escapeHtml(state.layout)}</span>`,
    `<span>${escapeHtml(state.workbenchState)}</span>`,
    `<span data-operation-status-state="${escapeHtml(state.operationStatus.state)}">${escapeHtml(state.operationStatus.message)}</span>`,
    `<span data-provider-run-gate-state="${escapeHtml(state.providerRunGate.state)}">${escapeHtml(state.providerRunGate.message)}</span>`,
    `</div>`,
    `</header>`,
    renderModeNavigation(state),
    renderModeSurface(snapshot, actions),
    `</section>`
  ].join("")
}

function renderModeNavigation(
  state: ProductAppWebSnapshot["view"]
): string {
  const modes = ["chat", "workbench", "diagnostics"]
  const buttons = modes
    .filter((mode) => state.settings.renderer.availableModes.includes(mode))
    .map(
      (mode) =>
        `<form data-action="set-mode" data-mode-navigation-form><input type="hidden" name="action" value="set-mode"><input type="hidden" name="mode" value="${escapeHtml(mode)}"><button type="submit" data-mode-tab="${escapeHtml(mode)}"${state.mode === mode ? ' aria-current="page"' : ""}>${escapeHtml(optionLabel(mode))}</button></form>`
    )
    .join("")
  return `<nav data-mode-navigation aria-label="Product view">${buttons}</nav>`
}

function renderModeSurface(
  snapshot: ProductAppWebSnapshot,
  actions: string
): string {
  const state = snapshot.view
  if (state.mode === "chat") {
    return [
      `<div data-region="workspace">`,
      `<aside data-region="left">`,
      renderSessions(state.recentSessions),
      `</aside>`,
      `<main data-region="main">`,
      renderActiveOperationStatus(snapshot),
      renderProductAppWebProviderRunGate(state.providerRunGate),
      renderConversation(snapshot),
      renderWorkbench(snapshot.workbench, "Conversation"),
      `</main>`,
      `</div>`
    ].join("")
  }
  if (state.mode === "workbench") {
    return [
      `<div data-region="workspace">`,
      `<aside data-region="left">`,
      renderSessions(state.recentSessions),
      `<nav data-panel="actions"><h2>Workbench actions</h2><div data-action-list>${actions}</div></nav>`,
      `</aside>`,
      `<main data-region="main">`,
      renderProductAppWebOperationStatus(snapshot),
      renderProductAppWebProviderRunGate(state.providerRunGate),
      renderConversation(snapshot),
      renderWorkbench(snapshot.workbench, "Workbench"),
      renderProductAppWebCommandPreview(state.commandPreview),
      renderProductAppWebCommandExecution(state.commandExecution),
      renderProductAppWebExecutionActivity(state.executionActivity),
      renderProductAppWebCommandCatalog(state.commandCatalog),
      `</main>`,
      `</div>`
    ].join("")
  }
  return [
    `<div data-region="workspace">`,
    `<aside data-region="left">`,
    renderProductAppWebSummary(snapshot),
    renderSettings(snapshot),
    `</aside>`,
    `<main data-region="main">`,
    renderProductAppWebOperationStatus(snapshot),
    `</main>`,
    `<aside data-region="right">`,
    renderProductAppWebEvents(snapshot),
    renderProductAppWebDiagnostics(snapshot),
    `</aside>`,
    `</div>`
  ].join("")
}

function renderActiveOperationStatus(
  snapshot: ProductAppWebSnapshot
): string {
  return snapshot.view.operationStatus.state === "idle"
    ? ""
    : renderProductAppWebOperationStatus(snapshot)
}

function renderProductAppWebSummary(
  snapshot: ProductAppWebSnapshot
): string {
  const state = snapshot.view
  return [
    `<section data-panel="summary">`,
    `<h2>Summary</h2>`,
    `<dl>`,
    `<dt>Mode</dt><dd>${escapeHtml(state.mode)}</dd>`,
    `<dt>Layout</dt><dd>${escapeHtml(state.layout)}</dd>`,
    `<dt>Session</dt><dd>${escapeHtml(state.selectedSessionTitle ?? state.selectedSessionId ?? "none")}</dd>`,
    `<dt>Recent sessions</dt><dd>${state.sessionCount}</dd>`,
    `<dt>Theme</dt><dd>${escapeHtml(state.theme)}</dd>`,
    `<dt>Density</dt><dd>${escapeHtml(state.density)}</dd>`,
    `<dt>Commands</dt><dd>${state.commandCount}</dd>`,
    `<dt>Product commands</dt><dd>${state.productCommandCount}</dd>`,
    `<dt>Events</dt><dd>${state.eventCount}</dd>`,
    `<dt>Workbench</dt><dd>${escapeHtml(state.workbenchState)}</dd>`,
    `<dt>Operation</dt><dd>${escapeHtml(state.operationStatus.state)}</dd>`,
    `<dt>Command preview</dt><dd>${escapeHtml(state.commandPreview.state)}</dd>`,
    `<dt>Command execution</dt><dd>${escapeHtml(state.commandExecution.state)}</dd>`,
    `<dt>Execution activity</dt><dd>${escapeHtml(state.executionActivity.state)}</dd>`,
    `</dl>`,
    `</section>`
  ].join("")
}

function renderProductAppWebEvents(
  snapshot: ProductAppWebSnapshot
): string {
  const events = snapshot.events.ok
    ? snapshot.events.events.length === 0
      ? `<li data-events-empty-state>No events yet</li>`
      : snapshot.events.events
          .map(
            (event) =>
              `<li data-sequence="${event.sequence}">${escapeHtml(event.type)} <span>${escapeHtml(event.command)}</span></li>`
          )
          .join("")
    : ""
  return `<section data-panel="events"><h2>Events</h2><ol>${events}</ol></section>`
}

function renderProductAppWebDiagnostics(
  snapshot: ProductAppWebSnapshot
): string {
  const diagnostics = snapshot.view.diagnostics
    .length === 0
    ? `<li data-diagnostics-empty-state>No diagnostics</li>`
    : snapshot.view.diagnostics
        .map(
          (diagnostic) =>
            `<li data-severity="${escapeHtml(diagnostic.severity)}">${escapeHtml(diagnostic.message)}</li>`
        )
        .join("")
  return `<section data-panel="diagnostics"><h2>Diagnostics</h2><ul>${diagnostics}</ul></section>`
}

function renderSettings(snapshot: ProductAppWebSnapshot): string {
  const settings = snapshot.view.settings
  return [
    `<section data-panel="settings" data-provider-readiness-status="${escapeHtml(settings.profile.readiness.status)}">`,
    `<h2>Settings</h2>`,
    `<div data-settings-controls>`,
    renderProviderProfileForm(snapshot),
    renderSettingsSelectForm({
      action: "set-layout",
      control: "layout",
      field: "layout",
      label: "Layout",
      values: settings.renderer.availableLayouts,
      selected: settings.renderer.layout,
      buttonLabel: "Apply layout"
    }),
    `<form data-action="update-preferences" data-settings-control="preferences">`,
    `<input type="hidden" name="action" value="update-preferences">`,
    renderSettingsSelectField({
      field: "theme",
      label: "Theme",
      values: settings.renderer.availableThemes,
      selected: settings.renderer.theme,
      required: false
    }),
    renderSettingsSelectField({
      field: "density",
      label: "Density",
      values: settings.renderer.availableDensities,
      selected: settings.renderer.density,
      required: false
    }),
    `<button type="submit"${canApplyPreferences(settings) ? "" : " disabled"}>Apply preferences</button>`,
    `</form>`,
    `</div>`,
    renderProviderProfileList(snapshot),
    `<dl>`,
    `<dt>Configured profile</dt><dd>${escapeHtml(settings.profile.configuredProviderProfileId)}</dd>`,
    `<dt>Active profile</dt><dd>${escapeHtml(settings.profile.activeProviderProfileId)}</dd>`,
    `<dt>Provider profiles</dt><dd>${settings.profile.profileCount}</dd>`,
    `<dt>Provider readiness</dt><dd>${escapeHtml(settings.profile.readiness.status)}</dd>`,
    `<dt>Provider can run</dt><dd>${escapeHtml(settings.profile.readiness.canRun ? "yes" : "no")}</dd>`,
    `<dt>Context</dt><dd>${escapeHtml(settings.profile.agentContextConfigured ? "configured" : "not configured")}</dd>`,
    `<dt>Theme</dt><dd>${escapeHtml(settings.renderer.theme)}</dd>`,
    `<dt>Density</dt><dd>${escapeHtml(settings.renderer.density)}</dd>`,
    `<dt>Layouts</dt><dd>${escapeHtml(settings.renderer.availableLayouts.join(", "))}</dd>`,
    `<dt>Modes</dt><dd>${escapeHtml(settings.renderer.availableModes.join(", "))}</dd>`,
    `<dt>Renderer calls</dt><dd>${escapeHtml(settings.integration.rendererCalls)}</dd>`,
    `<dt>Storage path exposed</dt><dd>${escapeHtml(settings.privacy.exposesStorePath ? "yes" : "no")}</dd>`,
    `</dl>`,
    `</section>`
  ].join("")
}

function renderProviderProfileList(snapshot: ProductAppWebSnapshot): string {
  const profiles = snapshot.view.settings.profile.profiles
  const rows =
    profiles.length === 0
      ? `<li data-provider-profile-empty-state>No provider profiles</li>`
      : profiles.map(renderProviderProfileRow).join("")
  return `<ol data-provider-profile-list>${rows}</ol>`
}

function renderProviderProfileRow(
  profile: ProductAppWebSnapshot["view"]["settings"]["profile"]["profiles"][number]
): string {
  const active = profile.active ? "true" : "false"
  const credentialStatus = profile.credentialConfigured ? "configured" : "none"
  const credentialLabel = profile.credentialConfigured
    ? "credential configured"
    : "no credential"
  return [
    `<li data-provider-profile-id="${escapeHtml(profile.id)}" data-provider-profile-active="${active}" data-provider-credential-status="${credentialStatus}">`,
    `<div>`,
    `<strong>${escapeHtml(profile.id)}</strong>`,
    `<span>${escapeHtml(profile.active ? "active" : "available")}</span>`,
    `</div>`,
    `<small>${escapeHtml(`${profile.kind}/${profile.providerId}`)}</small>`,
    `<small>${escapeHtml(profile.modelId)}</small>`,
    `<small>${escapeHtml(credentialLabel)}</small>`,
    `</li>`
  ].join("")
}

function renderProviderProfileForm(snapshot: ProductAppWebSnapshot): string {
  const profiles = snapshot.view.settings.profile.profiles
  const activeProfileId = snapshot.view.settings.profile.activeProviderProfileId
  const values = profiles.map((profile) => ({
    value: profile.id,
    label: `${profile.id} (${profile.modelId})${profile.credentialConfigured ? " credential" : ""}`
  }))
  const options = values
    .map((option) =>
      `<option value="${escapeHtml(option.value)}"${option.value === activeProfileId ? " selected" : ""}>${escapeHtml(option.label)}</option>`
    )
    .join("")
  return [
    `<form data-action="set-active-provider-profile" data-settings-control="provider-profile">`,
    `<input type="hidden" name="action" value="set-active-provider-profile">`,
    `<label>Provider<select name="profileId" required${profiles.length === 0 ? " disabled" : ""}>${options}</select></label>`,
    `<button type="submit"${profiles.length === 0 ? " disabled" : ""}>Apply provider</button>`,
    `</form>`
  ].join("")
}

function renderSettingsSelectForm(request: {
  readonly action: "set-layout"
  readonly control: string
  readonly field: string
  readonly label: string
  readonly values: readonly string[]
  readonly selected: string
  readonly buttonLabel: string
}): string {
  const disabled = selectValues(request.values, request.selected).length === 0
  return [
    `<form data-action="${request.action}" data-settings-control="${escapeHtml(request.control)}">`,
    `<input type="hidden" name="action" value="${request.action}">`,
    renderSettingsSelectField({
      field: request.field,
      label: request.label,
      values: request.values,
      selected: request.selected,
      required: true
    }),
    `<button type="submit"${disabled ? " disabled" : ""}>${escapeHtml(request.buttonLabel)}</button>`,
    `</form>`
  ].join("")
}

function canApplyPreferences(
  settings: ProductAppWebSnapshot["view"]["settings"]
): boolean {
  return (
    settings.renderer.availableThemes.length > 0 ||
    settings.renderer.availableDensities.length > 0
  )
}

function renderSettingsSelectField(request: {
  readonly field: string
  readonly label: string
  readonly values: readonly string[]
  readonly selected: string
  readonly required: boolean
}): string {
  const values = selectValues(request.values, request.selected)
  const required = request.required ? " required" : ""
  const disabled = values.length === 0 ? " disabled" : ""
  const options = values
    .map((value) => renderSelectOption(value, request.selected))
    .join("")
  return `<label>${escapeHtml(request.label)}<select name="${escapeHtml(request.field)}"${required}${disabled}>${options}</select></label>`
}

function selectValues(
  values: readonly string[],
  selected: string
): readonly string[] {
  const unique = [...new Set(values.filter((value) => value.trim().length > 0))]
  if (
    selected.trim().length === 0 ||
    selected === "unknown" ||
    unique.includes(selected)
  ) {
    return unique
  }
  return [selected, ...unique]
}

function renderSelectOption(value: string, selected: string): string {
  const selectedAttribute = value === selected ? " selected" : ""
  return `<option value="${escapeHtml(value)}"${selectedAttribute}>${escapeHtml(optionLabel(value))}</option>`
}

function optionLabel(value: string): string {
  return value
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ")
}

function renderSessions(
  sessions: readonly ProductAppWebRecentSessionRow[]
): string {
  const rows = sessions.length === 0
    ? `<li data-session-empty-state>No recent sessions</li>`
    : sessions.map(renderSessionRow).join("")
  return [
    `<section data-panel="sessions">`,
    `<h2>Sessions</h2>`,
    `<ol data-session-list>${rows}</ol>`,
    `</section>`
  ].join("")
}

function renderSessionRow(session: ProductAppWebRecentSessionRow): string {
  const selected = session.selected ? ` aria-current="true"` : ""
  const archived = session.archived ? ` data-archived="true"` : ""
  return [
    `<li data-session-id="${escapeHtml(session.sessionId)}" data-status="${escapeHtml(session.status)}"${archived}${selected}>`,
    `<form data-action="select-session">`,
    `<input type="hidden" name="action" value="select-session">`,
    `<input type="hidden" name="sessionId" value="${escapeHtml(session.sessionId)}">`,
    `<button type="submit">`,
    `<span>${escapeHtml(session.label)}</span>`,
    `<small>${escapeHtml(session.kind)} ${escapeHtml(session.status)}</small>`,
    `</button>`,
    `</form>`,
    `</li>`
  ].join("")
}

function renderConversation(snapshot: ProductAppWebSnapshot): string {
  const conversation = snapshot.conversation
  const rows =
    conversation.operation?.transcript.rows
      .map(renderConversationRow)
      .join("") ?? ""
  const message =
    conversation.message === undefined
      ? ""
      : `<p data-conversation-message>${escapeHtml(conversation.message)}</p>`
  const transientAssistant =
    conversation.transientAssistantText === undefined
      ? ""
      : [
          `<article data-conversation-transient-assistant>`,
          `<header><span>assistant</span><span>streaming</span></header>`,
          `<p>${escapeHtml(conversation.transientAssistantText)}</p>`,
          `</article>`
        ].join("")
  const sessionInput = conversationSessionInput(conversation)
  const operationId =
    conversation.operationId === undefined
      ? ""
      : `<p data-conversation-operation>${escapeHtml(conversation.operationId)}</p>`
  const emptyState =
    rows.length === 0 && transientAssistant.length === 0
      ? `<p data-conversation-empty-state>No active conversation operation</p>`
      : ""

  return [
    `<section data-panel="conversation" data-conversation-state="${escapeHtml(conversation.state)}">`,
    `<h2>Conversation</h2>`,
    operationId,
    message,
    `<ol data-conversation-transcript>${rows}</ol>`,
    transientAssistant,
    emptyState,
    renderConversationAttachmentPicker(snapshot),
    renderConversationAttachments(snapshot),
    `<form data-action="submit-conversation">`,
    `<input type="hidden" name="action" value="submit-conversation">`,
    sessionInput,
    `<label>Message<textarea name="text"${snapshot.view.conversationAttachments.length === 0 ? " required" : ""}${snapshot.view.conversationCanSubmit ? "" : " disabled"}></textarea></label>`,
    `<button type="submit"${snapshot.view.conversationCanSubmit ? "" : " disabled"}>Send message</button>`,
    `</form>`,
    `<div data-conversation-controls>`,
    renderConversationAction("refresh-conversation", "Refresh", conversation, true),
    renderConversationAction(
      "cancel-conversation",
      "Cancel response",
      conversation,
      snapshot.view.conversationCanCancel
    ),
    renderConversationAction(
      "regenerate-conversation",
      "Regenerate response",
      conversation,
      snapshot.view.conversationCanRegenerate
    ),
    renderConversationAction(
      "open-workbench",
      "Open canonical transcript",
      conversation,
      conversation.sessionId !== undefined
    ),
    `</div>`,
    `</section>`
  ].join("")
}

function renderConversationAttachmentPicker(
  snapshot: ProductAppWebSnapshot
): string {
  return [
    `<label data-conversation-attachment-picker>`,
    `<span>Attachments</span>`,
    `<input type="file" data-conversation-attachment-input${snapshot.view.selectedSessionId === undefined ? "" : ` data-session-id="${escapeHtml(snapshot.view.selectedSessionId)}"`} multiple accept="image/*,audio/*,video/*,.pdf,.txt,.md,.csv,.json,.doc,.docx,.xls,.xlsx,.ppt,.pptx">`,
    `</label>`,
    `<p data-conversation-attachment-status aria-live="polite"></p>`,
    snapshot.attachments.ok
      ? ""
      : `<p role="alert" data-conversation-attachment-error>${escapeHtml(snapshot.attachments.error.message)}</p>`
  ].join("")
}

function renderConversationAttachments(
  snapshot: ProductAppWebSnapshot
): string {
  const attachments = snapshot.view.conversationAttachments
  if (attachments.length === 0) {
    return `<ol data-conversation-attachments data-empty="true"></ol>`
  }
  return [
    `<ol data-conversation-attachments>`,
    ...attachments.map((attachment) => [
      `<li data-conversation-attachment data-resource-id="${escapeHtml(attachment.resourceId)}" data-preview-kind="${escapeHtml(attachment.previewKind)}">`,
      `<div data-conversation-attachment-preview></div>`,
      `<div data-conversation-attachment-metadata>`,
      `<strong>${escapeHtml(attachment.label ?? attachment.resourceKind)}</strong>`,
      `<small>${escapeHtml(attachment.mediaType ?? attachment.resourceKind)} / ${formatBytes(attachment.sizeBytes)}</small>`,
      `</div>`,
      `<form data-action="remove-conversation-attachment">`,
      `<input type="hidden" name="action" value="remove-conversation-attachment">`,
      `<input type="hidden" name="resourceId" value="${escapeHtml(attachment.resourceId)}">`,
      attachmentSessionInput(snapshot),
      `<button type="submit" aria-label="Remove ${escapeHtml(attachment.label ?? "attachment")}" title="Remove attachment">&times;</button>`,
      `</form>`,
      `</li>`
    ].join("")),
    `</ol>`
  ].join("")
}

function attachmentSessionInput(
  snapshot: ProductAppWebSnapshot
): string {
  return snapshot.view.selectedSessionId === undefined
    ? ""
    : `<input type="hidden" name="sessionId" value="${escapeHtml(snapshot.view.selectedSessionId)}">`
}

function formatBytes(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KiB`
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MiB`
}

function renderConversationAction(
  action:
    | "refresh-conversation"
    | "cancel-conversation"
    | "regenerate-conversation"
    | "open-workbench",
  label: string,
  conversation: ProductAppWebConversationViewModel,
  enabled: boolean
): string {
  const reasonInput =
    action === "cancel-conversation"
      ? `<input type="hidden" name="reason" value="user requested cancellation">`
      : ""
  return [
    `<form data-action="${action}">`,
    `<input type="hidden" name="action" value="${action}">`,
    conversationSessionInput(conversation),
    reasonInput,
    `<button type="submit"${enabled ? "" : " disabled"}>${escapeHtml(label)}</button>`,
    `</form>`
  ].join("")
}

function conversationSessionInput(
  conversation: ProductAppWebConversationViewModel
): string {
  return conversation.sessionId === undefined
    ? ""
    : `<input type="hidden" name="sessionId" value="${escapeHtml(conversation.sessionId)}">`
}

function renderConversationRow(
  row: NonNullable<
    ProductAppWebConversationViewModel["operation"]
  >["transcript"]["rows"][number]
): string {
  const text = row.text.trim().length === 0 ? "[empty]" : row.text
  return [
    `<li data-conversation-row="${escapeHtml(row.key)}" data-kind="${escapeHtml(row.kind)}" data-role="${escapeHtml(row.role)}">`,
    `<article>`,
    `<header><span>${escapeHtml(row.role)}</span><span>${escapeHtml(row.status)}</span></header>`,
    `<p>${escapeHtml(text)}</p>`,
    `</article>`,
    `</li>`
  ].join("")
}

function renderWorkbench(
  workbench: ProductAppWebWorkbenchViewModel,
  title = "Workbench"
): string {
  const rows = workbench.rows.map(renderWorkbenchRow).join("")
  const emptyState =
    workbench.rows.length === 0
      ? `<p data-workbench-empty-state>${escapeHtml(workbenchEmptyStateText(workbench))}</p>`
      : ""
  const latestAssistant =
    workbench.summary.latestAssistantText === undefined
      ? ""
      : `<p data-workbench-latest-assistant>${escapeHtml(workbench.summary.latestAssistantText)}</p>`
  const latestUser =
    workbench.summary.latestUserText === undefined
      ? ""
      : `<p data-workbench-latest-user>${escapeHtml(workbench.summary.latestUserText)}</p>`
  const message =
    workbench.message === undefined
      ? ""
      : `<p data-workbench-message>${escapeHtml(workbench.message)}</p>`

  return [
    `<section data-panel="workbench" data-workbench-state="${escapeHtml(workbench.state)}">`,
    `<h2>${escapeHtml(title)}</h2>`,
    `<p data-workbench-session>${escapeHtml(workbench.sessionId ?? "none")}</p>`,
    message,
    `<dl>`,
    `<dt>Rows</dt><dd>${workbench.summary.rowCount}</dd>`,
    `<dt>Inputs</dt><dd>${workbench.summary.inputCount}</dd>`,
    `<dt>Messages</dt><dd>${workbench.summary.messageCount}</dd>`,
    `<dt>Origins</dt><dd>${escapeHtml(workbench.summary.originKinds.join(", "))}</dd>`,
    `</dl>`,
    latestUser,
    latestAssistant,
    `<ol data-workbench-transcript>${rows}</ol>`,
    emptyState,
    `</section>`
  ].join("")
}

function workbenchEmptyStateText(
  workbench: ProductAppWebWorkbenchViewModel
): string {
  if (workbench.state === "idle" && workbench.sessionId === undefined) {
    return "Start a workbench session"
  }
  if (workbench.state === "idle") {
    return "No workbench messages yet"
  }
  if (workbench.state === "no-session") {
    return "No session selected"
  }
  if (workbench.state === "failed") {
    return "Workbench is unavailable"
  }
  return "No messages in this workbench"
}


function renderWorkbenchRow(row: ProductAppWebWorkbenchTranscriptRow): string {
  const text = row.text.trim().length === 0 ? "[empty]" : row.text
  return [
    `<li data-workbench-row="${escapeHtml(row.id)}" data-kind="${escapeHtml(row.kind)}" data-role="${escapeHtml(row.role)}">`,
    `<article>`,
    `<header><span>${escapeHtml(row.role)}</span><span>${escapeHtml(row.status)}</span></header>`,
    `<p>${escapeHtml(text)}</p>`,
    `</article>`,
    `</li>`
  ].join("")
}

function renderAction(action: ProductAppWebActionDescriptor): string {
  if (action.commandInput !== undefined) {
    return renderProductAppWebCommandAction(action, renderActionField)
  }
  if (action.fields.length === 0) {
    return `<form data-action="${escapeHtml(action.id)}"><input type="hidden" name="action" value="${escapeHtml(action.id)}"><button type="submit">${escapeHtml(action.label)}</button></form>`
  }
  const fields = action.fields.map((field) => renderActionField(field)).join("")
  return `<form data-action="${escapeHtml(action.id)}"><input type="hidden" name="action" value="${escapeHtml(action.id)}">${fields}<button type="submit">${escapeHtml(action.label)}</button></form>`
}

function renderActionField(field: ProductAppWebActionFieldDescriptor): string {
  const required = field.required ? " required" : ""
  if (field.kind === "select") {
    const options = (field.options ?? [])
      .map(
        (option) =>
          `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`
      )
      .join("")
    return `<label>${escapeHtml(field.label)}<select name="${escapeHtml(field.name)}"${required}>${options}</select></label>`
  }
  if (field.kind === "textarea") {
    return `<label>${escapeHtml(field.label)}<textarea name="${escapeHtml(field.name)}"${required}></textarea></label>`
  }
  return `<label>${escapeHtml(field.label)}<input name="${escapeHtml(field.name)}" type="text"${required}></label>`
}
