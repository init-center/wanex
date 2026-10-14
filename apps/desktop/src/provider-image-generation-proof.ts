import type { WanexDesktopProviderRelaunchProofResult } from "./proof-contract.js"
import type {
  WanexDesktopProviderJourneyProofContext
} from "./provider-multimodal-proof.js"

export interface WanexDesktopProviderImageGenerationProofExpected {
  readonly imageGenerationModelId: string
  readonly imageGenerationText: string
  readonly imageGenerationResponse: string
  readonly modelId: string
  readonly pngBase64: string
  readonly multimodalImageLabel: string
}

export async function runWanexDesktopProviderImageGenerationProof(
  expected: WanexDesktopProviderImageGenerationProofExpected,
  context: WanexDesktopProviderJourneyProofContext
): Promise<WanexDesktopProviderRelaunchProofResult> {
  const ready = await context.waitFor(() => {
    const surface = document.querySelector('[data-ui-assistant-shell]')
    const textarea = surface?.querySelector(
      '[data-ui-composer] textarea[name="text"]'
    )
    const button = surface?.querySelector(
      '[data-ui-composer] button[type="submit"]'
    )
    const sessionId = selectedSessionId()
    if (
      context.configuredProviderCount() !== 2 ||
      !context.providerReady() ||
      !(surface instanceof Element) ||
      !(textarea instanceof HTMLTextAreaElement) ||
      !(button instanceof HTMLButtonElement) ||
      textarea.disabled ||
      sessionId === undefined
    ) {
      return undefined
    }
    return { textarea, sessionId }
  }, 10_000, "image_generation_ready")

  const newConversation = document.querySelector(
    '[data-ui-session-drawer] button[data-ui-initial-focus]'
  )
  if (!(newConversation instanceof HTMLButtonElement)) {
    throw new Error("Provider image generation new conversation action is unavailable")
  }
  newConversation.click()
  await context.waitFor(() =>
    document.querySelectorAll('[data-ui-conversation-row]').length === 0
      ? true
      : undefined
  , 10_000, "image_generation_new_conversation")
  const freshSessionId = selectedSessionId()

  const inputResourceId = await uploadImage()

  const initialUserRowIds = new Set(
    [...document.querySelectorAll(
      '[data-ui-conversation-row][data-ui-role="user"]'
    )].map(conversationRowId)
  )
  const initialImageResourceIds = new Set(
    imageResources().map((resource) =>
      resource.getAttribute("data-ui-resource") ?? ""
    )
  )
  initialImageResourceIds.add(inputResourceId)
  const freshTextarea = document.querySelector(
    '[data-ui-assistant-shell] [data-ui-composer] textarea[name="text"]'
  )
  if (!(freshTextarea instanceof HTMLTextAreaElement)) {
    throw new Error("Provider image generation fresh composer is unavailable")
  }
  context.setControlValue(freshTextarea, expected.imageGenerationText)
  await context.waitFor(() => {
    const button = document.querySelector(
      '[data-ui-composer] button[type="submit"]'
    )
    return button instanceof HTMLButtonElement && !button.disabled
      ? true
      : undefined
  }, 10_000, "image_generation_draft")
  const submittedAt = performance.now()
  const enter = new KeyboardEvent("keydown", {
    key: "Enter",
    bubbles: true,
    cancelable: true
  })
  freshTextarea.dispatchEvent(enter)
  if (!enter.defaultPrevented) {
    throw new Error("Provider image generation conversation was not submitted")
  }

  const settled = await context.waitFor(() => {
    const currentSessionId = selectedSessionId()
    const userRows = [...document.querySelectorAll(
      '[data-ui-conversation-row][data-ui-role="user"]'
    )]
    const assistantRows = [...document.querySelectorAll(
      '[data-ui-conversation-row][data-ui-role="assistant"]'
    )]
    const addedUserRows = userRows.filter(
      (row) => !initialUserRowIds.has(conversationRowId(row))
    )
    const tools = [...document.querySelectorAll(
      '[data-ui-tool="image_generate"][data-ui-tool-state="succeeded"]'
    )]
    const resources = generatedImageResources()
    const resource = resources.length === 1 ? resources[0] : undefined
    const sha256 = resource?.getAttribute("data-ui-resource-sha256") ?? ""
    const sizeBytes = Number(resource?.getAttribute("data-ui-resource-size"))
    const preview = resource?.querySelector(
      '[data-ui-resource-preview][data-ui-preview-state="ready"] img'
    )
    const userVisible =
      addedUserRows.length === 1 &&
      addedUserRows[0]?.textContent?.includes(expected.imageGenerationText) === true
    const responseVisible = assistantRows.some((row) =>
      row.textContent?.includes(expected.imageGenerationResponse)
    )
    const resourceEvidenceValid =
      /^[a-f0-9]{64}$/.test(sha256) &&
      Number.isSafeInteger(sizeBytes) &&
      sizeBytes > 0
    return (
      currentSessionId !== undefined &&
      (freshSessionId === undefined || currentSessionId === freshSessionId) &&
      userVisible &&
      responseVisible &&
      tools.length === 1 &&
      resource !== undefined &&
      resourceEvidenceValid &&
      preview instanceof HTMLImageElement &&
      isAssistantResourceDeliveryUrl(preview.src)
    )
      ? {
          userVisible: true as const,
          responseVisible: true as const,
          resourceEvidenceValid: true as const
        }
      : undefined
  }, 20_000, "image_generation_settlement", settlementDiagnostic)
  const completedSessionId = selectedSessionId() ?? freshSessionId ?? ""
  await restoreSession(ready.sessionId)
  const settledAt = performance.now()
  return context.result({
    ok: settled.userVisible && settled.responseVisible && context.redacted(),
    initialConfiguredProviderCount: 2,
    configuredProviderCount: 2,
    providerConfigured: true,
    providerReady: true,
    providerEvidenceRedacted: context.redacted(),
    modelId: expected.modelId,
    sessionId: completedSessionId,
    conversationSubmitted: true,
    userVisible: true,
    assistantVisible: true,
    responseVisible: true,
    imageGenerationEndpointReady: true,
    imageGenerationConversationSubmitted: true,
    imageGenerationSessionPreserved: true,
    imageGenerationToolSucceeded: true,
    generatedResourceEvidenceValid: settled.resourceEvidenceValid,
    generatedResourcePreviewVisible: true,
    journeyPreparation: submittedAt - context.startedAt,
    conversationSettlement: settledAt - submittedAt,
    rendererPostSettlement: performance.now() - settledAt
  })

  function selectedSessionId(): string | undefined {
    const value = document.querySelector(
      '[data-ui-session-select][aria-current="true"]'
    )?.getAttribute("data-ui-session-select") ?? ""
    return value.length === 0 ? undefined : value
  }

  function settlementDiagnostic(): string {
    if (selectedSessionId() === undefined) return "no_selected_session"
    const userRows = [...document.querySelectorAll(
      '[data-ui-conversation-row][data-ui-role="user"]'
    )]
    if (!userRows.some((row) =>
      row.textContent?.includes(expected.imageGenerationText)
    )) return "generation_user_row_missing"
    const tools = [...document.querySelectorAll(
      '[data-ui-tool="image_generate"]'
    )]
    if (tools.length === 0) return "image_tool_missing"
    if (tools.length !== 1) return "duplicate_image_tools"
    const toolState = tools[0]?.getAttribute("data-ui-tool-state")
    if (toolState !== "succeeded") return `image_tool_${toolState ?? "unknown"}`
    const resources = generatedImageResources()
    if (resources.length === 0) return "generated_resource_missing"
    if (resources.length !== 1) return "duplicate_generated_resources"
    const previewState = resources[0]?.querySelector(
      "[data-ui-resource-preview]"
    )?.getAttribute("data-ui-preview-state")
    if (previewState !== "ready") {
      return `generated_preview_${previewState ?? "missing"}`
    }
    const assistantRows = [...document.querySelectorAll(
      '[data-ui-conversation-row][data-ui-role="assistant"]'
    )]
    if (!assistantRows.some((row) =>
      row.textContent?.includes(expected.imageGenerationResponse)
    )) return "generation_final_response_missing"
    return "generation_condition_unknown"
  }

  function generatedImageResources(): Element[] {
    const seen = new Set<string>()
    return imageResources().filter((resource) => {
      const resourceId = resource.getAttribute("data-ui-resource") ?? ""
      if (initialImageResourceIds.has(resourceId) || seen.has(resourceId)) {
        return false
      }
      seen.add(resourceId)
      return true
    })
  }

  async function uploadImage(): Promise<string> {
    const input = await context.waitFor(() => {
      const candidate = document.querySelector("[data-ui-attachment-input]")
      return candidate instanceof HTMLInputElement && !candidate.disabled
        ? candidate
        : undefined
    }, 10_000, "image_generation_attachment_input")
    const transfer = new DataTransfer()
    const bytes = decodeBase64(expected.pngBase64)
    const content = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(content).set(bytes)
    transfer.items.add(new File(
      [content],
      expected.multimodalImageLabel,
      { type: "image/png" },
    ))
    input.files = transfer.files
    input.dispatchEvent(new Event("change", { bubbles: true }))
    return context.waitFor(() => {
      const id = document.querySelector("[data-ui-attachment]")
        ?.getAttribute("data-ui-resource-id") ?? ""
      return id.length > 0 ? id : undefined
    }, 10_000, "image_generation_attachment_preview")
  }

  function decodeBase64(value: string): Uint8Array {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0))
  }

  async function restoreSession(sessionId: string): Promise<void> {
    const button = [...document.querySelectorAll('[data-ui-session-select]')]
      .find((candidate) => candidate.getAttribute("data-ui-session-select") === sessionId)
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error("Provider image generation previous session is unavailable")
    }
    button.click()
    await context.waitFor(() => selectedSessionId() === sessionId ? true : undefined,
      10_000, "image_generation_restore_session")
  }

  function imageResources(): Element[] {
    return [...document.querySelectorAll(
      '[data-ui-resource][data-ui-resource-kind="image"]'
    )].filter((resource) =>
      resource.getAttribute("data-ui-resource-media-type") === "image/png"
    )
  }

  function conversationRowId(row: Element): string {
    return row.getAttribute("data-ui-conversation-row") ?? ""
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
