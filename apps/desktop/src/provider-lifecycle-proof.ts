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
  removeSelectedAndRunFallback(): Promise<WanexDesktopProviderLifecycleRemovalResult>
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
      const selectedProvider = [...document.querySelectorAll(
        "[data-ui-provider]"
      )].find((provider) =>
        provider.getAttribute("data-ui-conversation-model-id") ===
          expected.selectedDraftModelId
      )
      const edit = selectedProvider?.querySelector("[data-ui-provider-edit]")
      if (!(edit instanceof HTMLButtonElement)) {
        throw new Error("selected proof Provider edit control is missing")
      }
      edit.click()
      const form = await waitFor(() => {
        const candidate = document.querySelector("[data-ui-provider-form]")
        return candidate instanceof HTMLFormElement ? candidate : undefined
      })
      const credential = form.elements.namedItem("credential")
      if (
        !(credential instanceof HTMLInputElement) ||
        credential.required ||
        credential.value !== ""
      ) {
        throw new Error("Provider edit did not make credential optional")
      }
      setProviderField(form, "conversationModelId", expected.selectedModelId)
      submitProviderFormElement(form)
      await waitFor(() =>
        document.querySelector(
          `[data-ui-provider][data-ui-conversation-model-id="${expected.selectedModelId}"]`
        ) !== null
      )
      const edited = document.querySelector(
        `[data-ui-provider][data-ui-conversation-model-id="${expected.selectedModelId}"]`
      )
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
    async removeSelectedAndRunFallback() {
      await openProviderSettings()
      const selected = document.querySelector(
        `[data-ui-provider][data-ui-conversation-model-id="${expected.selectedModelId}"]`
      )
      const remove = selected?.querySelector("[data-ui-provider-remove]")
      if (!(remove instanceof HTMLButtonElement)) {
        throw new Error("selected proof Provider remove control is missing")
      }
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
      const surface = document.querySelector('[data-ui-product-shell]')
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
      const fallbackText = surface?.querySelector(
        '[data-ui-composer] textarea[name="text"]'
      )
      const fallbackButton = surface?.querySelector(
        '[data-ui-composer] button[type="submit"]'
      )
      const beforeAssistantRows = surface?.querySelectorAll(
        '[data-ui-conversation-row][data-ui-role="assistant"]'
      ).length ?? 0
      if (
        !(fallbackText instanceof HTMLTextAreaElement) ||
        !(fallbackButton instanceof HTMLButtonElement)
      ) {
        throw new Error("fallback conversation composer is missing")
      }
      setControlValue(fallbackText, "Verify the surviving Provider")
      const enter = new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true
      })
      fallbackText.dispatchEvent(enter)
      if (!enter.defaultPrevented) {
        throw new Error("fallback conversation was not submitted")
      }
      await waitFor(() => {
        const currentSurface = document.querySelector(
          '[data-ui-product-shell]'
        )
        const rows = [
          ...(currentSurface?.querySelectorAll(
            '[data-ui-conversation-row][data-ui-role="assistant"]'
          ) ?? [])
        ]
        return rows.length > beforeAssistantRows &&
          rows.at(-1)?.textContent?.includes(expected.fallbackResponse) === true
      })
      return {
        activeProviderRemoved: true,
        fallbackProviderReady: true,
        fallbackModelId,
        fallbackModelResponseVisible: true
      }
    }
  }

  async function submitProviderForm(request: {
    readonly baseUrl: string
    readonly modelId: string
    readonly active: boolean
    readonly credential: string
  }): Promise<void> {
    const form = await waitFor(() => {
      const candidate = document.querySelector("[data-ui-provider-form]")
      return candidate instanceof HTMLFormElement ? candidate : undefined
    })
    setProviderField(form, "presetId", "openai-compatible")
    setProviderField(form, "baseUrl", request.baseUrl)
    setProviderField(form, "conversationModelId", request.modelId)
    setProviderField(form, "credential", request.credential)
    const active = form.elements.namedItem("makeConversationActive")
    if (active instanceof HTMLInputElement) active.checked = request.active
    submitProviderFormElement(form)
    await waitFor(() =>
      document.querySelector('[data-ui-provider-status]')?.textContent
        ?.includes("Provider saved") === true
    )
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
    throw new Error("Product Desktop proof condition timed out")
  }
}
