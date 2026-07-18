import type {
  ProductAppWebActionDescriptor,
  ProductAppWebActionFieldDescriptor,
  ProductAppWebProviderRunGateViewModel,
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
  const diagnostics = state.diagnostics
    .length === 0
    ? `<li data-diagnostics-empty-state>No diagnostics</li>`
    : state.diagnostics
        .map(
          (diagnostic) =>
            `<li data-severity="${escapeHtml(diagnostic.severity)}">${escapeHtml(diagnostic.message)}</li>`
        )
        .join("")
  const actions = state.actions
    .filter(
      (action) =>
        action.id !== "continue-workbench" &&
        action.id !== "start-workbench" &&
        action.id !== "set-layout" &&
        action.id !== "set-mode" &&
        action.id !== "set-active-provider-profile" &&
        action.id !== "update-preferences"
    )
    .map((action) => renderAction(action))
    .join("")
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
    `<div data-region="workspace">`,
    `<aside data-region="left">`,
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
    `</section>`,
    renderProductAppWebOperationStatus(snapshot),
    renderSettings(snapshot),
    renderSessions(state.recentSessions),
    `<nav data-panel="actions">`,
    `<h2>Actions</h2>`,
    `<div data-action-list>${actions}</div>`,
    `</nav>`,
    `</aside>`,
    `<main data-region="main">`,
    renderProductAppWebCommandPreview(state.commandPreview),
    renderProductAppWebCommandExecution(state.commandExecution),
    renderProductAppWebExecutionActivity(state.executionActivity),
    renderProductAppWebCommandCatalog(state.commandCatalog),
    renderProductAppWebProviderRunGate(state.providerRunGate),
    renderWorkbench(snapshot.workbench, state.providerRunGate),
    `</main>`,
    `<aside data-region="right">`,
    `<section data-panel="events"><h2>Events</h2><ol>${events}</ol></section>`,
    `<section data-panel="diagnostics"><h2>Diagnostics</h2><ul>${diagnostics}</ul></section>`,
    `</aside>`,
    `</div>`,
    `</section>`
  ].join("")
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
    renderSettingsSelectForm({
      action: "set-mode",
      control: "mode",
      field: "mode",
      label: "Mode",
      values: settings.renderer.availableModes,
      selected: settings.renderer.mode,
      buttonLabel: "Apply mode"
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
  const baseUrl =
    profile.baseUrl === undefined
      ? ""
      : `<span data-provider-profile-base-url>${escapeHtml(profile.baseUrl)}</span>`
  const keyStatus = profile.hasApiKey ? "redacted" : "none"
  const keyLabel = profile.hasApiKey ? "key redacted" : "no key"
  return [
    `<li data-provider-profile-id="${escapeHtml(profile.id)}" data-provider-profile-active="${active}" data-provider-key-status="${keyStatus}">`,
    `<div>`,
    `<strong>${escapeHtml(profile.id)}</strong>`,
    `<span>${escapeHtml(profile.active ? "active" : "available")}</span>`,
    `</div>`,
    `<small>${escapeHtml(`${profile.kind}/${profile.providerId}`)}</small>`,
    `<small>${escapeHtml(profile.modelId)}</small>`,
    baseUrl,
    `<small>${escapeHtml(keyLabel)}</small>`,
    `</li>`
  ].join("")
}

function renderProviderProfileForm(snapshot: ProductAppWebSnapshot): string {
  const profiles = snapshot.view.settings.profile.profiles
  const activeProfileId = snapshot.view.settings.profile.activeProviderProfileId
  const values = profiles.map((profile) => ({
    value: profile.id,
    label: `${profile.id} (${profile.modelId})${profile.hasApiKey ? " key" : ""}`
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
  readonly action: "set-layout" | "set-mode"
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

function renderWorkbench(
  workbench: ProductAppWebWorkbenchViewModel,
  providerRunGate: ProductAppWebProviderRunGateViewModel
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
  const composer = workbench.canContinue
      ? renderWorkbenchComposer({
          action: "continue-workbench",
          buttonLabel: "Send",
          sessionId: workbench.sessionId,
          variant: "continue",
          providerRunGate
        })
      : renderWorkbenchComposer({
          action: "start-workbench",
          buttonLabel: "Start",
          sessionId: workbench.sessionId,
          variant: "start",
          providerRunGate
        })
  const message =
    workbench.message === undefined
      ? ""
      : `<p data-workbench-message>${escapeHtml(workbench.message)}</p>`

  return [
    `<section data-panel="workbench" data-workbench-state="${escapeHtml(workbench.state)}">`,
    `<h2>Workbench</h2>`,
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
    composer,
    `</section>`
  ].join("")
}

function renderWorkbenchComposer(request: {
  readonly action: "start-workbench" | "continue-workbench"
  readonly buttonLabel: string
  readonly sessionId: string | undefined
  readonly variant: "start" | "continue"
  readonly providerRunGate: ProductAppWebProviderRunGateViewModel
}): string {
  const sessionId = request.sessionId === undefined
    ? ""
    : `<input type="hidden" name="sessionId" value="${escapeHtml(request.sessionId)}">`
  const blocked = !request.providerRunGate.canSubmitWorkbench
  const disabled = blocked ? " disabled" : ""
  const composerState = blocked ? "blocked" : "ready"
  const statusText = blocked
    ? request.providerRunGate.message
    : workbenchComposerStatusText(request.variant)
  return [
    `<form data-action="${request.action}" data-workbench-composer data-workbench-composer-kind="${request.variant}" data-workbench-composer-state="${composerState}">`,
    `<input type="hidden" name="action" value="${request.action}">`,
    sessionId,
    `<label>Message<textarea name="text" required${disabled}></textarea></label>`,
    `<p data-workbench-composer-status role="status" aria-live="polite">${escapeHtml(statusText)}</p>`,
    `<button type="submit"${disabled}>${escapeHtml(request.buttonLabel)}</button>`,
    `</form>`
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

function workbenchComposerStatusText(
  variant: "start" | "continue"
): string {
  return variant === "start" ? "Ready to start" : "Ready to send"
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
