import type { WanexDesktopProviderRelaunchProofResult } from "./proof-contract.js"
import type {
  WanexDesktopProviderJourneyProofContext
} from "./provider-multimodal-proof.js"

export interface WanexDesktopProviderMediaRoutingProofExpected {
  readonly modelId: string
  readonly visionModelId: string
  readonly imageUnderstandingText: string
  readonly imageUnderstandingDescription: string
  readonly imageUnderstandingResponse: string
  readonly imageEditText: string
  readonly imageEditPrompt: string
  readonly imageEditResponse: string
  readonly pngBase64: string
  readonly multimodalImageLabel: string
}

export async function runWanexDesktopProviderMediaRoutingProof(
  expected: WanexDesktopProviderMediaRoutingProofExpected,
  context: WanexDesktopProviderJourneyProofContext
): Promise<WanexDesktopProviderRelaunchProofResult> {
  const startedAt = performance.now()
  const previousSessionId = document.querySelector(
    '[data-ui-session-select][aria-current="true"]'
  )?.getAttribute("data-ui-session-select")
  if (!previousSessionId) throw new Error("Media routing proof previous session is unavailable")
  await context.openProviderSettings()
  const readerEndpointId = await readerEndpoint()
  await editPrimaryProvider()
  await chooseImageUnderstandingEndpoint(readerEndpointId)
  const close = document.querySelector('[data-ui-action="close-settings"]')
  if (!(close instanceof HTMLButtonElement)) {
    throw new Error("Media routing proof settings close action is unavailable")
  }
  close.click()
  const newConversation = document.querySelector(
    '[data-ui-session-drawer] button[data-ui-initial-focus]'
  )
  if (!(newConversation instanceof HTMLButtonElement)) {
    throw new Error("Media routing proof new conversation action is unavailable")
  }
  newConversation.click()
  await context.waitFor(() =>
    document.querySelectorAll('[data-ui-conversation-row]').length === 0
      ? true : undefined
  , 10_000, "media_new_conversation")

  const firstAttachment = await uploadImage()
  const firstResourceId = firstAttachment.getAttribute("data-ui-resource-id") ?? ""
  const firstTurn = await context.submitConversation({
    source: expected.imageUnderstandingText,
    expectedResponse: expected.imageUnderstandingResponse
  })
  const firstResource = await context.waitFor(() => {
    const candidate = [...document.querySelectorAll(
      '[data-ui-resource][data-ui-resource-kind="image"]'
    )].find((resource) => resource.getAttribute("data-ui-resource") === firstResourceId)
    return candidate instanceof HTMLElement ? candidate : undefined
  }, 10_000, "image_understanding_resource")

  const secondAttachment = await uploadImage()
  const secondResourceId = secondAttachment.getAttribute("data-ui-resource-id") ?? ""
  const existingResourceIds = new Set([...document.querySelectorAll('[data-ui-resource]')]
    .map((resource) => resource.getAttribute("data-ui-resource")))
  existingResourceIds.add(secondResourceId)
  const editTurn = await submitImageReferenceConversation(firstTurn.sessionId)
  const imageEditTool = await context.waitFor(() => {
    const candidate = document.querySelector(
      '[data-ui-tool="image_generate"][data-ui-tool-state="succeeded"]'
    )
    return candidate instanceof HTMLElement ? candidate : undefined
  }, 20_000, "image_reference_tool")
  const output = await context.waitFor(() => {
    const candidates = [...document.querySelectorAll(
      '[data-ui-resource][data-ui-resource-kind="image"]'
    )].filter((resource) => {
      const id = resource.getAttribute("data-ui-resource")
      return !existingResourceIds.has(id)
    })
    const candidate = candidates.at(-1)
    const preview = candidate?.querySelector(
      '[data-ui-resource-preview][data-ui-preview-state="ready"] img'
    )
    return candidate instanceof HTMLElement && preview instanceof HTMLImageElement
      ? { candidate, preview }
      : undefined
  }, 20_000, "image_reference_resource")
  await restoreProviderRouting()
  await restoreSession(previousSessionId)
  const settledAt = performance.now()
  const resourceEvidenceValid =
    /^[a-f0-9]{64}$/.test(output.candidate.getAttribute("data-ui-resource-sha256") ?? "") &&
    Number(output.candidate.getAttribute("data-ui-resource-size")) > 0
  const previewVisible = isAssistantResourceDeliveryUrl(output.preview.src)
  const redacted = context.redacted()
  return context.result({
    ok:
      firstTurn.responseVisible &&
      editTurn.responseVisible &&
      firstResource !== undefined &&
      imageEditTool !== undefined &&
      resourceEvidenceValid &&
      previewVisible &&
      redacted,
    initialConfiguredProviderCount: 2,
    configuredProviderCount: 2,
    providerConfigured: true,
    providerReady: true,
    providerEvidenceRedacted: redacted,
    modelId: expected.modelId,
    sessionId: editTurn.sessionId,
    conversationSubmitted: true,
    userVisible: true,
    assistantVisible: true,
    responseVisible: editTurn.responseVisible,
    imageUnderstandingRouteSelected: true,
    imageUnderstandingDescriptionUsed: true,
    imageUnderstandingPrimaryNoImage: true,
    imageUnderstandingConversationSubmitted: firstTurn.responseVisible,
    imageEditConversationSubmitted: editTurn.responseVisible,
    imageEditToolSucceeded: imageEditTool !== undefined,
    imageEditResourceEvidenceValid: resourceEvidenceValid,
    imageEditResourcePreviewVisible: previewVisible,
    journeyPreparation: firstTurn.submittedAt - startedAt,
    conversationSettlement: settledAt - firstTurn.submittedAt,
    rendererPostSettlement: performance.now() - settledAt
  })

  async function editPrimaryProvider(): Promise<void> {
    const row = await context.waitFor(() =>
      [...document.querySelectorAll("[data-ui-provider]")].find((candidate) =>
        candidate.getAttribute("data-ui-conversation-model-id") === expected.modelId
      ) as HTMLElement | undefined
    , 10_000, "primary_provider")
    const edit = row.querySelector("[data-ui-provider-edit]")
    if (!(edit instanceof HTMLButtonElement)) {
      throw new Error("Media routing proof primary provider edit action is unavailable")
    }
    edit.click()
    const form = await providerForm("primary_provider_form")
    const imageInput = form.elements.namedItem("conversationInputImage")
    if (!(imageInput instanceof HTMLInputElement)) {
      throw new Error("Media routing proof image capability control is unavailable")
    }
    imageInput.checked = false
    const active = form.elements.namedItem("makeConversationActive")
    if (active instanceof HTMLInputElement) active.checked = true
    submit(form)
    await context.waitFor(() =>
      document.querySelectorAll("[data-ui-provider]").length === 2 &&
      document.querySelector("[data-ui-provider-status]")?.textContent?.trim() === "Provider saved"
        ? true
        : undefined
    , 10_000, "primary_provider_saved")
  }

  async function restoreSession(sessionId: string): Promise<void> {
    const button = [...document.querySelectorAll('[data-ui-session-select]')]
      .find((candidate) => candidate.getAttribute("data-ui-session-select") === sessionId)
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error("Media routing proof previous session action is unavailable")
    }
    button.click()
    await context.waitFor(() =>
      document.querySelector('[data-ui-session-select][aria-current="true"]')
        ?.getAttribute("data-ui-session-select") === sessionId ? true : undefined
    , 10_000, "media_restore_session")
  }

  async function readerEndpoint(): Promise<string> {
    const row = await context.waitFor(() =>
      [...document.querySelectorAll("[data-ui-provider]")].find((candidate) =>
        candidate.getAttribute("data-ui-conversation-model-id") === expected.visionModelId
      ) as HTMLElement | undefined
    , 10_000, "reader_provider_saved")
    const endpointId = row.getAttribute("data-ui-conversation-endpoint-id") ?? ""
    if (endpointId.length === 0) throw new Error("Reader endpoint id is missing")
    return endpointId
  }

  async function restoreProviderRouting(): Promise<void> {
    await context.openProviderSettings()
    const row = await context.waitFor(() =>
      [...document.querySelectorAll("[data-ui-provider]")].find((candidate) =>
        candidate.getAttribute("data-ui-conversation-model-id") === expected.modelId
      ) as HTMLElement | undefined
    , 10_000, "restore_primary_provider")
    const edit = row.querySelector("[data-ui-provider-edit]")
    if (!(edit instanceof HTMLButtonElement)) {
      throw new Error("Media routing proof primary provider restore action is unavailable")
    }
    edit.click()
    const form = await providerForm("restore_primary_provider_form")
    const imageGenerationInput = form.elements.namedItem("imageGenerationAcceptsImages")
    if (!(imageGenerationInput instanceof HTMLInputElement)) {
      throw new Error("Media routing proof image generation reference control is unavailable")
    }
    imageGenerationInput.checked = true
    const imageInput = form.elements.namedItem("conversationInputImage")
    if (!(imageInput instanceof HTMLInputElement)) {
      throw new Error("Media routing proof primary image capability restore is unavailable")
    }
    imageInput.checked = true
    submit(form)
    await context.waitFor(() =>
      document.querySelector("[data-ui-provider-status]")?.textContent?.trim() === "Provider saved"
        ? true
        : undefined
    , 10_000, "restore_primary_provider_saved")
    const setting = await context.waitFor(() =>
      document.querySelector("[data-ui-image-understanding-settings]") ?? undefined
    , 10_000, "restore_image_understanding_setting")
    const trigger = setting.querySelector('[data-ui-select="imageUnderstandingEndpointId"]')
    if (!(trigger instanceof HTMLButtonElement)) {
      throw new Error("Media routing proof image understanding restore selector is unavailable")
    }
    trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }))
    const option = await context.waitFor(() =>
      [...document.querySelectorAll('[role="option"][data-ui-select-option]')]
        .find((candidate) => candidate.getAttribute("data-ui-select-option") === "off") as HTMLElement | undefined
    , 5_000, "restore_image_understanding_option")
    option.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    await context.waitFor(() => trigger.getAttribute("aria-expanded") === "false" ? true : undefined, 5_000, "restore_image_understanding_selected")
    const close = document.querySelector('[data-ui-action="close-settings"]')
    if (!(close instanceof HTMLButtonElement)) throw new Error("Media routing proof restore close action is unavailable")
    close.click()
  }

  async function chooseImageUnderstandingEndpoint(endpointId: string): Promise<void> {
    const setting = await context.waitFor(() =>
      document.querySelector("[data-ui-image-understanding-settings]") ?? undefined
    , 10_000, "image_understanding_setting")
    const trigger = setting.querySelector('[data-ui-select="imageUnderstandingEndpointId"]')
    if (!(trigger instanceof HTMLButtonElement)) {
      throw new Error("Image understanding selector is unavailable")
    }
    trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }))
    const option = await context.waitFor(() =>
      [...document.querySelectorAll('[role="option"][data-ui-select-option]')]
        .find((candidate) => candidate.getAttribute("data-ui-select-option") === endpointId) as HTMLElement | undefined
    , 5_000, "image_understanding_option")
    option.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    await context.waitFor(() =>
      trigger.getAttribute("aria-expanded") === "false" &&
      (endpointId === "off"
        ? trigger.textContent?.includes("Off")
        : trigger.textContent?.includes(expected.visionModelId))
        ? true
        : undefined
    , 10_000, "image_understanding_selected")
  }

  async function uploadImage(): Promise<Element> {
    const input = await context.waitFor(() => {
      const candidate = document.querySelector("[data-ui-attachment-input]")
      return candidate instanceof HTMLInputElement && !candidate.disabled
        ? candidate
        : undefined
    }, 10_000, "media_attachment_input")
    const transfer = new DataTransfer()
    const bytes = decodeBase64(expected.pngBase64)
    const content = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(content).set(bytes)
    transfer.items.add(new File([content], expected.multimodalImageLabel, { type: "image/png" }))
    input.files = transfer.files
    input.dispatchEvent(new Event("change", { bubbles: true }))
    return context.waitFor(() => {
      const row = document.querySelector("[data-ui-attachment]")
      return row instanceof Element ? row : undefined
    }, 10_000, "media_attachment_preview")
  }

  async function submitImageReferenceConversation(expectedSessionId: string): Promise<{
    readonly sessionId: string
    readonly responseVisible: true
    readonly submittedAt: number
  }> {
    const surface = await context.waitFor(() =>
      document.querySelector('[data-ui-assistant-shell]') ?? undefined
    , 10_000, "image_reference_surface")
    const initialUserIds = new Set([...surface.querySelectorAll(
      '[data-ui-conversation-row][data-ui-role="user"]'
    )].map((row) => row.getAttribute("data-ui-conversation-row") ?? ""))
    const initialAssistantIds = new Set([...surface.querySelectorAll(
      '[data-ui-conversation-row][data-ui-role="assistant"]'
    )].map((row) => row.getAttribute("data-ui-conversation-row") ?? ""))
    const textarea = surface.querySelector('[data-ui-composer] textarea[name="text"]')
    const form = surface.querySelector('[data-ui-composer]')
    if (!(textarea instanceof HTMLTextAreaElement) || !(form instanceof HTMLFormElement)) {
      throw new Error("Image edit proof composer is unavailable")
    }
    context.setControlValue(textarea, expected.imageEditText)
    const submit = await context.waitFor(() => {
      const button = form.querySelector('button[type="submit"]')
      return button instanceof HTMLButtonElement && !button.disabled ? button : undefined
    }, 10_000, "image_reference_draft")
    const submittedAt = performance.now()
    const event = new Event("submit", { bubbles: true, cancelable: true })
    form.dispatchEvent(event)
    if (!event.defaultPrevented) throw new Error("Image edit proof conversation was not submitted")
    return context.waitFor(() => {
      const currentSurface = document.querySelector('[data-ui-assistant-shell]')
      const sessionId = currentSurface?.querySelector(
        '[data-ui-session-select][aria-current="true"]'
      )?.getAttribute("data-ui-session-select") ?? ""
      const userVisible = [...(currentSurface?.querySelectorAll(
        '[data-ui-conversation-row][data-ui-role="user"]'
      ) ?? [])].some((row) =>
        !initialUserIds.has(row.getAttribute("data-ui-conversation-row") ?? "") &&
        row.textContent?.includes(expected.imageEditText)
      )
      const responseVisible = [...(currentSurface?.querySelectorAll(
        '[data-ui-conversation-row][data-ui-role="assistant"]'
      ) ?? [])].some((row) =>
        !initialAssistantIds.has(row.getAttribute("data-ui-conversation-row") ?? "") &&
        row.textContent?.includes(expected.imageEditResponse)
      )
      return sessionId === expectedSessionId && userVisible && responseVisible
        ? { sessionId, responseVisible: true as const, submittedAt }
        : undefined
    }, 20_000, "image_reference_settlement")
  }

  async function providerForm(stage: string): Promise<HTMLFormElement> {
    return context.waitFor(() => {
      const form = document.querySelector("[data-ui-provider-form]")
      return form instanceof HTMLFormElement ? form : undefined
    }, 10_000, stage)
  }

  function submit(form: HTMLFormElement): void {
    const event = new Event("submit", { bubbles: true, cancelable: true })
    form.dispatchEvent(event)
    if (!event.defaultPrevented) throw new Error("Media routing provider form was not submitted")
  }

  function decodeBase64(value: string): Uint8Array {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0))
  }

  function isAssistantResourceDeliveryUrl(value: string): boolean {
    try {
      const url = new URL(value)
      const tokens = url.searchParams.getAll("token")
      return url.pathname === "/wanex/assistant/resource-delivery" &&
        [...url.searchParams.keys()].every((key) => key === "token") &&
        tokens.length === 1 &&
        /^wrd_[A-Za-z0-9_-]{43}$/.test(tokens[0] ?? "")
    } catch {
      return false
    }
  }
}
