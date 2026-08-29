import type { WanexDesktopProviderRelaunchProofResult } from "./proof-contract.js"

export interface WanexDesktopProviderMultimodalProofExpected {
  readonly multimodalText: string
  readonly multimodalImageLabel: string
  readonly modelId: string
  readonly response: string
  readonly unsupportedDraft: string
  readonly pngBase64: string
}

export interface WanexDesktopProviderJourneyProofContext {
  readonly startedAt: number
  readonly configuredProviderCount: () => number
  readonly providerReady: () => boolean
  readonly redacted: () => boolean
  readonly setControlValue: (
    control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
    value: string,
  ) => void
  readonly result: (
    value: Partial<WanexDesktopProviderRelaunchProofResult> & {
      readonly rendererInteractive?: number
      readonly conversationSettlement?: number
      readonly rendererPostSettlement?: number
    }
  ) => WanexDesktopProviderRelaunchProofResult
  readonly submitConversation: (options: {
    readonly source: string
    readonly expectedResponse: string
    readonly expectedSessionId?: string
  }) => Promise<{
    readonly sessionId: string
    readonly userVisible: true
    readonly assistantVisible: true
    readonly responseVisible: true
    readonly submittedAt: number
  }>
  readonly waitFor: <T>(
    read: () => T | false | undefined,
    timeoutMs?: number,
    stage?: string,
    diagnostic?: () => string
  ) => Promise<T>
}

