import {
  WANEX_DESKTOP_PROOF_CODE,
  WANEX_DESKTOP_PROOF_FALLBACK_RESPONSE,
  WANEX_DESKTOP_PROOF_HEADING,
  WANEX_DESKTOP_PROOF_INITIAL_MODEL_ID,
  WANEX_DESKTOP_PROOF_SELECTED_DRAFT_MODEL_ID,
  WANEX_DESKTOP_PROOF_SELECTED_MODEL_ID,
  WANEX_DESKTOP_PROOF_SELECTED_RESPONSE,
  WANEX_DESKTOP_PROOF_TEXT,
  type WanexDesktopRendererProofResult
} from "./proof-contract.js"
import {
  wanexDesktopProviderLifecycleProofFactorySource,
  type WanexDesktopProviderLifecycleProofFactory
} from "./provider-lifecycle-proof.js"
import {
  wanexDesktopRendererLayoutProofFactorySource,
  type WanexDesktopRendererLayoutProofFactory
} from "./renderer-layout-proof.js"

export {
  WANEX_DESKTOP_PROOF_CODE,
  WANEX_DESKTOP_PROOF_FALLBACK_RESPONSE,
  WANEX_DESKTOP_PROOF_HEADING,
  WANEX_DESKTOP_PROOF_INITIAL_MODEL_ID,
  WANEX_DESKTOP_PROOF_SELECTED_DRAFT_MODEL_ID,
  WANEX_DESKTOP_PROOF_SELECTED_MODEL_ID,
  WANEX_DESKTOP_PROOF_SELECTED_RESPONSE,
  WANEX_DESKTOP_PROOF_TEXT,
  type WanexDesktopRendererProofResult
} from "./proof-contract.js"

export function wanexDesktopRendererProofScript(options: {
  readonly providerBaseUrl: string
  readonly credential: string
}): string {
  return `(${runWanexDesktopRendererProof.toString()})(${JSON.stringify(
    {
      source: WANEX_DESKTOP_PROOF_TEXT,
      heading: WANEX_DESKTOP_PROOF_HEADING,
      code: WANEX_DESKTOP_PROOF_CODE,
      primaryBaseUrl: `${options.providerBaseUrl}/primary`,
      selectedBaseUrl: `${options.providerBaseUrl}/selected`,
      credential: options.credential,
      primaryModelId: WANEX_DESKTOP_PROOF_INITIAL_MODEL_ID,
      selectedDraftModelId: WANEX_DESKTOP_PROOF_SELECTED_DRAFT_MODEL_ID,
      selectedModelId: WANEX_DESKTOP_PROOF_SELECTED_MODEL_ID,
      selectedResponse: WANEX_DESKTOP_PROOF_SELECTED_RESPONSE,
      fallbackResponse: WANEX_DESKTOP_PROOF_FALLBACK_RESPONSE
    }
  )}, ${wanexDesktopProviderLifecycleProofFactorySource()}, ${wanexDesktopRendererLayoutProofFactorySource()})`
}

interface WanexDesktopRendererProofExpected {
  readonly source: string
  readonly heading: string
  readonly code: string
  readonly primaryBaseUrl: string
  readonly selectedBaseUrl: string
  readonly credential: string
  readonly primaryModelId: string
  readonly selectedDraftModelId: string
  readonly selectedModelId: string
  readonly selectedResponse: string
  readonly fallbackResponse: string
}

