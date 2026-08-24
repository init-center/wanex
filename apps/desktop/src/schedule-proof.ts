import type {
  WanexDesktopScheduleCreateProofResult,
  WanexDesktopScheduleRestoreProofResult,
} from "./proof-contract.js"

export interface WanexDesktopScheduleProofExpected {
  readonly title: string
  readonly prompt: string
  readonly partialResponse: string
  readonly response: string
  readonly restoredResponse: string
  readonly intervalSeconds: number
  readonly quietWindowMs: number
}

export interface WanexDesktopScheduleCreateAdmission {
  readonly ok: true
  readonly scheduleId: string
  readonly sessionId: string
  readonly rendererInteractive: number
  readonly visibleFormCreated: true
  readonly isolatedSessionSelected: true
  readonly activeModelSelected: true
  readonly skipMisfireSelected: true
  readonly enabledAtCreation: true
  readonly scheduleCreated: true
  readonly scheduleSessionVisible: true
  readonly firstUserVisible: true
  readonly firstPartialResponseVisible: true
}

export type WanexDesktopScheduleSettlementReader = (
  scheduleId: string,
  enabled: boolean,
) => HTMLElement | undefined

export function wanexDesktopScheduleSettlementReaderSource(): string {
  return readWanexDesktopSettledScheduleRow.toString()
}

function readWanexDesktopSettledScheduleRow(
  scheduleId: string,
  enabled: boolean,
): HTMLElement | undefined {
  const escaped = globalThis.CSS?.escape?.(scheduleId) ??
    scheduleId.replace(/[^a-zA-Z0-9_-]/g, "\\$&")
  const candidate = document.querySelector(`[data-ui-schedule="${escaped}"]`)
  if (!(candidate instanceof HTMLElement)) return undefined
  const toggle = candidate.querySelector("[data-ui-schedule-toggle]")
  const stateMatches = enabled
    ? candidate.textContent?.includes("Disabled") !== true
    : candidate.textContent?.includes("Disabled") === true
  return stateMatches &&
    toggle instanceof HTMLButtonElement &&
    !toggle.disabled &&
    toggle.title === (enabled ? "Disable schedule" : "Enable schedule")
    ? candidate
    : undefined
}

