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
  runWanexDesktopProviderMediaRoutingProof
} from "./provider-media-routing-proof.js"
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
  runMediaRoutingProof: typeof runWanexDesktopProviderMediaRoutingProof,
  runImageGenerationProof: typeof runWanexDesktopProviderImageGenerationProof,
  runPlanProof: typeof runWanexDesktopProviderPlanProof,
  runGoalProof: typeof runWanexDesktopProviderGoalProof,
  runCancelRegenerateProof:
    typeof runWanexDesktopProviderCancelRegenerateProof,
  createProofResult: typeof createWanexDesktopProviderRelaunchProofResult
): Promise<WanexDesktopProviderRelaunchProofResult> {
  const startedAt = performance.now()
  let lastKnownConfiguredProviderCount = 0
  const journeyContext = {
    startedAt,
    configuredProviderCount,
    providerReady,
    redacted,
    openProviderSettings,
    openAddMenuItem,
    result,
    setControlValue,
    submitConversation,
    waitFor
  }
  if (expected.step !== "relaunch-configure" &&
      expected.step !== "relaunch-cleanup" &&
      expected.step !== "relaunch-unconfigured") {
    await openProviderSettings()
    await waitFor(() => configuredProviderCount() === 2 ? true : undefined,
      10_000, "persisted_provider_count", providerRemovalDiagnostic)
    const close = document.querySelector('[data-ui-action="close-settings"]')
    if (!(close instanceof HTMLButtonElement)) throw new Error("Provider settings close action is unavailable")
    close.click()
    await waitFor(() => document.querySelector("[data-ui-settings-panel]") === null)
  }
  if (expected.step === "relaunch-configure") {
    return await configureProvider()
  }
  if (expected.step === "relaunch-cancel-regenerate") {
    return await runCancelRegenerateProof(expected, journeyContext)
  }
  if (expected.step === "relaunch-multimodal") {
    return await runMultimodalProof(expected, journeyContext)
  }
  if (expected.step === "relaunch-image-understanding") {
    return await runMediaRoutingProof(expected, journeyContext)
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
    const preset = form.querySelector('[data-ui-select="presetId"]')
    if (!(preset instanceof HTMLButtonElement)) throw new Error("Provider preset control is missing")
    preset.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }))
    const option = await waitFor(() => {
      const candidate = document.querySelector('[role="option"][data-ui-select-option="openai-compatible"]')
      return candidate instanceof HTMLElement ? candidate : undefined
    })
    option.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    await waitFor(() => preset.getAttribute("aria-expanded") === "false" ? true : undefined)
    setField(form, "baseUrl", `${providerBaseUrl}/relaunch`)
    setField(form, "conversationModelId", expected.modelId)
    setField(form, "imageGenerationModelId", expected.imageGenerationModelId)
    setField(form, "credential", credentialValue)
    const imageGenerationInput = form.elements.namedItem("imageGenerationAcceptsImages")
    if (!(imageGenerationInput instanceof HTMLInputElement) || imageGenerationInput.disabled) {
      throw new Error("Provider relaunch reference-image capability control is unavailable")
    }
    imageGenerationInput.checked = true
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
    await addReaderProvider(providerBaseUrl, credentialValue)
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
      configuredProviderCount: 2,
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
      journeyPreparation: conversation.submittedAt - startedAt,
      conversationSettlement: settledAt - conversation.submittedAt,
      rendererPostSettlement: performance.now() - settledAt
    })
  }


  async function removeProvider(): Promise<WanexDesktopProviderRelaunchProofResult> {
    await waitFor(() =>
      document.querySelector('[data-ui-assistant-shell]') ?? undefined
    )
    const serverProfilesRemoved = await removeServerProfiles()
    await openProviderSettings()
    const initialConfiguredProviderCount = await waitFor(() => {
      const count = document.querySelector("[data-ui-provider-settings]")
        ?.getAttribute("data-ui-provider-count")
      return count === null || count === undefined ? undefined : Number(count)
    }, 10_000, "provider_list")
    while (configuredProviderCount() > 0) {
      const previousCount = configuredProviderCount()
      const remove = document.querySelector("[data-ui-provider-remove]")
      if (!(remove instanceof HTMLButtonElement)) {
        return result({ initialConfiguredProviderCount })
      }
      remove.click()
      const confirmRemove = await waitFor(() => {
        const candidate = document.querySelector("[data-ui-provider-remove-confirm]")
        return candidate instanceof HTMLButtonElement && !candidate.disabled
          ? candidate
          : undefined
      }, 10_000, "provider_removal_confirmation", providerRemovalDiagnostic)
      confirmRemove.click()
      await waitFor(() =>
        configuredProviderCount() === previousCount - 1 &&
        providerStatus().startsWith("Provider removed")
      , 10_000, "provider_removal", providerRemovalDiagnostic)
    }
    const blocked = await waitFor(
      () => chatBlocked() ? true : undefined,
      10_000,
      "chat_blocked",
      chatBlockedDiagnostic
    )
    const credentialCleanupPending = providerStatus().includes("retry")
    const cleanupCompleted =
      blocked && !credentialCleanupPending && serverProfilesRemoved
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
      journeyPreparation: settledAt - startedAt
    })
  }

  async function removeServerProfiles(): Promise<boolean> {
    const bridge = (globalThis as typeof globalThis & {
      wanexServer?: {
        listProfiles(): Promise<readonly { readonly profileId: string }[]>
        removeProfile(profileId: string): Promise<void>
      }
    }).wanexServer
    if (bridge === undefined) return true
    for (const profile of await bridge.listProfiles()) {
      await bridge.removeProfile(profile.profileId)
    }
    return (await bridge.listProfiles()).length === 0
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
      journeyPreparation: settledAt - startedAt
    })
  }

  function result(
    value: WanexDesktopProviderRelaunchProofValue
  ): WanexDesktopProviderRelaunchProofResult {
    return createProofResult(expected.step, value)
  }

  async function showSettingsSection(section: string): Promise<void> {
    const nav = await waitFor(() => {
      const candidate = document.querySelector(
        `[data-ui-settings-panel] [data-ui-settings-nav="${section}"]`
      )
      return candidate instanceof HTMLButtonElement ? candidate : undefined
    }, 10_000, "settings_navigation")
    nav.click()
  }

  async function configureAppearance(): Promise<boolean> {
    await showSettingsSection("appearance")
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
    const configured = document.querySelector(
      '[data-ui-assistant-shell][data-theme="dark"][data-density="compact"]'
    ) !== null
    await showSettingsSection("models")
    return configured
  }

  function configuredProviderCount(): number {
    const settingsCount = document.querySelector(
      "[data-ui-provider-settings]"
    )?.getAttribute("data-ui-provider-count")
    if (settingsCount !== null && settingsCount !== undefined) {
      const parsed = Number(settingsCount)
      if (Number.isSafeInteger(parsed) && parsed >= 0) {
        lastKnownConfiguredProviderCount = parsed
        return parsed
      }
    }
    const rows = document.querySelectorAll("[data-ui-provider]").length
    if (rows > 0) {
      lastKnownConfiguredProviderCount = rows
      return rows
    }
    if (lastKnownConfiguredProviderCount > 0) {
      return lastKnownConfiguredProviderCount
    }
    return 0
  }

  function providerReady(): boolean {
    return document.querySelector('[data-ui-provider-state="ready"]') !== null
  }

  function providerModelVisible(): boolean {
    return document.querySelector("[data-ui-model-selector]")
      ?.textContent?.startsWith(expected.modelId) === true ||
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
    const modelSelector = document.querySelector('[data-ui-model-selector]')
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
      `active_${diagnosticToken(modelSelector?.getAttribute("data-ui-active-endpoint") ?? "missing")}`,
      `model_${diagnosticToken(modelSelector?.textContent ?? "missing")}`,
      `models_${diagnosticToken(modelSelector?.getAttribute("data-ui-model-endpoints") ?? "missing")}`,
      `providers_${String(configuredProviderCount())}`,
      `surface_${surface instanceof Element ? "yes" : "no"}`,
      `theme_${diagnosticToken(surface?.getAttribute("data-theme") ?? "missing")}`,
      `density_${diagnosticToken(surface?.getAttribute("data-density") ?? "missing")}`,
      `modelmatch_${providerModelVisible() ? "yes" : "no"}`,
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
    const initial = await waitFor(
      () => conversationComposer(),
      10_000,
      "composer_ready",
      composerDiagnostic
    )
    const initialUserRowIds = conversationRowIds(initial.surface, "user")
    const initialAssistantRowIds = conversationRowIds(initial.surface, "assistant")
    setControlValue(initial.textarea, "")
    await waitFor(() => {
      const current = conversationComposer()
      return current !== undefined &&
        current.textarea.value === "" &&
        current.button.disabled
        ? current
        : undefined
    }, 10_000, "composer_cleared", composerDiagnostic)
    const cleared = conversationComposer()
    if (cleared === undefined) {
      throw new Error("Provider relaunch conversation composer is unavailable")
    }
    setControlValue(cleared.textarea, options.source)
    const ready = await waitFor(() => {
      const current = conversationComposer()
      return current !== undefined &&
        current.textarea.value === options.source &&
        !current.button.disabled
        ? current
        : undefined
    }, 10_000, "composer_draft", composerDiagnostic)
    const submittedAt = performance.now()
    const submit = new Event("submit", { bubbles: true, cancelable: true })
    ready.form.dispatchEvent(submit)
    if (!submit.defaultPrevented) {
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
        `session_preserved_${String(options.expectedSessionId === undefined || currentSessionId === options.expectedSessionId)}`,
        composerDiagnostic()
      ].join(":")
    })
  }

  function conversationComposer(): {
    readonly surface: Element
    readonly form: HTMLFormElement
    readonly textarea: HTMLTextAreaElement
    readonly button: HTMLButtonElement
  } | undefined {
    const surface = document.querySelector('[data-ui-assistant-shell]')
    const form = surface?.querySelector(
      '[data-ui-composer][data-ui-composer-mode="submit"]'
    )
    const textarea = form?.querySelector('textarea[name="text"]')
    const button = form?.querySelector('button[type="submit"]')
    return surface instanceof Element &&
      form instanceof HTMLFormElement &&
      form.isConnected &&
      textarea instanceof HTMLTextAreaElement &&
      textarea.isConnected &&
      !textarea.disabled &&
      button instanceof HTMLButtonElement &&
      button.isConnected
      ? { surface, form, textarea, button }
      : undefined
  }

  function composerDiagnostic(): string {
    const surface = document.querySelector('[data-ui-assistant-shell]')
    const form = surface?.querySelector('[data-ui-composer]')
    const textarea = form?.querySelector('textarea[name="text"]')
    const button = form?.querySelector('button[type="submit"]')
    const timeline = surface?.querySelector('[data-ui-conversation-timeline]')
    return [
      `mode_${form?.getAttribute("data-ui-composer-mode") ?? "missing"}`,
      `form_connected_${String(form?.isConnected === true)}`,
      `textarea_${textarea instanceof HTMLTextAreaElement ? textarea.disabled ? "disabled" : "enabled" : "missing"}`,
      `draft_length_${String(textarea instanceof HTMLTextAreaElement ? textarea.value.length : 0)}`,
      `submit_${button instanceof HTMLButtonElement ? button.disabled ? "disabled" : "enabled" : "missing"}`,
      `conversation_${timeline?.getAttribute("data-ui-conversation-state") ?? "missing"}`,
      `readiness_${diagnosticToken(providerReadinessState())}`,
      `error_${diagnosticToken(rendererError())}`
    ].join(":")
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

  async function addReaderProvider(
    providerBaseUrl: string,
    credentialValue: string
  ): Promise<void> {
    const form = await waitFor(() => {
      const candidate = document.querySelector("[data-ui-provider-form]")
      return candidate instanceof HTMLFormElement ? candidate : undefined
    }, 10_000, "reader_provider_form")
    const preset = form.querySelector('[data-ui-select="presetId"]')
    if (!(preset instanceof HTMLButtonElement)) {
      throw new Error("Provider relaunch reader preset control is missing")
    }
    preset.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }))
    const option = await waitFor(() =>
      [...document.querySelectorAll('[role="option"][data-ui-select-option]')]
        .find((candidate) => candidate.getAttribute("data-ui-select-option") === "openai-compatible") as HTMLElement | undefined
    , 5_000, "reader_provider_preset")
    option.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    await waitFor(() => preset.getAttribute("aria-expanded") === "false" ? true : undefined, 5_000, "reader_provider_preset_closed")
    setField(form, "baseUrl", `${providerBaseUrl}/vision`)
    setField(form, "conversationModelId", expected.visionModelId)
    setField(form, "credential", credentialValue)
    const imageInput = form.elements.namedItem("conversationInputImage")
    if (!(imageInput instanceof HTMLInputElement)) {
      throw new Error("Provider relaunch reader image capability control is missing")
    }
    imageInput.checked = true
    const toolCalling = form.elements.namedItem("conversationToolCalling")
    if (toolCalling instanceof HTMLInputElement) toolCalling.checked = false
    const active = form.elements.namedItem("makeConversationActive")
    if (!(active instanceof HTMLInputElement)) {
      throw new Error("Provider relaunch reader active control is missing")
    }
    active.checked = false
    submit(form)
    await waitFor(() =>
      configuredProviderCount() === 2 &&
      [...document.querySelectorAll("[data-ui-provider]")].some((candidate) =>
        candidate.getAttribute("data-ui-conversation-model-id") === expected.visionModelId
      )
        ? true
        : undefined
    , 10_000, "reader_provider_saved")
  }

  async function openAddMenuItem(
    trigger: Element | null,
    action: string
  ): Promise<HTMLElement> {
    // Attachments, folders, commands and workflows share one Add menu.
    if (!(trigger instanceof HTMLElement)) throw new Error("composer Add menu is unavailable")
    trigger.dispatchEvent(new PointerEvent("pointerdown", {
      button: 0,
      bubbles: true,
      cancelable: true,
      pointerType: "mouse"
    }))
    const deadline = performance.now() + 5_000
    while (performance.now() < deadline) {
      const item = document.querySelector(`[data-ui-add-menu] [data-ui-action="${action}"]`)
      if (item instanceof HTMLElement) return item
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    throw new Error(`composer Add menu item unavailable: ${action}`)
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