export async function runWanexDesktopProviderMultimodalProof(
  expected: WanexDesktopProviderMultimodalProofExpected,
  context: WanexDesktopProviderJourneyProofContext
): Promise<WanexDesktopProviderRelaunchProofResult> {
  const state = await context.waitFor(() => {
    const surface = document.querySelector('[data-ui-assistant-shell]')
    const input = surface?.querySelector("[data-ui-attachment-input]")
    const textarea = surface?.querySelector(
      '[data-ui-composer] textarea[name="text"]'
    )
    if (
      context.configuredProviderCount() !== 1 ||
      !context.providerReady() ||
      !(surface instanceof Element) ||
      !(input instanceof HTMLInputElement) ||
      input.disabled ||
      !(textarea instanceof HTMLTextAreaElement) ||
      textarea.disabled ||
      input.accept !== "image/*"
    ) {
      return undefined
    }
    return { input, textarea }
  }, 10_000, "multimodal_ready")

  context.setControlValue(state.textarea, expected.unsupportedDraft)
  selectAttachment(
    state.input,
    Uint8Array.from([37, 80, 68, 70]),
    "application/pdf",
    "unsupported-proof.pdf"
  )
  const unsupportedAttachmentRejected = await context.waitFor(() => {
    const currentSurface = document.querySelector(
      '[data-ui-assistant-shell]'
    )
    const message = currentSurface?.querySelector('[role="alert"]')
      ?.textContent ?? ""
    return message.includes("does not support document attachment input")
      ? true
      : undefined
  }, 10_000, "unsupported_rejection")
  const unsupportedDraftPreserved = (
    document.querySelector(
      '[data-ui-composer] textarea[name="text"]'
    ) as HTMLTextAreaElement | null
  )?.value === expected.unsupportedDraft

  const firstAttachment = await uploadImage("paste")
  const attachmentPasted = true
  const firstResourceId = firstAttachment.getAttribute("data-ui-resource-id") ?? ""
  const firstPreview = firstAttachment.querySelector(
    '[data-ui-resource-preview] img'
  )
  const attachmentPreviewVisible =
    firstResourceId.length > 0 &&
    firstPreview instanceof HTMLImageElement &&
    isAssistantResourceDeliveryUrl(firstPreview.src)
  const remove = await context.waitFor(() => {
    const candidate = document.querySelector(
      '[data-ui-attachment] [data-ui-action="remove-conversation-attachment"]'
    )
    return candidate instanceof HTMLButtonElement && !candidate.disabled
      ? candidate
      : undefined
  }, 10_000, "attachment_remove_ready")
  remove.click()
  const attachmentRemoved = await context.waitFor(() =>
    document.querySelectorAll("[data-ui-attachment]").length === 0
      ? true
      : undefined
  , 10_000, "attachment_removal")

  const secondAttachment = await uploadImage("drop")
  const attachmentDropped = true
  const secondResourceId = secondAttachment.getAttribute("data-ui-resource-id") ?? ""
  const attachmentReadded = secondResourceId.length > 0
  const existingSessionId = selectedSessionId()
  const submitted = await context.submitConversation({
    source: expected.multimodalText,
    expectedResponse: expected.response,
    ...(existingSessionId === undefined
      ? {}
      : { expectedSessionId: existingSessionId })
  })
  const canonical = await context.waitFor(() => {
    const rows = [...document.querySelectorAll(
      '[data-ui-conversation-row][data-ui-role="user"]'
    )]
    const resource = rows
      .map((row) => row.querySelector(
        `[data-ui-resource="${secondResourceId}"]`
      ))
      .find((candidate): candidate is Element => candidate instanceof Element)
    const preview = resource?.querySelector(
      '[data-ui-resource-preview][data-ui-preview-state="ready"] img'
    )
    return resource instanceof HTMLElement && preview instanceof HTMLImageElement
      ? { resource, preview }
      : undefined
  }, 10_000, "canonical_resource_preview")
  const settledAt = performance.now()
  return context.result({
    ok:
      unsupportedAttachmentRejected &&
      unsupportedDraftPreserved &&
      attachmentPreviewVisible &&
      attachmentRemoved &&
      attachmentReadded &&
      attachmentPasted &&
      attachmentDropped &&
      submitted.responseVisible &&
      canonical.resource.getAttribute("data-ui-resource-media-type") ===
        "image/png" &&
      isAssistantResourceDeliveryUrl(canonical.preview.src) &&
      context.redacted(),
    initialConfiguredProviderCount: 1,
    configuredProviderCount: 1,
    providerConfigured: true,
    providerReady: true,
    providerEvidenceRedacted: context.redacted(),
    modelId: expected.modelId,
    sessionId: submitted.sessionId,
    conversationSubmitted: true,
    userVisible: submitted.userVisible,
    assistantVisible: submitted.assistantVisible,
    responseVisible: submitted.responseVisible,
    attachmentPickerVisible: true,
    unsupportedAttachmentRejected,
    unsupportedDraftPreserved,
    attachmentPreviewVisible,
    attachmentRemoved,
    attachmentReadded,
    attachmentPasted,
    attachmentDropped,
    multimodalConversationSubmitted: true,
    multimodalResourceVisible: true,
    multimodalCanonicalPreviewVisible: true,
    rendererInteractive: submitted.submittedAt - context.startedAt,
    conversationSettlement: settledAt - submitted.submittedAt,
    rendererPostSettlement: performance.now() - settledAt
  })

  async function uploadImage(mode: "paste" | "drop"): Promise<Element> {
    const target = await context.waitFor(() => {
      const candidate = document.querySelector(
        "[data-ui-attachment-input]"
      )
      const textarea = document.querySelector(
        '[data-ui-composer] textarea[name="text"]'
      )
      return (
        candidate instanceof HTMLInputElement &&
        !candidate.disabled &&
        textarea instanceof HTMLTextAreaElement &&
        !textarea.disabled
      )
        ? textarea
        : undefined
    }, 10_000, "attachment_picker")
    const transfer = attachmentTransfer(
      decodeBase64(expected.pngBase64),
      "image/png",
      expected.multimodalImageLabel
    )
    if (mode === "paste") {
      const paste = transferEvent("paste", "clipboardData", transfer)
      target.dispatchEvent(paste)
      if (!paste.defaultPrevented) {
        throw new Error("Provider relaunch attachment paste was not handled")
      }
    } else {
      const dragover = transferEvent("dragover", "dataTransfer", transfer)
      target.dispatchEvent(dragover)
      const drop = transferEvent("drop", "dataTransfer", transfer)
      target.dispatchEvent(drop)
      if (!dragover.defaultPrevented || !drop.defaultPrevented) {
        throw new Error("Provider relaunch attachment drop was not handled")
      }
    }
    return await context.waitFor(() => {
      const row = document.querySelector("[data-ui-attachment]")
      const preview = row?.querySelector(
        '[data-ui-resource-preview] img'
      )
      const input = document.querySelector("[data-ui-attachment-input]")
      const textarea = document.querySelector(
        '[data-ui-composer] textarea[name="text"]'
      )
      return row instanceof Element &&
        preview instanceof HTMLImageElement &&
        input instanceof HTMLInputElement &&
        !input.disabled &&
        textarea instanceof HTMLTextAreaElement &&
        !textarea.disabled
        ? row
        : undefined
    }, 10_000, "attachment_preview")
  }

  function selectedSessionId(): string | undefined {
    const value = document.querySelector(
      '[data-ui-session-select][aria-current="true"]'
    )?.getAttribute("data-ui-session-select") ?? ""
    return value.length === 0 ? undefined : value
  }

  function selectAttachment(
    input: HTMLInputElement,
    bytes: Uint8Array,
    mediaType: string,
    name: string
  ): void {
    const transfer = attachmentTransfer(bytes, mediaType, name)
    input.files = transfer.files
    input.dispatchEvent(new Event("change", { bubbles: true }))
  }

  function attachmentTransfer(
    bytes: Uint8Array,
    mediaType: string,
    name: string
  ): DataTransfer {
    const transfer = new DataTransfer()
    const content = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(content).set(bytes)
    transfer.items.add(new File([content], name, { type: mediaType }))
    return transfer
  }

  function transferEvent(
    type: "paste" | "dragover" | "drop",
    property: "clipboardData" | "dataTransfer",
    transfer: DataTransfer
  ): Event {
    const event = new Event(type, { bubbles: true, cancelable: true })
    Object.defineProperty(event, property, { value: transfer })
    return event
  }

  function decodeBase64(value: string): Uint8Array {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0))
  }

  function isAssistantResourceDeliveryUrl(value: string): boolean {
    try {
      const url = new URL(value)
      const tokens = url.searchParams.getAll("token")
      return (
        url.pathname === "/wanex/assistant/resource-delivery" &&
        [...url.searchParams.keys()].every((key) => key === "token") &&
        tokens.length === 1 &&
        /^wrd_[A-Za-z0-9_-]{43}$/.test(tokens[0] ?? "")
      )
    } catch {
      return false
    }
  }
}