export async function runWanexDesktopScheduleCreateAdmissionProof(
  expected: WanexDesktopScheduleProofExpected,
  settledScheduleRow: WanexDesktopScheduleSettlementReader,
): Promise<WanexDesktopScheduleCreateAdmission> {
  const startedAt = performance.now()
  await waitFor(() => providerReady() ? true : undefined, 10_000, "provider_ready")
  await openSettings()
  const create = await waitFor(() => {
    const candidate = document.querySelector("[data-ui-schedule-create]")
    return candidate instanceof HTMLButtonElement && !candidate.disabled
      ? candidate
      : undefined
  }, 10_000, "create_control")
  create.click()
  const form = await waitFor(() => {
    const candidate = document.querySelector("[data-ui-schedule-form]")
    return candidate instanceof HTMLFormElement ? candidate : undefined
  }, 10_000, "create_form")
  setField(form, "title", expected.title)
  setField(form, "prompt", expected.prompt)
  setField(form, "triggerKind", "interval")
  setField(form, "intervalAnchorAt", localMinute(Date.now()))
  setField(form, "intervalValue", String(expected.intervalSeconds))
  setField(form, "intervalUnit", "seconds")

  const isolatedSessionSelected = fieldValue(form, "sessionMode") === "isolated"
  const activeModelSelected = fieldValue(form, "modelMode") === "active"
  const skipMisfireSelected = fieldValue(form, "misfirePolicy") === "skip"
  const enabled = form.elements.namedItem("enabled")
  const enabledAtCreation = enabled instanceof HTMLInputElement && enabled.checked
  const initialSessionIds = sessionIds()
  if (
    !isolatedSessionSelected ||
    !activeModelSelected ||
    !skipMisfireSelected ||
    !enabledAtCreation
  ) {
    throw new Error("Desktop Schedule proof safe defaults are unavailable")
  }
  submit(form)
  const row = await waitFor(() => scheduleRowByTitle(expected.title), 10_000, "created_row")
  const scheduleId = requiredAttribute(row, "data-ui-schedule")
  await waitFor(
    () => settledScheduleRow(scheduleId, true),
    10_000,
    "created_settlement",
  )
  closeSettings()

  const session = await waitFor(
    () => newSessionButton(initialSessionIds),
    expected.intervalSeconds * 1_000 + 15_000,
    "schedule_session",
  )
  session.click()
  const sessionId = requiredAttribute(session, "data-ui-session-select")
  await waitFor(() =>
    document.querySelector(`[data-ui-session-select="${cssEscape(sessionId)}"][aria-current="true"]`)
      ? true
      : undefined
  , 10_000, "schedule_session_selected")
  const firstUserVisible = await waitFor(() =>
    conversationRows("user").some((item) => item.textContent?.includes(expected.prompt))
      ? true
      : undefined
  , 10_000, "scheduled_user")
  const firstPartialResponseVisible = await waitFor(() =>
    assistantTextVisible(expected.partialResponse) ? true : undefined
  , 15_000, "scheduled_partial")

  return {
    ok: true,
    scheduleId,
    sessionId,
    rendererInteractive: performance.now() - startedAt,
    visibleFormCreated: true,
    isolatedSessionSelected: true,
    activeModelSelected: true,
    skipMisfireSelected: true,
    enabledAtCreation: true,
    scheduleCreated: true,
    scheduleSessionVisible: true,
    firstUserVisible,
    firstPartialResponseVisible,
  }

  function providerReady(): boolean {
    return document.querySelector('[data-ui-provider-state="ready"]') !== null
  }

  async function openSettings(): Promise<void> {
    if (document.querySelector("[data-ui-settings-panel]") !== null) return
    const trigger = await waitFor(() => {
      const candidate = document.querySelector('[data-ui-action="open-settings"]')
      return candidate instanceof HTMLButtonElement ? candidate : undefined
    }, 10_000, "settings_trigger")
    trigger.click()
    await waitFor(() => document.querySelector("[data-ui-settings-panel]") ?? undefined,
      10_000, "settings_panel")
  }

  function closeSettings(): void {
    const close = document.querySelector(
      '[data-ui-settings-panel] button[aria-label="Close settings"]',
    )
    if (!(close instanceof HTMLButtonElement)) {
      throw new Error("Desktop Schedule proof Settings close control is unavailable")
    }
    close.click()
  }

  function scheduleRowByTitle(title: string): HTMLElement | undefined {
    return [...document.querySelectorAll("[data-ui-schedule]")].find((candidate) =>
      candidate instanceof HTMLElement && candidate.textContent?.includes(title)
    ) as HTMLElement | undefined
  }

  function sessionIds(): ReadonlySet<string> {
    return new Set(
      [...document.querySelectorAll("[data-ui-session-select]")]
        .flatMap((candidate) => {
          const value = candidate.getAttribute("data-ui-session-select")
          return value === null || value.length === 0 ? [] : [value]
        }),
    )
  }

  function newSessionButton(
    previous: ReadonlySet<string>,
  ): HTMLButtonElement | undefined {
    return [...document.querySelectorAll("[data-ui-session-select]")].find((candidate) => {
      const sessionId = candidate.getAttribute("data-ui-session-select")
      return candidate instanceof HTMLButtonElement &&
        sessionId !== null &&
        !previous.has(sessionId)
    }) as HTMLButtonElement | undefined
  }

  function conversationRows(role: "user" | "assistant"): Element[] {
    return [...document.querySelectorAll(
      `[data-ui-conversation-row][data-ui-role="${role}"]`,
    )]
  }

  function assistantTextVisible(text: string): boolean {
    return conversationRows("assistant").some((item) =>
      item.textContent?.includes(text)
    ) || document.querySelector("[data-ui-transient-assistant]")
      ?.textContent?.includes(text) === true
  }

  function setField(formValue: HTMLFormElement, name: string, value: string): void {
    const field = formValue.elements.namedItem(name)
    if (
      !(field instanceof HTMLInputElement) &&
      !(field instanceof HTMLSelectElement) &&
      !(field instanceof HTMLTextAreaElement)
    ) {
      throw new Error(`Desktop Schedule proof field is missing: ${name}`)
    }
    const prototype = field instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : field instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(field, value)
    field.dispatchEvent(new Event("input", { bubbles: true }))
    field.dispatchEvent(new Event("change", { bubbles: true }))
  }

  function fieldValue(formValue: HTMLFormElement, name: string): string {
    const field = formValue.elements.namedItem(name)
    return field instanceof HTMLInputElement || field instanceof HTMLSelectElement
      ? field.value
      : ""
  }

  function submit(formValue: HTMLFormElement): void {
    const event = new Event("submit", { bubbles: true, cancelable: true })
    formValue.dispatchEvent(event)
    if (!event.defaultPrevented) {
      throw new Error("Desktop Schedule proof form was not submitted")
    }
  }

  function localMinute(value: number): string {
    const date = new Date(value)
    const offset = date.getTimezoneOffset() * 60_000
    return new Date(value - offset).toISOString().slice(0, 16)
  }

  function requiredAttribute(element: Element, name: string): string {
    const value = element.getAttribute(name)
    if (value === null || value.length === 0) {
      throw new Error(`Desktop Schedule proof attribute is missing: ${name}`)
    }
    return value
  }

  function cssEscape(value: string): string {
    return globalThis.CSS?.escape?.(value) ?? value.replace(/[^a-zA-Z0-9_-]/g, "\\$&")
  }

  async function waitFor<T>(
    read: () => T | false | undefined,
    timeoutMs: number,
    stage: string,
  ): Promise<T> {
    const end = Date.now() + timeoutMs
    for (;;) {
      const value = read()
      if (value !== undefined && value !== false) return value
      const remaining = end - Date.now()
      if (remaining <= 0) break
      await new Promise((resolve) => setTimeout(resolve, Math.min(50, remaining)))
    }
    throw new Error(`Desktop Schedule proof timed out during ${stage}`)
  }
}

