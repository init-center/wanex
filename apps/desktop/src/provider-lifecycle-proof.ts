export interface WanexDesktopProviderLifecycleProofExpected {
  readonly primaryBaseUrl: string
  readonly selectedBaseUrl: string
  readonly credential: string
  readonly primaryModelId: string
  readonly selectedDraftModelId: string
  readonly selectedModelId: string
  readonly fallbackResponse: string
}

export interface WanexDesktopProviderLifecycleConfiguredResult {
  readonly providerConfigured: true
  readonly providerEditedWithoutCredential: true
  readonly configuredProviderCount: 2
  readonly selectedEndpointId: string
}

export interface WanexDesktopProviderLifecycleRemovalResult {
  readonly activeProviderRemoved: true
  readonly fallbackProviderReady: true
  readonly fallbackModelId: string
  readonly fallbackModelResponseVisible: true
}

export interface WanexDesktopProviderLifecycleProof {
  configure(): Promise<WanexDesktopProviderLifecycleConfiguredResult>
  removeSelectedAndRunFallback(
    reportProgress: (
      progress: Partial<WanexDesktopProviderLifecycleRemovalResult>
    ) => void
  ): Promise<WanexDesktopProviderLifecycleRemovalResult>
}

export type WanexDesktopProviderLifecycleProofFactory = (
  expected: WanexDesktopProviderLifecycleProofExpected
) => WanexDesktopProviderLifecycleProof

export function wanexDesktopProviderLifecycleProofFactorySource(): string {
  return createWanexDesktopProviderLifecycleProof.toString()
}

