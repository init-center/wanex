import type { WanexDesktopProviderRelaunchProofResult } from "./proof-contract.js"
import type {
  runWanexDesktopProviderImageGenerationProof
} from "./provider-image-generation-proof.js"
import type {
  runWanexDesktopProviderGoalProof
} from "./provider-goal-proof.js"
import type {
  runWanexDesktopProviderCancelRegenerateProof
} from "./provider-cancel-regenerate-proof.js"
import type {
  runWanexDesktopProviderMultimodalProof
} from "./provider-multimodal-proof.js"
import type {
  runWanexDesktopProviderPlanProof
} from "./provider-plan-proof.js"
import type {
  createWanexDesktopProviderRelaunchProofResult,
  WanexDesktopProviderRelaunchProofValue
} from "./provider-relaunch-proof-result.js"
import type {
  WanexDesktopProviderRelaunchProofExpected
} from "./provider-relaunch-proof-types.js"

export async function runWanexDesktopProviderRelaunchProof(
  expected: WanexDesktopProviderRelaunchProofExpected,
  runMultimodalProof: typeof runWanexDesktopProviderMultimodalProof,
  runImageGenerationProof: typeof runWanexDesktopProviderImageGenerationProof,
  runPlanProof: typeof runWanexDesktopProviderPlanProof,
  runGoalProof: typeof runWanexDesktopProviderGoalProof,
  runCancelRegenerateProof:
    typeof runWanexDesktopProviderCancelRegenerateProof,
  createProofResult: typeof createWanexDesktopProviderRelaunchProofResult
): Promise<WanexDesktopProviderRelaunchProofResult> {
  const startedAt = performance.now()
  const journeyContext = {
    startedAt,
    configuredProviderCount,
    providerReady,
    redacted,
    result,
    setControlValue,
    submitConversation,
    waitFor
  }
  if (expected.step === "relaunch-configure") {
    return await configureProvider()
  }
  if (expected.step === "relaunch-chat") {
    return await runConversation()
  }
  if (expected.step === "relaunch-cancel-regenerate") {
    return await runCancelRegenerateProof(expected, journeyContext)
  }
  if (expected.step === "relaunch-multimodal") {
    return await runMultimodalProof(expected, journeyContext)
  }
  if (expected.step === "relaunch-image-generation") {
    return await runImageGenerationProof(expected, journeyContext)
  }
  if (expected.step === "relaunch-plan") {
    return await runPlanProof(expected, journeyContext)
  }
  if (expected.step === "relaunch-goal") {
    return await runGoalProof(expected, journeyContext)
  }
  if (expected.step === "relaunch-cleanup") {
    return await removeProvider()
  }
  return await proveUnconfigured()

  async function configureProvider(): Promise<WanexDesktopProviderRelaunchProofResult> {
    const form = await waitFor(() => {
      const candidate = document.querySelector("[data-ui-provider-form]")
      return candidate instanceof HTMLFormElement ? candidate : undefined
    })
    const initialConfiguredProviderCount = configuredProviderCount()
    if (initialConfiguredProviderCount !== 0) {
      return result({ initialConfiguredProviderCount })
    }
    const providerBaseUrl = required(expected.providerBaseUrl, "Provider base URL")
    const credentialValue = required(expected.credential, "Provider credential")
    setField(form, "presetId", "openai-compatible")
    setField(form, "baseUrl", `${providerBaseUrl}/relaunch`)
    setField(form, "conversationModelId", expected.modelId)
    setField(form, "imageGenerationModelId", expected.imageGenerationModelId)
    setField(form, "credential", credentialValue)
    const imageInput = form.elements.namedItem("conversationInputImage")
    if (!(imageInput instanceof HTMLInputElement) || imageInput.disabled) {
      throw new Error("Provider relaunch image capability control is unavailable")
    }
    imageInput.checked = true
    const toolCalling = form.elements.namedItem("conversationToolCalling")
    if (!(toolCalling instanceof HTMLInputElement) || toolCalling.disabled) {
      throw new Error("Provider relaunch Tool-calling control is unavailable")
    }
    toolCalling.checked = true
    const active = form.elements.namedItem("makeConversationActive")
    if (active instanceof HTMLInputElement) active.checked = true
    submit(form)
    await waitFor(() =>
      configuredProviderCount() === 1 &&
      providerReady() &&
      providerModelVisible() &&
      imageGenerationModelVisible() &&
      providerStatus() === "Provider saved"
    )
    const appearanceConfigured = await configureAppearance()
    const conversation = await submitConversation({
      source: expected.initialText,
      expectedResponse: expected.response,
      expectedUserIncludes: [expected.heading, expected.code]
    })
    const settledAt = performance.now()
    const providerEvidenceRedacted = redacted(credentialValue)
    return result({
      ok:
        providerEvidenceRedacted &&
        appearanceConfigured &&
        conversation.userVisible &&
        conversation.assistantVisible &&
        conversation.responseVisible,
      initialConfiguredProviderCount,
      configuredProviderCount: 1,
      providerConfigured: true,
      providerReady: true,
      imageGenerationEndpointReady: true,
      providerEvidenceRedacted,
      appearanceConfigured,
      appearanceRestored: false,
      modelId: expected.modelId,
      sessionId: conversation.sessionId,
      initialTranscriptVisible:
        conversation.userVisible && conversation.assistantVisible,
      initialResponseVisible: conversation.responseVisible,
      conversationSubmitted: true,
      userVisible: conversation.userVisible,
      assistantVisible: conversation.assistantVisible,
      responseVisible: conversation.responseVisible,
      rendererInteractive: conversation.submittedAt - startedAt,
      conversationSettlement: settledAt - conversation.submittedAt,
      rendererPostSettlement: performance.now() - settledAt
    })
  }

  async function runConversation(): Promise<WanexDesktopProviderRelaunchProofResult> {
    const state = await waitFor(() => {
      const surface = document.querySelector('[data-ui-assistant-shell]')
      const textarea = surface?.querySelector(
        '[data-ui-composer] textarea[name="text"]'
      )
      const button = surface?.querySelector(
        '[data-ui-composer] button[type="submit"]'
      )
      const appearanceRestored =
        surface?.getAttribute("data-theme") === "dark" &&
        surface?.getAttribute("data-density") === "compact"
      if (
        configuredProviderCount() !== 1 ||
        !providerReady() ||
        !providerModelVisible() ||
        !appearanceRestored ||
        !(surface instanceof Element) ||
        !(textarea instanceof HTMLTextAreaElement) ||
        !(button instanceof HTMLButtonElement) ||
        textarea.disabled
      ) {
        return undefined
      }
        return { appearanceRestored, surface, textarea }
    }, 10_000, "chat_ready")
    const resumed = await waitFor(() => {
      const session = state.surface.querySelector(
        '[data-ui-session-select][aria-current="true"]'
      )
      const sessionId = session?.getAttribute("data-ui-session-select") ?? ""
      const selectedTitle = state.surface.querySelector(
        "[data-ui-selected-session-title]"
      )?.textContent?.trim()
      const listedTitle = session?.querySelector(
        "[data-ui-session-title]"
      )?.textContent?.trim()
      const userRows = [...state.surface.querySelectorAll(
        '[data-ui-conversation-row][data-ui-role="user"]'
      )]
      const assistantRows = [...state.surface.querySelectorAll(
        '[data-ui-conversation-row][data-ui-role="assistant"]'
      )]
      const initialUserVisible = userRows.some((row) =>
        row.textContent?.includes(expected.heading) &&
        row.textContent?.includes(expected.code)
      )
      const initialResponseVisible = assistantRows.some((row) =>
        row.textContent?.includes(expected.response)
      )
      return (
        sessionId.length > 0 &&
        state.surface.querySelectorAll(
          '[data-ui-session-list] [data-ui-session][data-ui-session-archived="false"]'
        ).length === 1 &&
        selectedTitle === expected.heading &&
        listedTitle === expected.heading &&
        initialUserVisible &&
        initialResponseVisible
      )
        ? {
            appearanceRestored: state.appearanceRestored,
            sessionId,
            initialUserVisible,
            initialResponseVisible
          }
        : undefined
    }, 10_000, "transcript_restore")
    const visible = await submitConversation({
      source: expected.followUpText,
      expectedResponse: expected.response,
      expectedSessionId: resumed.sessionId
    })
    const settledAt = performance.now()
    const providerEvidenceRedacted = redacted()
    return result({
      ok:
        providerEvidenceRedacted &&
        visible.sessionId === resumed.sessionId &&
        visible.userVisible &&
        visible.assistantVisible &&
        visible.responseVisible,
      initialConfiguredProviderCount: 1,
      configuredProviderCount: 1,
      providerConfigured: true,
        providerReady: true,
        providerEvidenceRedacted,
        appearanceConfigured: true,
        appearanceRestored: resumed.appearanceRestored,
      modelId: expected.modelId,
      sessionId: resumed.sessionId,
      initialTranscriptVisible: resumed.initialUserVisible,
      initialResponseVisible: resumed.initialResponseVisible,
      conversationSubmitted: true,
      userVisible: visible.userVisible,
      assistantVisible: visible.assistantVisible,
      responseVisible: visible.responseVisible,
      followUpSessionPreserved: visible.sessionId === resumed.sessionId,
      followUpResponseVisible: visible.responseVisible,
      rendererInteractive: visible.submittedAt - startedAt,
      conversationSettlement: settledAt - visible.submittedAt,
      rendererPostSettlement: performance.now() - settledAt
    })
  }

  async function removeProvider(): Promise<WanexDesktopProviderRelaunchProofResult> {
    await waitFor(() =>
      document.querySelector('[data-ui-assistant-shell]') ?? undefined
    )
    await openProviderSettings()
    const initialConfiguredProviderCount = await waitFor(() => {
      const rows = document.querySelectorAll("[data-ui-provider]")
      if (document.querySelector("[data-ui-provider-list]") !== null) {
        return rows.length
      }
      return document.querySelector("[data-ui-provider-empty]") === null
        ? undefined
        : 0
    }, 10_000, "provider_list")
    if (initialConfiguredProviderCount > 1) {
      return result({ initialConfiguredProviderCount })
    }
    if (initialConfiguredProviderCount === 1) {
      const remove = document.querySelector("[data-ui-provider-remove]")
      if (!(remove instanceof HTMLButtonElement)) {
        return result({ initialConfiguredProviderCount })
      }
      const originalConfirm = window.confirm
      window.confirm = () => true
      try {
        remove.click()
        await waitFor(() =>
          configuredProviderCount() === 0 && providerStatus().startsWith("Provider removed")
        , 10_000, "provider_removal", providerRemovalDiagnostic)
      } finally {
        window.confirm = originalConfirm
      }
    }
    const blocked = await waitFor(
      () => chatBlocked() ? true : undefined,
      10_000,
      "chat_blocked",
      chatBlockedDiagnostic
    )
    const credentialCleanupPending = providerStatus().includes("retry")
    const cleanupCompleted = blocked && !credentialCleanupPending
    const redaction = redactionEvidence()
    const settledAt = performance.now()
    return result({
      ok: cleanupCompleted && redaction.ok,
      initialConfiguredProviderCount,
      configuredProviderCount: 0,
      providerEvidenceRedacted: redaction.ok,
      ...(redaction.ok ? {} : { redactionDiagnostics: redaction.diagnostics }),
      cleanupCompleted,
      credentialCleanupPending,
      chatBlocked: true,
      rendererInteractive: settledAt - startedAt
    })
  }

  async function proveUnconfigured(): Promise<WanexDesktopProviderRelaunchProofResult> {
    await waitFor(() =>
      configuredProviderCount() === 0 && chatBlocked() ? true : undefined
    )
    const settledAt = performance.now()
    const providerEvidenceRedacted = redacted()
    return result({
      ok: providerEvidenceRedacted,
      initialConfiguredProviderCount: 0,
      configuredProviderCount: 0,
      providerEvidenceRedacted,
      chatBlocked: true,
      rendererInteractive: settledAt - startedAt
    })
  }

  function result(
    value: WanexDesktopProviderRelaunchProofValue
  ): WanexDesktopProviderRelaunchProofResult {
    return createProofResult(expected.step, value)
  }

  async function configureAppearance(): Promise<boolean> {
    const appearance = await waitFor(() =>
      document.querySelector("[data-ui-appearance-settings]") ?? undefined
    , 10_000, "appearance_settings")
    const dark = appearance.querySelector(
      '[data-ui-preference="theme"][data-ui-preference-value="dark"]'
    )
    const compact = appearance.querySelector(
      '[data-ui-preference="density"][data-ui-preference-value="compact"]'
    )
    if (!(dark instanceof HTMLButtonElement) || !(compact instanceof HTMLButtonElement)) {
      throw new Error("Appearance controls are unavailable after Provider setup")
    }
    if (!dark.disabled) {
      dark.click()
      await waitFor(() =>
        document.querySelector('[data-ui-assistant-shell][data-theme="dark"]') ?? undefined
      , 10_000, "appearance_theme")
    }
    if (!compact.disabled) {
      compact.click()
      await waitFor(() =>
        document.querySelector('[data-ui-assistant-shell][data-density="compact"]') ?? undefined
      , 10_000, "appearance_density")
    }
    return document.querySelector(
      '[data-ui-assistant-shell][data-theme="dark"][data-density="compact"]'
    ) !== null
  }

  function configuredProviderCount(): number {
    const rows = document.querySelectorAll("[data-ui-provider]").length
    if (rows > 0) return rows
    return providerReady() ? 1 : 0
  }

  function providerReady(): boolean {
    return document.querySelector('[data-ui-provider-state="ready"]') !== null
  }

  function providerModelVisible(): boolean {
    return [...document.querySelectorAll(
      '[data-ui-model-selector] option'
    )].some((option) => option.textContent?.startsWith(`${expected.modelId} - `)) ||
      document.querySelector(
        `[data-ui-provider][data-ui-conversation-model-id="${expected.modelId}"]`
      ) !== null
  }

  function imageGenerationModelVisible(): boolean {
    return document.querySelector(
      `[data-ui-provider][data-ui-image-generation-model-id="${expected.imageGenerationModelId}"]`
    ) !== null
  }

  async function openProviderSettings(): Promise<void> {
    if (document.querySelector("[data-ui-settings-panel]") !== null) return
    const trigger = await waitFor(() => {
      const candidate = document.querySelector(
        '[data-ui-action="open-settings"]'
      )
      return candidate instanceof HTMLButtonElement ? candidate : undefined
    }, 10_000, "settings_trigger")
    trigger.click()
    await waitFor(() =>
      document.querySelector("[data-ui-settings-panel]") ?? undefined
    , 10_000, "settings_panel")
  }

  function providerStatus(): string {
    return document.querySelector("[data-ui-provider-status]")
      ?.textContent?.trim() ?? ""
  }

  function chatBlocked(): boolean {
    const surface = document.querySelector('[data-ui-assistant-shell]')
    const textarea = surface?.querySelector(
      '[data-ui-composer] textarea[name="text"], [data-ui-team-composer] textarea[name="team-message"]'
    )
    const button = surface?.querySelector(
      '[data-ui-composer] button[type="submit"], [data-ui-team-composer] button[type="submit"]'
    )
    return (
      surface?.querySelector('[data-ui-provider-state="blocked"]') !== null &&
      textarea instanceof HTMLTextAreaElement &&
      button instanceof HTMLButtonElement &&
      !textarea.disabled &&
      button.disabled
    )
  }

  function providerRemovalDiagnostic(): string {
    return [
      `providers_${String(configuredProviderCount())}`,
      `status_${diagnosticToken(providerStatus())}`,
      `remove_buttons_${String(document.querySelectorAll("[data-ui-provider-remove]").length)}`,
      `readiness_${diagnosticToken(providerReadinessState())}`,
      `error_${diagnosticToken(rendererError())}`
    ].join("_")
  }

  function chatBlockedDiagnostic(): string {
    const surface = document.querySelector('[data-ui-assistant-shell]')
    const textarea = surface?.querySelector(
      '[data-ui-composer] textarea[name="text"], [data-ui-team-composer] textarea[name="team-message"]'
    )
    const button = surface?.querySelector(
      '[data-ui-composer] button[type="submit"], [data-ui-team-composer] button[type="submit"]'
    )
    return [
      `readiness_${diagnosticToken(providerReadinessState())}`,
      `textarea_${textarea instanceof HTMLTextAreaElement ? textarea.disabled ? "disabled" : "enabled" : "missing"}`,
      `submit_${button instanceof HTMLButtonElement ? button.disabled ? "disabled" : "enabled" : "missing"}`,
      `status_${diagnosticToken(providerStatus())}`,
      `error_${diagnosticToken(rendererError())}`
    ].join("_")
  }

  function providerReadinessState(): string {
    return document.querySelector("[data-ui-provider-state]")
      ?.getAttribute("data-ui-provider-state") ?? "missing"
  }

  function rendererError(): string {
    return document.querySelector('[role="alert"]')?.textContent?.trim() ?? "none"
  }

  function diagnosticToken(value: string): string {
    const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")
    return normalized.slice(0, 64) || "empty"
  }

  function redacted(credential?: string): boolean {
    return redactionEvidence(credential).ok
  }

  function redactionEvidence(credential?: string): {
    readonly ok: boolean
    readonly diagnostics: {
      readonly credentialLiteralVisible: boolean
      readonly secretReferenceVisible: boolean
      readonly nonemptyPasswordInputCount: number
    }
  } {
    const html = document.documentElement.innerHTML
    const diagnostics = {
      credentialLiteralVisible:
        credential !== undefined && html.includes(credential),
      secretReferenceVisible: html.includes("secretRef"),
      nonemptyPasswordInputCount: [...document.querySelectorAll(
        'input[type="password"]'
      )].filter(
        (input) => input instanceof HTMLInputElement && input.value !== ""
      ).length
    }
    return {
      ok:
        !diagnostics.credentialLiteralVisible &&
        !diagnostics.secretReferenceVisible &&
        diagnostics.nonemptyPasswordInputCount === 0,
      diagnostics
    }
  }

  async function submitConversation(options: {
    readonly source: string
    readonly expectedResponse: string
    readonly expectedSessionId?: string
    readonly expectedUserIncludes?: readonly string[]
  }): Promise<{
    readonly sessionId: string
    readonly userVisible: true
    readonly assistantVisible: true
    readonly responseVisible: true
    readonly submittedAt: number
  }> {
    const surface = await waitFor(() => {
      const candidate = document.querySelector(
        '[data-ui-assistant-shell]'
      )
      return candidate instanceof Element ? candidate : undefined
    }, 10_000, "composer_ready")
    const textarea = surface.querySelector(
      '[data-ui-composer] textarea[name="text"]'
    )
    const button = surface.querySelector(
      '[data-ui-composer] button[type="submit"]'
    )
    if (
      !(textarea instanceof HTMLTextAreaElement) ||
      !(button instanceof HTMLButtonElement) ||
      textarea.disabled
    ) {
      throw new Error("Provider relaunch conversation composer is unavailable")
    }
    const initialUserRowIds = conversationRowIds(surface, "user")
    const initialAssistantRowIds = conversationRowIds(surface, "assistant")
    setControlValue(textarea, options.source)
    await waitFor(() => !button.disabled ? true : undefined, 10_000, "composer_draft")
    const submittedAt = performance.now()
    const enter = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true
    })
    textarea.dispatchEvent(enter)
    if (!enter.defaultPrevented) {
      throw new Error("Provider relaunch conversation was not submitted")
    }
    return await waitFor(() => {
      const currentSurface = document.querySelector(
        '[data-ui-assistant-shell]'
      )
      const userRows = [...(currentSurface?.querySelectorAll(
        '[data-ui-conversation-row][data-ui-role="user"]'
      ) ?? [])]
      const assistantRows = [...(currentSurface?.querySelectorAll(
        '[data-ui-conversation-row][data-ui-role="assistant"]'
      ) ?? [])]
      const addedUserRows = userRows.filter(
        (row) => !initialUserRowIds.has(conversationRowId(row))
      )
      const addedAssistantRows = assistantRows.filter(
        (row) => !initialAssistantRowIds.has(conversationRowId(row))
      )
      const currentSessionId = currentSurface?.querySelector(
        '[data-ui-session-select][aria-current="true"]'
      )?.getAttribute("data-ui-session-select") ?? ""
      const userVisible =
        addedUserRows.length === 1 &&
        (options.expectedUserIncludes ?? [options.source]).every((fragment) =>
          addedUserRows[0]?.textContent?.includes(fragment) === true
        )
      const assistantVisible = addedAssistantRows.length === 1
      const responseVisible =
        addedAssistantRows[0]?.textContent?.includes(options.expectedResponse) === true
      const sessionPreserved =
        options.expectedSessionId === undefined ||
        currentSessionId === options.expectedSessionId
      return (
        currentSessionId.length > 0 &&
        userVisible &&
        assistantVisible &&
        responseVisible &&
        sessionPreserved
      )
        ? {
            sessionId: currentSessionId,
            userVisible: true as const,
            assistantVisible: true as const,
            responseVisible: true as const,
            submittedAt
          }
        : undefined
    }, 10_000, "conversation_settlement", () => {
      const currentSurface = document.querySelector(
        '[data-ui-assistant-shell]'
      )
      const userRows = [...(currentSurface?.querySelectorAll(
        '[data-ui-conversation-row][data-ui-role="user"]'
      ) ?? [])]
      const assistantRows = [...(currentSurface?.querySelectorAll(
        '[data-ui-conversation-row][data-ui-role="assistant"]'
      ) ?? [])]
      const addedUserRows = userRows.filter(
        (row) => !initialUserRowIds.has(conversationRowId(row))
      )
      const addedAssistantRows = assistantRows.filter(
        (row) => !initialAssistantRowIds.has(conversationRowId(row))
      )
      const currentSessionId = currentSurface?.querySelector(
        '[data-ui-session-select][aria-current="true"]'
      )?.getAttribute("data-ui-session-select") ?? ""
      const userVisible = (options.expectedUserIncludes ?? [options.source])
        .every((fragment) =>
          addedUserRows[0]?.textContent?.includes(fragment) === true
        )
      const responseVisible = addedAssistantRows[0]?.textContent?.includes(
        options.expectedResponse
      ) === true
      return [
        `added_users_${String(addedUserRows.length)}`,
        `added_assistants_${String(addedAssistantRows.length)}`,
        `user_visible_${String(userVisible)}`,
        `response_visible_${String(responseVisible)}`,
        `session_preserved_${String(options.expectedSessionId === undefined || currentSessionId === options.expectedSessionId)}`
      ].join(":")
    })
  }

  function conversationRowIds(surface: Element, role: "user" | "assistant"): Set<string> {
    return new Set(
      [...surface.querySelectorAll(
        `[data-ui-conversation-row][data-ui-role="${role}"]`
      )].map(conversationRowId)
    )
  }

  function conversationRowId(row: Element): string {
    return row.getAttribute("data-ui-conversation-row") ?? ""
  }

  function setField(form: HTMLFormElement, name: string, value: string): void {
    const field = form.elements.namedItem(name)
    if (!(field instanceof HTMLInputElement) && !(field instanceof HTMLSelectElement)) {
      throw new Error(`Provider relaunch proof field is missing: ${name}`)
    }
    setControlValue(field, value)
  }

  function setControlValue(
    control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
    value: string,
  ): void {
    const prototype = control instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : control instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set
    setter?.call(control, value)
    control.dispatchEvent(new Event("input", { bubbles: true }))
    control.dispatchEvent(new Event("change", { bubbles: true }))
  }

  function submit(form: HTMLFormElement): void {
    const event = new Event("submit", { bubbles: true, cancelable: true })
    form.dispatchEvent(event)
    if (!event.defaultPrevented) {
      throw new Error("Provider relaunch proof form was not submitted")
    }
  }

  function required(value: string | undefined, label: string): string {
    if (value === undefined || value.trim().length === 0) {
      throw new Error(`Provider relaunch proof ${label} is required`)
    }
    return value
  }

  async function waitFor<T>(
    read: () => T | false | undefined,
    timeoutMs = 10_000,
    stage = "state",
    diagnostic?: () => string
  ): Promise<T> {
    const end = Date.now() + timeoutMs
    for (;;) {
      const value = read()
      if (value !== undefined && value !== false) return value
      const remaining = end - Date.now()
      if (remaining <= 0) break
      await new Promise((resolve) => setTimeout(resolve, Math.min(50, remaining)))
    }
    const finalValue = read()
    if (finalValue !== undefined && finalValue !== false) return finalValue
    throw new Error(
      `Provider relaunch proof timed out during ${expected.step}:${stage}:${diagnostic?.() ?? timeoutDiagnostic(stage)}`
    )
  }

  function timeoutDiagnostic(stage: string): string {
    if (stage !== "transcript_restore") return "not_available"
    const sessions = document.querySelectorAll(
      '[data-ui-session-list] [data-ui-session-select][aria-current="true"]'
    )
    if (sessions.length === 0) return "no_selected_session"
    if (sessions.length !== 1) return "duplicate_selected_sessions"
    const session = sessions[0]
    const selectedTitle = document.querySelector(
      "[data-ui-selected-session-title]"
    )?.textContent?.trim()
    const listedTitle = session?.querySelector("[data-ui-session-title]")
      ?.textContent?.trim()
    if (selectedTitle !== expected.heading || listedTitle !== expected.heading) {
      return "session_title_mismatch"
    }
    const userRows = [...document.querySelectorAll(
      '[data-ui-conversation-row][data-ui-role="user"]'
    )]
    if (!userRows.some((row) =>
      row.textContent?.includes(expected.heading) &&
      row.textContent?.includes(expected.code)
    )) return "initial_user_row_missing"
    const assistantRows = [...document.querySelectorAll(
      '[data-ui-conversation-row][data-ui-role="assistant"]'
    )]
    if (!assistantRows.some((row) => row.textContent?.includes(expected.response))) {
      return "initial_assistant_row_missing"
    }
    return "transcript_condition_unknown"
  }

}