export async function runWanexDesktopScheduleCreateSettlementProof(
  expected: WanexDesktopScheduleProofExpected,
  admission: WanexDesktopScheduleCreateAdmission,
  settledScheduleRow: WanexDesktopScheduleSettlementReader,
): Promise<WanexDesktopScheduleCreateProofResult> {
  const settlementStartedAt = performance.now()
  await waitFor(() =>
    conversationRows("assistant").some((item) => item.textContent?.includes(expected.response))
      ? true
      : undefined
  , 15_000, "final_response")
  const settledAt = performance.now()
  await openSettings()
  const row = await waitFor(() => scheduleRow(admission.scheduleId), 10_000, "created_row")
  const toggle = row.querySelector("[data-ui-schedule-toggle]")
  if (!(toggle instanceof HTMLButtonElement) || toggle.disabled) {
    throw new Error("Desktop Schedule proof disable control is unavailable")
  }
  toggle.click()
  await waitFor(
    () => settledScheduleRow(admission.scheduleId, false),
    10_000,
    "disabled",
  )
  const disabledAt = performance.now()
  await new Promise((resolve) => setTimeout(resolve, expected.quietWindowMs))
  const disabledQuietWindowObserved =
    scheduleRow(admission.scheduleId)?.textContent?.includes("Disabled") === true
  const providerEvidenceRedacted = redacted()
  const internalIdentityEvidenceHidden = visibleIdentityHidden()
  return {
    ok: disabledQuietWindowObserved && providerEvidenceRedacted && internalIdentityEvidenceHidden,
    step: "relaunch-schedule-create",
    providerReady: true,
    providerEvidenceRedacted,
    internalIdentityEvidenceHidden,
    intervalSeconds: expected.intervalSeconds,
    visibleFormCreated: admission.visibleFormCreated,
    isolatedSessionSelected: admission.isolatedSessionSelected,
    activeModelSelected: admission.activeModelSelected,
    skipMisfireSelected: admission.skipMisfireSelected,
    enabledAtCreation: admission.enabledAtCreation,
    scheduleCreated: admission.scheduleCreated,
    scheduleSessionVisible: admission.scheduleSessionVisible,
    firstUserVisible: admission.firstUserVisible,
    firstPartialResponseVisible: admission.firstPartialResponseVisible,
    firstFinalResponseVisible: true,
    disabledBeforeShutdown: true,
    disabledQuietWindowObserved,
    timingsMs: {
      rendererInteractive: admission.rendererInteractive,
      conversationSettlement: settledAt - settlementStartedAt,
      rendererPostSettlement: performance.now() - disabledAt,
    },
  }

  async function openSettings(): Promise<void> {
    if (document.querySelector("[data-ui-settings-panel]") !== null) return
    const trigger = await waitFor(() => {
      const candidate = document.querySelector('[data-ui-action="open-settings"]')
      return candidate instanceof HTMLButtonElement ? candidate : undefined
    }, 10_000, "settings_trigger")
    trigger.click()
    await waitFor(() => document.querySelector("[data-ui-settings-panel]") ?? undefined,
      10_000, "settings_panel")
  }

  function scheduleRow(scheduleId: string): HTMLElement | undefined {
    const candidate = document.querySelector(
      `[data-ui-schedule="${cssEscape(scheduleId)}"]`,
    )
    return candidate instanceof HTMLElement ? candidate : undefined
  }

  function conversationRows(role: "user" | "assistant"): Element[] {
    return [...document.querySelectorAll(
      `[data-ui-conversation-row][data-ui-role="${role}"]`,
    )]
  }

  function redacted(): boolean {
    const html = document.documentElement.innerHTML
    return !html.includes("secretRef") && [...document.querySelectorAll(
      'input[type="password"]',
    )].every((item) => !(item instanceof HTMLInputElement) || item.value === "")
  }

  function visibleIdentityHidden(): boolean {
    const text = document.body.innerText
    return !/\b(?:job|attempt|runtime|store)[ _-]?id\b/i.test(text)
  }

  function cssEscape(value: string): string {
    return globalThis.CSS?.escape?.(value) ?? value.replace(/[^a-zA-Z0-9_-]/g, "\\$&")
  }

  async function waitFor<T>(
    read: () => T | false | undefined,
    timeoutMs: number,
    stage: string,
  ): Promise<T> {
    const end = Date.now() + timeoutMs
    for (;;) {
      const value = read()
      if (value !== undefined && value !== false) return value
      const remaining = end - Date.now()
      if (remaining <= 0) break
      await new Promise((resolve) => setTimeout(resolve, Math.min(50, remaining)))
    }
    throw new Error(`Desktop Schedule proof timed out during ${stage}`)
  }
}