function createWanexDesktopProviderLifecycleProof(
  expected: WanexDesktopProviderLifecycleProofExpected
): WanexDesktopProviderLifecycleProof {
  return {
    async configure() {
      await submitProviderForm({
        baseUrl: expected.primaryBaseUrl,
        modelId: expected.primaryModelId,
        active: true,
        credential: expected.credential
      })
      await waitFor(() =>
        document.querySelectorAll("[data-ui-provider]").length === 1 &&
        document.querySelector('[data-ui-provider-state="ready"]') !== null
      )

      await openProviderSettings()
      await submitProviderForm({
        baseUrl: expected.selectedBaseUrl,
        modelId: expected.selectedDraftModelId,
        active: false,
        credential: expected.credential
      })
      await waitFor(() =>
        document.querySelectorAll("[data-ui-provider]").length === 2
      )
      await openProviderSettings()
      const edit = await waitFor(() => {
        const selectedProvider = [...document.querySelectorAll(
          "[data-ui-provider]"
        )].find((provider) =>
          provider.getAttribute("data-ui-conversation-model-id") ===
            expected.selectedDraftModelId
        )
        const candidate = selectedProvider?.querySelector(
          "[data-ui-provider-edit]"
        )
        return candidate instanceof HTMLButtonElement && !candidate.disabled
          ? candidate
          : undefined
      })
      edit.click()
      const form = await waitFor(() => {
        const candidate = document.querySelector("[data-ui-provider-form]")
        const credential = candidate instanceof HTMLFormElement
          ? candidate.elements.namedItem("credential")
          : undefined
        const submit = candidate?.querySelector('button[type="submit"]')
        return candidate instanceof HTMLFormElement &&
          credential instanceof HTMLInputElement &&
          !credential.required &&
          credential.value === "" &&
          submit instanceof HTMLButtonElement &&
          !submit.disabled
          ? candidate
          : undefined
      })
      const credential = form.elements.namedItem("credential")
      if (!(credential instanceof HTMLInputElement)) {
        throw new Error("Provider edit did not make credential optional")
      }
      setProviderField(form, "conversationModelId", expected.selectedModelId)
      submitProviderFormElement(form)
      await waitFor(() =>
        document.querySelector(
          `[data-ui-provider][data-ui-conversation-model-id="${expected.selectedModelId}"]`
        ) !== null
      )
      const edited = await waitFor(() => {
        const candidate = document.querySelector(
          `[data-ui-provider][data-ui-conversation-model-id="${expected.selectedModelId}"]`
        )
        const remove = candidate?.querySelector("[data-ui-provider-remove]")
        return candidate !== null &&
          remove instanceof HTMLButtonElement &&
          !remove.disabled
          ? candidate
          : undefined
      })
      const selectedEndpointId =
        edited?.getAttribute("data-ui-conversation-endpoint-id") ?? ""
      if (selectedEndpointId.length === 0) {
        throw new Error("edited proof Provider connection ID is missing")
      }
      return {
        providerConfigured: true,
        providerEditedWithoutCredential: true,
        configuredProviderCount: 2,
        selectedEndpointId
      }
    },
    async removeSelectedAndRunFallback(reportProgress) {
      const previous = await waitFor(() => settledComposer())
      const sessionId = previous.timeline.getAttribute("data-ui-session-id")
      const operationId = previous.timeline.getAttribute("data-ui-operation-id")
      await openProviderSettings()
      const remove = await waitFor(() => {
        const selected = document.querySelector(
          `[data-ui-provider][data-ui-conversation-model-id="${expected.selectedModelId}"]`
        )
        const candidate = selected?.querySelector("[data-ui-provider-remove]")
        return candidate instanceof HTMLButtonElement && !candidate.disabled
          ? candidate
          : undefined
      })
      const connectionId = remove.getAttribute("data-ui-provider-remove") ?? ""
      const originalConfirm = window.confirm
      window.confirm = () => true
      try {
        remove.click()
        await waitFor(() =>
          document.querySelector(
            `[data-ui-provider="${connectionId}"]`
          ) === null &&
          document.querySelectorAll("[data-ui-provider]").length === 1 &&
          document.querySelector('[data-ui-provider-state="ready"]') !== null
        )
      } finally {
        window.confirm = originalConfirm
      }
      const closeSettings = document.querySelector(
        '[data-ui-settings-panel] [aria-label="Close settings"]'
      )
      if (!(closeSettings instanceof HTMLButtonElement)) {
        throw new Error("Provider settings close control is missing")
      }
      closeSettings.click()
      await waitFor(() => document.querySelector("[data-ui-settings-panel]") === null)
      const ready = await waitFor(() => {
        const current = settledComposer()
        return current?.timeline.getAttribute("data-ui-session-id") === sessionId &&
          current.timeline.getAttribute("data-ui-operation-id") === operationId
          ? current
          : undefined
      })
      const surface = ready.surface
      const modelSelect = surface?.querySelector(
        '[data-ui-model-selector] select[name="endpointId"]'
      )
      const fallbackModelId =
        modelSelect instanceof HTMLSelectElement
          ? modelSelect.selectedOptions[0]?.textContent?.split(" - ")[0]?.trim() ?? ""
          : ""
      if (fallbackModelId !== expected.primaryModelId) {
        throw new Error(`Provider fallback selected unexpected model: ${fallbackModelId}`)
      }
      reportProgress({
        activeProviderRemoved: true,
        fallbackProviderReady: true,
        fallbackModelId
      })
      const beforeUsers = rowIds(surface, "user")
      const beforeAssistants = rowIds(surface, "assistant")
      setControlValue(ready.textarea, "")
      const cleared = await waitFor(() => {
        const current = settledComposer()
        return current !== undefined && current.textarea.value === "" &&
          current.button.disabled ? current : undefined
      })
      const source = "Verify the surviving Provider"
      setControlValue(cleared.textarea, source)
      const draft = await waitFor(() => {
        const current = settledComposer()
        return current !== undefined && current.textarea.value === source &&
          !current.button.disabled &&
          current.timeline.getAttribute("data-ui-session-id") === sessionId &&
          current.timeline.getAttribute("data-ui-operation-id") === operationId
          ? current : undefined
      })
      const submit = new Event("submit", { bubbles: true, cancelable: true })
      draft.form.dispatchEvent(submit)
      if (!submit.defaultPrevented) {
        throw new Error("fallback conversation was not submitted")
      }
      await waitFor(() => {
        const current = settledComposer()
        if (current === undefined ||
          current.timeline.getAttribute("data-ui-session-id") !== sessionId ||
          current.timeline.getAttribute("data-ui-operation-id") === operationId) {
          return false
        }
        const users = newRows(current.surface, beforeUsers, "user")
        const assistants = newRows(current.surface, beforeAssistants, "assistant")
        return users.length === 1 && assistants.length === 1 &&
          users[0]?.textContent?.includes(source) === true &&
          assistants[0]?.textContent?.includes(expected.fallbackResponse) === true
      })
      reportProgress({ fallbackModelResponseVisible: true })
      return {
        activeProviderRemoved: true,
        fallbackProviderReady: true,
        fallbackModelId,
        fallbackModelResponseVisible: true
      }
    }
  }

  function settledComposer() {
    const surface = document.querySelector('[data-ui-assistant-shell]')
    const timeline = surface?.querySelector(
      '[data-ui-conversation-timeline][data-ui-conversation-state="succeeded"]'
    )
    const form = surface?.querySelector(
      '[data-ui-composer][data-ui-composer-mode="submit"]'
    )
    const textarea = form?.querySelector('textarea[name="text"]')
    const button = form?.querySelector('button[type="submit"]')
    return surface instanceof HTMLElement && timeline instanceof HTMLElement &&
      Boolean(timeline.getAttribute("data-ui-session-id")) &&
      Boolean(timeline.getAttribute("data-ui-operation-id")) &&
      surface.querySelector("[data-ui-transient-assistant]") === null &&
      form instanceof HTMLFormElement && form.isConnected &&
      textarea instanceof HTMLTextAreaElement && textarea.isConnected &&
      !textarea.disabled && button instanceof HTMLButtonElement && button.isConnected
      ? { surface, timeline, form, textarea, button } : undefined
  }

  function rowIds(surface: Element, role: "user" | "assistant"): Set<string> {
    return new Set([...surface.querySelectorAll(
      `[data-ui-conversation-row][data-ui-role="${role}"]`
    )].map((row) => row.getAttribute("data-ui-conversation-row") ?? ""))
  }

  function newRows(surface: Element, before: Set<string>, role: "user" | "assistant") {
    return [...surface.querySelectorAll(
      `[data-ui-conversation-row][data-ui-role="${role}"]`
    )].filter((row) => {
      const id = row.getAttribute("data-ui-conversation-row")
      return id !== null && id.length > 0 && !before.has(id)
    })
  }

  async function submitProviderForm(request: {
    readonly baseUrl: string
    readonly modelId: string
    readonly active: boolean
    readonly credential: string
  }): Promise<void> {
    const form = await waitFor(() => {
      const candidate = document.querySelector("[data-ui-provider-form]")
      const submit = candidate?.querySelector('button[type="submit"]')
      return candidate instanceof HTMLFormElement &&
        submit instanceof HTMLButtonElement &&
        !submit.disabled
        ? candidate
        : undefined
    })
    setProviderField(form, "presetId", "openai-compatible")
    setProviderField(form, "baseUrl", request.baseUrl)
    setProviderField(form, "conversationModelId", request.modelId)
    setProviderField(form, "credential", request.credential)
    const active = form.elements.namedItem("makeConversationActive")
    if (active instanceof HTMLInputElement) active.checked = request.active
    submitProviderFormElement(form)
    await waitFor(() => {
      const candidate = document.querySelector(
        '[data-ui-provider-form] button[type="submit"]'
      )
      return candidate instanceof HTMLButtonElement && !candidate.disabled
        ? true
        : undefined
    })
  }

  async function openProviderSettings(): Promise<void> {
    const trigger = await waitFor(() => {
      const candidate = document.querySelector(
        '[data-ui-action="open-settings"]'
      )
      return candidate instanceof HTMLButtonElement ? candidate : undefined
    })
    trigger.click()
    await waitFor(() =>
      document.querySelector("[data-ui-settings-panel]") !== null
    )
  }

  function setProviderField(
    form: HTMLFormElement,
    name: string,
    value: string
  ): void {
    const field = form.elements.namedItem(name)
    if (!(field instanceof HTMLInputElement) && !(field instanceof HTMLSelectElement)) {
      throw new Error(`Provider proof field is missing: ${name}`)
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

  function submitProviderFormElement(form: HTMLFormElement): void {
    const event = new Event("submit", { bubbles: true, cancelable: true })
    form.dispatchEvent(event)
    if (!event.defaultPrevented) {
      throw new Error("Provider proof form was not submitted")
    }
  }

  async function waitFor<T>(
    read: () => T | false | undefined,
    timeoutMs = 10_000
  ): Promise<T> {
    const end = Date.now() + timeoutMs
    while (Date.now() < end) {
      const value = read()
      if (value !== undefined && value !== false) return value
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    throw new Error("Desktop proof condition timed out")
  }
}