async function runWanexDesktopRendererProof(
  expected: WanexDesktopRendererProofExpected,
  createProviderLifecycleProof: WanexDesktopProviderLifecycleProofFactory,
  createLayoutProof: WanexDesktopRendererLayoutProofFactory
): Promise<WanexDesktopRendererProofResult> {
  const startedAt = performance.now()
  const initialDocument = document
  const initialTimeOrigin = performance.timeOrigin
  const providerLifecycle = createProviderLifecycleProof(expected)
  const layout = createLayoutProof()
  let providerConfigured = false
  let providerEditedWithoutCredential = false
  let configuredProviderCount = 0
  let selectedEndpointId = ""
  let activeProviderRemoved = false
  let fallbackProviderReady = false
  let fallbackModelResponseVisible = false
  let failureStage = "provider_configure"

  try {
    const configured = await providerLifecycle.configure()
    providerConfigured = configured.providerConfigured
    providerEditedWithoutCredential = configured.providerEditedWithoutCredential
    configuredProviderCount = configured.configuredProviderCount
    selectedEndpointId = configured.selectedEndpointId

    failureStage = "settings_close"
    const closeSettings = document.querySelector(
      '[data-ui-settings-panel] [aria-label="Close settings"]'
    )
    if (!(closeSettings instanceof HTMLButtonElement)) {
      throw new Error("Provider settings close control is missing")
    }
    closeSettings.click()
    await waitFor(() =>
      document.querySelector("[data-ui-settings-panel]") === null
        ? true
        : undefined
    , "settings_close")

    failureStage = "renderer_ready"
    const ready = await waitFor(() => {
      const surface = document.querySelector(
        '[data-ui-product-shell]'
      )
      const composer = surface?.querySelector(
        '[data-ui-composer][data-ui-composer-mode="submit"]'
      )
      const textarea = composer?.querySelector('textarea[name="text"]')
      const button = composer?.querySelector('button[type="submit"]')
      const modelSelect = surface?.querySelector(
        '[data-ui-model-selector] select[name="endpointId"]'
      )
      return surface instanceof HTMLElement &&
        composer instanceof HTMLFormElement &&
        textarea instanceof HTMLTextAreaElement &&
        button instanceof HTMLButtonElement &&
        modelSelect instanceof HTMLSelectElement &&
        !textarea.disabled &&
        !modelSelect.disabled
        ? { button, composer, modelSelect, surface, textarea }
        : undefined
    }, "renderer_ready")

    const initialUserRowIds = rowIds(ready.surface, "user")
    const initialAssistantRowIds = rowIds(ready.surface, "assistant")
    failureStage = "model_switch"
    setControlValue(ready.textarea, expected.source)
    setControlValue(ready.modelSelect, selectedEndpointId)
    if (ready.modelSelect.value !== selectedEndpointId) {
      throw new Error("selected Provider endpoint is not available")
    }

    const switched = await waitFor(() => {
      const composer = document.querySelector(
        '[data-ui-composer][data-ui-composer-mode="submit"]'
      )
      const textarea = composer?.querySelector('textarea[name="text"]')
      const button = composer?.querySelector('button[type="submit"]')
      const modelSelect = document.querySelector(
        '[data-ui-model-selector] select[name="endpointId"]'
      )
      return textarea instanceof HTMLTextAreaElement &&
        button instanceof HTMLButtonElement &&
        modelSelect instanceof HTMLSelectElement &&
        modelSelect.value === selectedEndpointId &&
        textarea.value === expected.source &&
        !textarea.disabled &&
        !button.disabled
        ? { button, composer: composer as HTMLFormElement, modelSelect, textarea }
        : undefined
    }, "model_switch")
    const initialLayout = layout.captureInitialLayout(
      ready.surface,
      switched.composer
    )
    failureStage = "conversation_settlement"
    const submittedAt = performance.now()
    const enter = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true
    })
    switched.textarea.dispatchEvent(enter)
    if (!enter.defaultPrevented) {
      throw new Error("Browser composer did not handle Enter submission")
    }

    const settled = await waitFor(() => {
      const surface = document.querySelector(
        '[data-ui-product-shell]'
      )
      if (!(surface instanceof HTMLElement)) return undefined
      const users = addedRows(surface, initialUserRowIds, "user")
      const assistants = addedRows(surface, initialAssistantRowIds, "assistant")
      const latestUser = users.at(-1)
      const latestAssistant = assistants.at(-1)
      const session = surface.querySelector(
        '[data-ui-session-select][aria-current="true"]'
      )
      const sessionId = session?.getAttribute("data-ui-session-select") ?? ""
      const selectedSessionTitle = surface.querySelector(
        "[data-ui-selected-session-title]"
      )?.textContent?.trim() ?? ""
      const listedSessionTitle = session?.querySelector(
        "[data-ui-session-title]"
      )?.textContent?.trim() ?? ""
      const richHeadingVisible = latestUser?.querySelector(
        "[data-ui-rich-text] h1"
      )?.textContent === expected.heading
      const richCodeVisible = latestUser?.querySelector(
        "[data-ui-rich-text] pre code"
      )?.textContent?.trim() === expected.code
      const responseVisible = latestAssistant?.textContent?.includes(
        expected.selectedResponse
      ) === true
      return users.length === 1 &&
        assistants.length === 1 &&
        sessionId.length > 0 &&
        richHeadingVisible &&
        richCodeVisible &&
        responseVisible
        ? {
            assistants,
            latestAssistant: latestAssistant as HTMLElement,
            latestUser: latestUser as HTMLElement,
            listedSessionTitle,
            selectedSessionTitle,
            session: session as HTMLElement,
            sessionId,
            surface,
            users
          }
        : undefined
    }, "conversation_settlement")
    const settledAt = performance.now()

    failureStage = "canonical_command"
    const commandOpener = settled.surface.querySelector(
      '[data-ui-action="open-commands"]'
    )
    if (!(commandOpener instanceof HTMLButtonElement) || commandOpener.disabled) {
      throw new Error("Product command opener is unavailable")
    }
    commandOpener.click()
    const commandPalette = await waitFor(() => {
      const palette = settled.surface.querySelector("[data-ui-command-palette]")
      return palette instanceof HTMLElement ? palette : undefined
    }, "command_palette")
    const statusCommand = commandPalette.querySelector(
      '[data-ui-command="product.status"]'
    )
    if (!(statusCommand instanceof HTMLButtonElement)) {
      throw new Error("Canonical status command is missing")
    }
    statusCommand.click()
    const commandPreview = await waitFor(() => {
      const preview = settled.surface.querySelector(
        '[data-ui-command-preview="runnable"]'
      )
      const execute = preview === null
        ? null
        : [...preview.querySelectorAll("button")].find((button) =>
            button.textContent?.trim() === "Execute"
          )
      return preview instanceof HTMLElement && execute instanceof HTMLButtonElement
        ? { execute, preview }
        : undefined
    }, "command_preview")
    commandPreview.execute.click()
    const commandExecution = await waitFor(() => {
      const execution = settled.surface.querySelector(
        '[data-ui-command-execution="completed"]'
      )
      const done = execution === null
        ? null
        : [...execution.querySelectorAll("button")].find((button) =>
            button.textContent?.trim() === "Done"
          )
      const completionVisible = execution?.textContent?.includes(
        "Command completed"
      ) === true
      return execution instanceof HTMLElement &&
        done instanceof HTMLButtonElement &&
        completionVisible
        ? { done, execution }
        : undefined
    }, "command_execution")
    commandExecution.done.click()
    await waitFor(() =>
      settled.surface.querySelector("[data-ui-command-palette]") === null
        ? true
        : undefined
    , "command_close")

    const timeline = settled.surface.querySelector(
      "[data-ui-conversation-timeline]"
    )
    const composer = settled.surface.querySelector("[data-ui-composer]")
    const modelSelect = settled.surface.querySelector(
      '[data-ui-model-selector] select[name="endpointId"]'
    )
    const attachmentInput = settled.surface.querySelector(
      "[data-ui-attachment-input]"
    )
    const workflowTrigger = settled.surface.querySelector(
      "[data-ui-open-workflows]"
    )
    const timelineRect = timeline?.getBoundingClientRect()
    const latestAssistantRect = settled.latestAssistant.getBoundingClientRect()
    const rootHtml = settled.surface.innerHTML
    const soleProductRenderer =
      document.querySelectorAll("[data-ui-product-shell]").length === 1
    const unknownRouteRejected = await fetch(
      new URL("/__unknown-route__", location.href),
      { redirect: "manual" }
    ).then((response) => response.status === 404).catch(() => false)
    const providerReady = settled.surface.querySelector(
      '[data-ui-provider-state="ready"]'
    ) !== null
    const selectedModelResponseVisible = settled.latestAssistant.textContent
      ?.includes(expected.selectedResponse) === true
    const conversationIdentityIntegrity =
      settled.selectedSessionTitle === expected.heading &&
      settled.listedSessionTitle === expected.heading &&
      !settled.selectedSessionTitle.includes(expected.code) &&
      !settled.listedSessionTitle.includes(expected.code)
    const sessionNavigationTruth =
      settled.session.getAttribute("aria-current") === "true" &&
      settled.session.querySelector("[data-ui-session-title]") !== null &&
      settled.session.querySelector("small")?.textContent?.trim() === "active"
    const canonicalTranscriptIntegrity =
      settled.users.length === 1 &&
      settled.assistants.length === 1 &&
      settled.surface.querySelector("[data-ui-transient-assistant]") === null
    const conversationTimelineSemantics =
      settled.latestUser.tagName === "ARTICLE" &&
      settled.latestAssistant.tagName === "ARTICLE" &&
      settled.latestUser.getAttribute("data-ui-role") === "user" &&
      settled.latestAssistant.getAttribute("data-ui-role") === "assistant" &&
      settled.latestUser.querySelector("[data-ui-message-header]") === null &&
      settled.latestAssistant.querySelector("[data-ui-message-header]") === null &&
      timeline?.getAttribute("role") === "log" &&
      timeline?.getAttribute("aria-label") === "Conversation messages"
    const chatFirstInformationArchitecture =
      settled.surface.querySelector('[data-ui-session-drawer][aria-label="Conversation navigation"]') !== null &&
      settled.surface.querySelector("[data-ui-session-list]") !== null &&
      settled.surface.querySelector('[data-ui-conversation-main][aria-label="Conversation"]') !== null &&
      settled.surface.querySelector("[data-ui-settings-panel]") === null &&
      settled.surface.querySelector("[data-ui-workflows-panel]") === null
    const workflowsContextual =
      workflowTrigger instanceof HTMLButtonElement &&
      !workflowTrigger.disabled &&
      workflowTrigger.textContent?.includes("Workflows") === true &&
      settled.surface.querySelector("[data-ui-workflows-panel]") === null
    const composerControlsComplete =
      composer instanceof HTMLFormElement &&
      modelSelect instanceof HTMLSelectElement &&
      attachmentInput instanceof HTMLInputElement &&
      workflowTrigger instanceof HTMLButtonElement &&
      composer.querySelector('textarea[aria-label="Message"]') !== null &&
      composer.querySelector('button[aria-label="Send message"]') !== null
    const commandPaletteContextual =
      commandPalette.getAttribute("role") === "dialog" &&
      commandPalette.getAttribute("aria-label") === "Commands"
    const canonicalCommandPreviewed =
      commandPreview.preview.getAttribute("data-ui-command-preview") === "runnable"
    const canonicalCommandExecuted =
      commandExecution.execution.getAttribute("data-ui-command-execution") === "completed"
    const commandCompletionVisible =
      commandExecution.execution.textContent?.includes("Command completed") === true
    const internalExecutionIdentitiesHidden = [
      "data-turn-id",
      "data-job-id",
      "data-attempt-id",
      "data-control-id",
      'name="turnId"',
      'name="jobId"',
      'name="attemptId"',
      "secretRef"
    ].every((fragment) => !rootHtml.includes(fragment))
    const developerControlsAbsent = [...settled.surface.querySelectorAll("button")]
      .every((button) => !["Diagnostics", "Workbench", "Command catalog"]
        .some((label) => button.textContent?.includes(label)))
    const conversationSpaceAllocation =
      initialLayout.initialScrollPolicyValid &&
      initialLayout.timelineHeight > 0 &&
      initialLayout.composerDockHeight > 0 &&
      initialLayout.composerHeight > 0 &&
      timeline instanceof HTMLElement &&
      layout.isTimelineScrollOwner(timeline) &&
      timelineRect !== undefined &&
      latestAssistantRect.top >= timelineRect.top &&
      latestAssistantRect.bottom <= timelineRect.bottom
    const providerEvidenceRedacted =
      !document.documentElement.innerHTML.includes(expected.credential) &&
      !document.documentElement.innerHTML.includes("secretRef")

    failureStage = "provider_lifecycle"
    const lifecycle = await providerLifecycle.removeSelectedAndRunFallback(
      (progress) => {
        if (progress.activeProviderRemoved === true) activeProviderRemoved = true
        if (progress.fallbackProviderReady === true) fallbackProviderReady = true
        if (progress.fallbackModelResponseVisible === true) {
          fallbackModelResponseVisible = true
        }
      }
    )
    const providerLifecycleWithoutRestart =
      document === initialDocument && performance.timeOrigin === initialTimeOrigin
    const result: WanexDesktopRendererProofResult = {
      ok:
        providerConfigured &&
        providerEditedWithoutCredential &&
        configuredProviderCount === 2 &&
        providerEvidenceRedacted &&
        lifecycle.activeProviderRemoved &&
        lifecycle.fallbackProviderReady &&
        lifecycle.fallbackModelResponseVisible &&
        providerLifecycleWithoutRestart &&
        providerReady &&
        soleProductRenderer &&
        unknownRouteRejected &&
        conversationIdentityIntegrity &&
        canonicalTranscriptIntegrity &&
        canonicalCommandPreviewed &&
        canonicalCommandExecuted &&
        commandCompletionVisible &&
        internalExecutionIdentitiesHidden &&
        selectedModelResponseVisible,
      sessionId: settled.sessionId,
      providerConfigured,
      providerEditedWithoutCredential,
      configuredProviderCount,
      providerEvidenceRedacted,
      activeProviderRemoved: lifecycle.activeProviderRemoved,
      fallbackProviderReady: lifecycle.fallbackProviderReady,
      fallbackModelId: lifecycle.fallbackModelId,
      fallbackModelResponseVisible: lifecycle.fallbackModelResponseVisible,
      providerLifecycleWithoutRestart,
      initialLayout,
      userVisible: true,
      assistantVisible: true,
      providerReady,
      modelSelectorVisible: layout.intersectsViewport(modelSelect),
      modelSwitchAccepted: true,
      draftPreservedAcrossModelSwitch: true,
      selectedModelEndpointId:
        modelSelect instanceof HTMLSelectElement ? modelSelect.value : "",
      selectedModelId: expected.selectedModelId,
      selectedModelResponseVisible,
      richHeadingVisible: true,
      richCodeVisible: true,
      selectedSessionTitle: settled.selectedSessionTitle,
      listedSessionTitle: settled.listedSessionTitle,
      conversationIdentityIntegrity,
      soleProductRenderer,
      unknownRouteRejected,
      sessionNavigationTruth,
      canonicalTranscriptIntegrity,
      conversationTimelineSemantics,
      chatFirstInformationArchitecture,
      conversationSpaceAllocation,
      composerVisible: layout.intersectsViewport(composer),
      latestAssistantVisible: layout.intersectsViewport(settled.latestAssistant),
      workflowsContextual,
      composerControlsComplete,
      commandPaletteContextual,
      canonicalCommandPreviewed,
      canonicalCommandExecuted,
      commandCompletionVisible,
      internalExecutionIdentitiesHidden,
      developerControlsAbsent,
      timingsMs: {
        rendererInteractive: Math.max(0, submittedAt - startedAt),
        conversationSettlement: Math.max(0, settledAt - submittedAt),
        rendererPostSettlement: Math.max(0, performance.now() - settledAt)
      }
    }
    return result
  } catch {
    return failedResult(failureStage)
  }

  function rowIds(
    surface: Element,
    role: "user" | "assistant"
  ): Set<string> {
    return new Set([...surface.querySelectorAll(
      `[data-ui-conversation-row][data-ui-role="${role}"]`
    )].map((row) => row.getAttribute("data-ui-conversation-row") ?? ""))
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

  function addedRows(
    surface: Element,
    initial: ReadonlySet<string>,
    role: "user" | "assistant"
  ): HTMLElement[] {
    return [...surface.querySelectorAll(
      `[data-ui-conversation-row][data-ui-role="${role}"]`
    )].filter((row): row is HTMLElement =>
      row instanceof HTMLElement &&
      !initial.has(row.getAttribute("data-ui-conversation-row") ?? "")
    )
  }

  async function waitFor<T>(
    read: () => T | false | undefined,
    stage: string
  ): Promise<T> {
    const end = Date.now() + 20_000
    while (Date.now() < end) {
      const value = read()
      if (value !== undefined && value !== false) return value
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    throw new Error(`desktop browser proof timed out during ${stage}`)
  }

  function failedResult(stage: string): WanexDesktopRendererProofResult {
    const surface = document.querySelector("[data-ui-product-shell]")
    const composer = surface?.querySelector("[data-ui-composer]")
    const textarea = composer?.querySelector("textarea[name=\"text\"]")
    const modelSelector = surface?.querySelector(
      '[data-ui-model-selector] select[name="endpointId"]'
    )
    const providerState = document.querySelector(
      '[data-ui-provider-state]'
    )?.getAttribute("data-ui-provider-state") ?? undefined
    const activeSession = surface?.querySelector(
      '[data-ui-session-select][aria-current="true"]'
    )
    const latestUser = [...(surface?.querySelectorAll(
      '[data-ui-conversation-row][data-ui-role="user"]'
    ) ?? [])].at(-1)
    const latestAssistant = [...(surface?.querySelectorAll(
      '[data-ui-conversation-row][data-ui-role="assistant"]'
    ) ?? [])].at(-1)
    return {
      ok: false,
      failureStage: stage,
      failureDiagnostics: {
        surfaceCount: document.querySelectorAll("[data-ui-product-shell]").length,
        userRowCount: surface?.querySelectorAll(
          '[data-ui-conversation-row][data-ui-role="user"]'
        ).length ?? 0,
        assistantRowCount: surface?.querySelectorAll(
          '[data-ui-conversation-row][data-ui-role="assistant"]'
        ).length ?? 0,
        composerCount: surface?.querySelectorAll("[data-ui-composer]").length ?? 0,
        composerDisabled: textarea instanceof HTMLTextAreaElement
          ? textarea.disabled
          : true,
        modelSelectorCount: surface?.querySelectorAll(
          '[data-ui-model-selector] select[name="endpointId"]'
        ).length ?? 0,
        modelSelectorDisabled: modelSelector instanceof HTMLSelectElement
          ? modelSelector.disabled
          : true,
        ...(providerState === undefined ? {} : { providerState }),
        errorVisible: document.querySelector("[data-ui-error]") !== null,
        activeSessionCount: surface?.querySelectorAll(
          '[data-ui-session-select][aria-current="true"]'
        ).length ?? 0,
        activeSessionIdPresent:
          (activeSession?.getAttribute("data-ui-session-select")?.length ?? 0) > 0,
        richHeadingVisible: latestUser?.querySelector(
          "[data-ui-rich-text] h1"
        )?.textContent === expected.heading,
        richCodeVisible: latestUser?.querySelector(
          "[data-ui-rich-text] pre code"
        )?.textContent?.trim() === expected.code,
        selectedResponseVisible: latestAssistant?.textContent?.includes(
          expected.selectedResponse
        ) === true,
      },
      sessionId: "",
      providerConfigured,
      providerEditedWithoutCredential,
      configuredProviderCount,
      providerEvidenceRedacted: false,
      activeProviderRemoved,
      fallbackProviderReady,
      fallbackModelId: "",
      fallbackModelResponseVisible,
      providerLifecycleWithoutRestart: false,
      initialLayout: layout.emptyInitialLayout(),
      userVisible: false,
      assistantVisible: false,
      providerReady: false,
      modelSelectorVisible: false,
      modelSwitchAccepted: false,
      draftPreservedAcrossModelSwitch: false,
      selectedModelEndpointId: "",
      selectedModelId: "",
      selectedModelResponseVisible: false,
      richHeadingVisible: false,
      richCodeVisible: false,
      selectedSessionTitle: "",
      listedSessionTitle: "",
      conversationIdentityIntegrity: false,
      soleProductRenderer: false,
      unknownRouteRejected: false,
      sessionNavigationTruth: false,
      canonicalTranscriptIntegrity: false,
      conversationTimelineSemantics: false,
      chatFirstInformationArchitecture: false,
      conversationSpaceAllocation: false,
      composerVisible: false,
      latestAssistantVisible: false,
      workflowsContextual: false,
      composerControlsComplete: false,
      commandPaletteContextual: false,
      canonicalCommandPreviewed: false,
      canonicalCommandExecuted: false,
      commandCompletionVisible: false,
      internalExecutionIdentitiesHidden: false,
      developerControlsAbsent: false,
      timingsMs: {
        rendererInteractive: 0,
        conversationSettlement: 0,
        rendererPostSettlement: 0
      }
    }
  }
}