export async function runWanexDesktopScheduleRestoreProof(
  expected: WanexDesktopScheduleProofExpected,
  settledScheduleRow: WanexDesktopScheduleSettlementReader,
): Promise<WanexDesktopScheduleRestoreProofResult> {
  const startedAt = performance.now()
  await waitFor(() => providerReady() ? true : undefined, 10_000, "provider_ready")
  await openSettings()
  const restoredRow = await waitFor(() => scheduleRowByTitle(expected.title),
    10_000, "restored_definition")
  const scheduleId = requiredAttribute(restoredRow, "data-ui-schedule")
  const restoredDisabledState = restoredRow.textContent?.includes("Disabled") === true
  if (!restoredDisabledState) {
    throw new Error("Desktop Schedule proof did not restore the disabled state")
  }
  closeSettings()
  const session = await findSessionContaining(expected.prompt, 15_000)
  const sessionId = requiredAttribute(session, "data-ui-session-select")
  const persistedTranscriptVisible = await waitFor(() =>
    conversationRows("user").some((item) => item.textContent?.includes(expected.prompt)) &&
    conversationRows("assistant").some((item) => item.textContent?.includes(expected.response))
      ? true
      : undefined
  , 10_000, "persisted_transcript")
  const initialUserIds = rowIds("user")
  const initialAssistantIds = rowIds("assistant")
  const interactiveAt = performance.now()

  await openSettings()
  const enable = await waitFor(() => {
    const control = scheduleRow(scheduleId)?.querySelector("[data-ui-schedule-toggle]")
    return control instanceof HTMLButtonElement && !control.disabled ? control : undefined
  }, 10_000, "enable_control")
  enable.click()
  await waitFor(
    () => settledScheduleRow(scheduleId, true),
    10_000,
    "enabled",
  )
  closeSettings()
  const submittedAt = performance.now()
  const restoredExecution = await waitFor(() => {
    const users = conversationRows("user").filter((item) =>
      !initialUserIds.has(rowId(item)) && item.textContent?.includes(expected.prompt)
    )
    const assistants = conversationRows("assistant").filter((item) =>
      !initialAssistantIds.has(rowId(item)) &&
      item.textContent?.includes(expected.restoredResponse)
    )
    return users.length === 1 && assistants.length === 1
      ? { user: true as const, assistant: true as const }
      : undefined
  }, expected.intervalSeconds * 1_000 + 15_000, "restored_execution")
  const settledAt = performance.now()

  await openSettings()
  const disable = await waitFor(() => {
    const control = scheduleRow(scheduleId)?.querySelector("[data-ui-schedule-toggle]")
    return control instanceof HTMLButtonElement && !control.disabled ? control : undefined
  }, 10_000, "disable_control")
  disable.click()
  await waitFor(
    () => settledScheduleRow(scheduleId, false),
    10_000,
    "disabled",
  )
  const disabledAt = performance.now()
  const userCountAtDisable = rowIds("user").size
  await new Promise((resolve) => setTimeout(resolve, expected.quietWindowMs))
  const disabledQuietWindowObserved =
    scheduleRow(scheduleId)?.textContent?.includes("Disabled") === true &&
    rowIds("user").size === userCountAtDisable

  const remove = scheduleRow(scheduleId)?.querySelector("[data-ui-schedule-remove]")
  if (!(remove instanceof HTMLButtonElement) || remove.disabled) {
    throw new Error("Desktop Schedule proof remove control is unavailable")
  }
  remove.click()
  const confirm = await waitFor(() => {
    const candidate = document.querySelector("[data-ui-schedule-remove-confirm]")
    return candidate instanceof HTMLButtonElement && !candidate.disabled
      ? candidate
      : undefined
  }, 10_000, "remove_confirmation")
  confirm.click()
  await waitFor(() => {
    const create = document.querySelector("[data-ui-schedule-create]")
    return scheduleRow(scheduleId) === undefined &&
      create instanceof HTMLButtonElement &&
      !create.disabled
      ? true
      : undefined
  }, 10_000, "removed")
  const providerEvidenceRedacted = redacted()
  const internalIdentityEvidenceHidden = visibleIdentityHidden()
  return {
    ok:
      disabledQuietWindowObserved &&
      providerEvidenceRedacted &&
      internalIdentityEvidenceHidden,
    step: "relaunch-schedule-restore",
    providerReady: true,
    providerEvidenceRedacted,
    internalIdentityEvidenceHidden,
    intervalSeconds: expected.intervalSeconds,
    restoredDefinitionVisible: true,
    restoredDisabledState,
    persistedTranscriptVisible,
    reenabled: true,
    restoredExecutionUserVisible: restoredExecution.user,
    restoredExecutionResponseVisible: restoredExecution.assistant,
    disabledAfterExecution: true,
    disabledQuietWindowObserved,
    removed: true,
    canonicalRemovedStateVisible: true,
    timingsMs: {
      rendererInteractive: interactiveAt - startedAt,
      conversationSettlement: settledAt - submittedAt,
      rendererPostSettlement: performance.now() - disabledAt,
    },
  }

  function providerReady(): boolean {
    return document.querySelector('[data-ui-provider-state="ready"]') !== null
  }

  async function openSettings(): Promise<void> {
    if (document.querySelector("[data-ui-settings-panel]") !== null) return
    const trigger = await waitFor(() => {
      const candidate = document.querySelector('[data-ui-action="open-settings"]')
      return candidate instanceof HTMLButtonElement ? candidate : undefined
    }, 10_000, "settings_trigger")
    trigger.click()
    await waitFor(() => document.querySelector("[data-ui-settings-panel]") ?? undefined,
      10_000, "settings_panel")
  }

  function closeSettings(): void {
    const close = document.querySelector(
      '[data-ui-settings-panel] button[aria-label="Close settings"]',
    )
    if (!(close instanceof HTMLButtonElement)) {
      throw new Error("Desktop Schedule proof Settings close control is unavailable")
    }
    close.click()
  }

  function scheduleRowByTitle(title: string): HTMLElement | undefined {
    return [...document.querySelectorAll("[data-ui-schedule]")].find((candidate) =>
      candidate instanceof HTMLElement && candidate.textContent?.includes(title)
    ) as HTMLElement | undefined
  }

  function scheduleRow(id: string): HTMLElement | undefined {
    const candidate = document.querySelector(`[data-ui-schedule="${cssEscape(id)}"]`)
    return candidate instanceof HTMLElement ? candidate : undefined
  }

  async function findSessionContaining(
    text: string,
    timeoutMs: number,
  ): Promise<HTMLButtonElement> {
    const end = Date.now() + timeoutMs
    const candidates = [...document.querySelectorAll("[data-ui-session-select]")]
      .filter((candidate): candidate is HTMLButtonElement =>
        candidate instanceof HTMLButtonElement
      )
    for (const candidate of candidates) {
      candidate.click()
      const sessionId = requiredAttribute(candidate, "data-ui-session-select")
      const candidateEnd = Math.min(end, Date.now() + 1_000)
      while (Date.now() < candidateEnd) {
        if (
          selectedSessionId() === sessionId &&
          conversationRows("user").some((item) => item.textContent?.includes(text))
        ) {
          return candidate
        }
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
    }
    throw new Error("Desktop Schedule proof could not find the restored conversation")
  }

  function selectedSessionId(): string {
    return document.querySelector('[data-ui-session-select][aria-current="true"]')
      ?.getAttribute("data-ui-session-select") ?? ""
  }

  function conversationRows(role: "user" | "assistant"): Element[] {
    return [...document.querySelectorAll(
      `[data-ui-conversation-row][data-ui-role="${role}"]`,
    )]
  }

  function rowIds(role: "user" | "assistant"): Set<string> {
    return new Set(conversationRows(role).map(rowId))
  }

  function rowId(row: Element): string {
    return row.getAttribute("data-ui-conversation-row") ?? ""
  }

  function requiredAttribute(element: Element, name: string): string {
    const value = element.getAttribute(name)
    if (value === null || value.length === 0) {
      throw new Error(`Desktop Schedule proof attribute is missing: ${name}`)
    }
    return value
  }

  function redacted(): boolean {
    const html = document.documentElement.innerHTML
    return !html.includes("secretRef") && [...document.querySelectorAll(
      'input[type="password"]',
    )].every((item) => !(item instanceof HTMLInputElement) || item.value === "")
  }

  function visibleIdentityHidden(): boolean {
    const text = document.body.innerText
    return !/\b(?:job|attempt|runtime|store)[ _-]?id\b/i.test(text)
  }

  function cssEscape(value: string): string {
    return globalThis.CSS?.escape?.(value) ?? value.replace(/[^a-zA-Z0-9_-]/g, "\\$&")
  }

  async function waitFor<T>(
    read: () => T | false | undefined,
    timeoutMs: number,
    stage: string,
  ): Promise<T> {
    const end = Date.now() + timeoutMs
    for (;;) {
      const value = read()
      if (value !== undefined && value !== false) return value
      const remaining = end - Date.now()
      if (remaining <= 0) break
      await new Promise((resolve) => setTimeout(resolve, Math.min(50, remaining)))
    }
    throw new Error(`Desktop Schedule proof timed out during ${stage}`)
  }
}
