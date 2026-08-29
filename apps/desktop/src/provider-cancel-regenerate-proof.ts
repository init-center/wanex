import type { WanexDesktopProviderRelaunchProofResult } from "./proof-contract.js"
import type {
  WanexDesktopProviderJourneyProofContext
} from "./provider-multimodal-proof.js"

export interface WanexDesktopProviderCancelRegenerateProofExpected {
  readonly modelId: string
  readonly cancelRegenerateText: string
  readonly cancelPartialResponse: string
  readonly regeneratedResponse: string
}

export async function runWanexDesktopProviderCancelRegenerateProof(
  expected: WanexDesktopProviderCancelRegenerateProofExpected,
  context: WanexDesktopProviderJourneyProofContext
): Promise<WanexDesktopProviderRelaunchProofResult> {
  const ready = await context.waitFor(() => {
    const surface = document.querySelector(
      '[data-ui-assistant-shell]'
    )
    const textarea = surface?.querySelector(
      '[data-ui-composer] textarea[name="text"]'
    )
    const button = surface?.querySelector(
      '[data-ui-composer] button[type="submit"]'
    )
    const sessionId = selectedSessionId()
    if (
      context.configuredProviderCount() !== 1 ||
      !context.providerReady() ||
      !(surface instanceof Element) ||
      !(textarea instanceof HTMLTextAreaElement) ||
      !(button instanceof HTMLButtonElement) ||
      textarea.disabled ||
      sessionId === undefined
    ) {
      return undefined
    }
    return {
      sessionId,
      textarea
    }
  }, 10_000, "cancel_regenerate_ready")

  context.setControlValue(ready.textarea, expected.cancelRegenerateText)
  await context.waitFor(() => {
    const button = document.querySelector(
      '[data-ui-composer] button[type="submit"]'
    )
    return button instanceof HTMLButtonElement && !button.disabled
      ? true
      : undefined
  }, 10_000, "cancel_regenerate_draft")
  const submittedAt = performance.now()
  const enter = new KeyboardEvent("keydown", {
    key: "Enter",
    bubbles: true,
    cancelable: true
  })
  ready.textarea.dispatchEvent(enter)
  if (!enter.defaultPrevented) {
    throw new Error("Provider cancellation conversation was not submitted")
  }

  const running = await context.waitFor(() => {
    const conversation = document.querySelector(
      '[data-ui-conversation-timeline][data-ui-conversation-state="running"]'
    )
    const operationId = conversation?.getAttribute(
      "data-ui-operation-id"
    ) ?? ""
    const cancel = conversation?.querySelector(
      '[data-ui-action="cancel-conversation"]'
    ) ?? document.querySelector('[data-ui-action="cancel-conversation"]')
    const transient = conversation?.querySelector(
      "[data-ui-transient-assistant]"
    )
    return conversation instanceof HTMLElement &&
      operationId.length > 0 &&
      cancel instanceof HTMLButtonElement &&
      !cancel.disabled &&
      transient?.textContent?.includes(expected.cancelPartialResponse) === true &&
      selectedSessionId() === ready.sessionId
      ? { cancel, operationId }
      : undefined
  }, 10_000, "cancel_available", conversationDiagnostic)

  running.cancel.click()
  const cancelled = await context.waitFor(() => {
    const conversation = document.querySelector(
      '[data-ui-conversation-timeline][data-ui-conversation-state="cancelled"]'
    )
    const operationId = conversation?.getAttribute(
      "data-ui-operation-id"
    ) ?? ""
    const regenerate = conversation?.querySelector(
      '[data-ui-action="regenerate-conversation"]'
    ) ?? document.querySelector('[data-ui-action="regenerate-conversation"]')
    const currentUsers = userRows()
    const currentAssistants = assistantRows()
    const userVisible = currentUsers.some((row) =>
      row.textContent?.includes(expected.cancelRegenerateText)
    )
    const assistantAbsent =
      !currentAssistants.some((row) =>
        row.textContent?.includes(expected.cancelPartialResponse) ||
        row.textContent?.includes(expected.regeneratedResponse)
      ) &&
      !document.documentElement.textContent?.includes(
        expected.cancelPartialResponse
      )
    return conversation instanceof HTMLElement &&
      operationId === running.operationId &&
      regenerate instanceof HTMLButtonElement &&
      !regenerate.disabled &&
      userVisible &&
      assistantAbsent &&
      selectedSessionId() === ready.sessionId
      ? { assistantAbsent, regenerate, userVisible }
      : undefined
  }, 10_000, "cancelled", conversationDiagnostic)

  cancelled.regenerate.click()
  const regenerated = await context.waitFor(() => {
    const conversation = document.querySelector(
      '[data-ui-conversation-timeline][data-ui-conversation-state="succeeded"]'
    )
    const operationId = conversation?.getAttribute(
      "data-ui-operation-id"
    ) ?? ""
    const currentUsers = userRows()
    const currentAssistants = assistantRows()
    const userVisible = currentUsers.some((row) =>
      row.textContent?.includes(expected.cancelRegenerateText)
    )
    const responseVisible =
      currentAssistants.some((row) => row.textContent?.includes(
        expected.regeneratedResponse
      )) &&
      !currentAssistants.some((row) =>
        row.textContent?.includes(expected.cancelPartialResponse)
      )
    return conversation instanceof HTMLElement &&
      operationId.length > 0 &&
      operationId !== running.operationId &&
      userVisible &&
      responseVisible &&
      selectedSessionId() === ready.sessionId
      ? { operationId, responseVisible, userVisible }
      : undefined
  }, 10_000, "regenerated", conversationDiagnostic)

  const settledAt = performance.now()
  const redacted = context.redacted()
  return context.result({
    ok:
      redacted &&
      cancelled.assistantAbsent &&
      regenerated.operationId !== running.operationId &&
      regenerated.responseVisible &&
      selectedSessionId() === ready.sessionId,
    initialConfiguredProviderCount: 1,
    configuredProviderCount: 1,
    providerConfigured: true,
    providerReady: true,
    providerEvidenceRedacted: redacted,
    modelId: expected.modelId,
    sessionId: ready.sessionId,
    conversationSubmitted: true,
    userVisible: regenerated.userVisible,
    assistantVisible: regenerated.responseVisible,
    responseVisible: regenerated.responseVisible,
    cancellationSubmitted: true,
    cancellationSucceeded: true,
    cancellationSessionPreserved: selectedSessionId() === ready.sessionId,
    cancelledUserVisible: cancelled.userVisible,
    cancelledAssistantAbsent: cancelled.assistantAbsent,
    regenerationSubmitted: true,
    regenerationFreshOperation:
      regenerated.operationId !== running.operationId,
    regenerationSucceeded: true,
    regenerationSessionPreserved: selectedSessionId() === ready.sessionId,
    regenerationResponseVisible: regenerated.responseVisible,
    rendererInteractive: submittedAt - context.startedAt,
    conversationSettlement: settledAt - submittedAt,
    rendererPostSettlement: performance.now() - settledAt
  })

  function selectedSessionId(): string | undefined {
    const value = document.querySelector(
      '[data-ui-session-select][aria-current="true"]'
    )?.getAttribute("data-ui-session-select") ?? ""
    return value.length === 0 ? undefined : value
  }

  function userRows(): HTMLElement[] {
    return [...document.querySelectorAll(
      '[data-ui-conversation-row][data-ui-role="user"]'
    )].filter((row): row is HTMLElement => row instanceof HTMLElement)
  }

  function assistantRows(): HTMLElement[] {
    return [...document.querySelectorAll(
      '[data-ui-conversation-row][data-ui-role="assistant"]'
    )].filter((row): row is HTMLElement => row instanceof HTMLElement)
  }

  function conversationDiagnostic(): string {
    const conversation = document.querySelector('[data-ui-conversation-timeline]')
    const state = conversation?.getAttribute("data-ui-conversation-state") ??
      "missing"
    const operationId = conversation?.getAttribute(
      "data-ui-operation-id"
    ) ?? "missing"
    return `conversation_${state}:operation_${operationId}`
  }
}
