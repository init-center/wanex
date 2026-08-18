import type {
  WanexDesktopProviderRelaunchProofResult
} from "./proof-contract.js"
import type {
  createWanexDesktopProviderRelaunchProofResult
} from "./provider-relaunch-proof-result.js"

export interface WanexDesktopProviderGuidedFollowUpProofExpected {
  readonly modelId: string
  readonly parentText: string
  readonly followUpText: string
  readonly parentPartialResponse: string
  readonly parentResponse: string
  readonly childResponse: string
}

export interface WanexDesktopProviderGuidedFollowUpAdmission {
  readonly ok: boolean
  readonly sessionId: string
  readonly parentOperationId: string
  readonly childOperationId: string
  readonly initialUserRowIds: readonly string[]
  readonly initialAssistantRowIds: readonly string[]
  readonly submittedAt: number
  readonly rendererInteractive: number
  readonly parentPartialVisible: boolean
  readonly composerModeVisible: boolean
  readonly followUpSubmitted: boolean
  readonly draftClearedAfterAcceptance: boolean
  readonly pendingVisible: boolean
  readonly parentOperationPreserved: boolean
}

export async function runWanexDesktopProviderGuidedFollowUpAdmissionProof(
  expected: WanexDesktopProviderGuidedFollowUpProofExpected
): Promise<WanexDesktopProviderGuidedFollowUpAdmission> {
  const startedAt = performance.now()
  const surface = await waitFor(() => {
    const candidate = document.querySelector(
      '[data-ui-product-shell]'
    )
    const composer = candidate?.querySelector(
      '[data-ui-composer][data-ui-composer-mode="submit"]'
    )
    const textarea = composer?.querySelector('textarea[name="text"]')
    const button = composer?.querySelector('button[type="submit"]')
    const sessionId = selectedSessionId()
    return candidate instanceof Element &&
      composer instanceof HTMLFormElement &&
      textarea instanceof HTMLTextAreaElement &&
      button instanceof HTMLButtonElement &&
      !textarea.disabled &&
      sessionId !== undefined
      ? candidate
      : undefined
  }, "guided_follow_up_ready")
  const sessionId = required(selectedSessionId(), "selected Session")
  const initialUserRowIds = conversationRowIds(surface, "user")
  const initialAssistantRowIds = conversationRowIds(surface, "assistant")
  const initialComposer = requiredComposer("submit")
  setControlValue(initialComposer.textarea, expected.parentText)
  await waitFor(() => {
    const button = initialComposer.composer.querySelector('button[type="submit"]')
    return button instanceof HTMLButtonElement && !button.disabled
      ? true
      : undefined
  }, "guided_parent_draft")
  const submittedAt = performance.now()
  submitWithEnter(initialComposer.textarea, "guided parent")

  const running = await waitFor(() => {
    const conversation = document.querySelector(
      '[data-ui-conversation-timeline][data-ui-conversation-state="running"]'
    )
    const parentOperationId = conversation?.getAttribute(
      "data-ui-operation-id"
    ) ?? ""
    const transient = conversation?.querySelector(
      "[data-ui-transient-assistant]"
    )
    const queueMode = document.querySelector(
      '[data-ui-mode-switch] [data-ui-composer-mode="queue"]'
    )
    const addedUsers = addedRows(initialUserRowIds, "user")
    const addedAssistants = addedRows(initialAssistantRowIds, "assistant")
    return conversation instanceof HTMLElement &&
      parentOperationId.length > 0 &&
      transient?.textContent?.includes(expected.parentPartialResponse) === true &&
      queueMode instanceof HTMLButtonElement &&
      !queueMode.disabled &&
      addedUsers.length === 1 &&
      addedUsers[0]?.textContent?.includes(expected.parentText) === true &&
      addedAssistants.length === 0 &&
      selectedSessionId() === sessionId
      ? { parentOperationId, queueMode }
      : undefined
  }, "guided_parent_running")

  running.queueMode.click()
  const queueComposer = await waitFor(() => {
    const composer = document.querySelector(
      '[data-ui-composer][data-ui-composer-mode="queue"]'
    )
    const textarea = composer?.querySelector('textarea[name="text"]')
    const button = composer?.querySelector('button[type="submit"]')
    return composer instanceof HTMLFormElement &&
      textarea instanceof HTMLTextAreaElement &&
      button instanceof HTMLButtonElement &&
      !textarea.disabled
      ? { button, textarea }
      : undefined
  }, "guided_queue_mode")
  setControlValue(queueComposer.textarea, expected.followUpText)
  await waitFor(
    () => !queueComposer.button.disabled ? true : undefined,
    "guided_queue_draft"
  )
  submitWithEnter(queueComposer.textarea, "guided follow-up")

  const pending = await waitFor(() => {
    const conversation = document.querySelector(
      '[data-ui-conversation-timeline][data-ui-conversation-state="running"]'
    )
    const operationId = conversation?.getAttribute(
      "data-ui-operation-id"
    ) ?? ""
    const transient = conversation?.querySelector(
      "[data-ui-transient-assistant]"
    )
    const pendingRow = conversation?.querySelector(
      '[data-ui-pending="queued-follow-up"][data-ui-pending-state="queued"]'
    )
    const childOperationId = pendingRow?.getAttribute(
      "data-ui-pending-operation-id"
    ) ?? ""
    const composer = document.querySelector(
      '[data-ui-composer][data-ui-composer-mode="queue"]'
    )
    const textarea = composer?.querySelector('textarea[name="text"]')
    const button = composer?.querySelector('button[type="submit"]')
    return conversation instanceof HTMLElement &&
      operationId === running.parentOperationId &&
      transient?.textContent?.includes(expected.parentPartialResponse) === true &&
      childOperationId.length > 0 &&
      childOperationId !== running.parentOperationId &&
      pendingRow?.textContent?.includes(expected.followUpText) === true &&
      composer instanceof HTMLFormElement &&
      textarea instanceof HTMLTextAreaElement &&
      button instanceof HTMLButtonElement &&
      textarea.disabled &&
      textarea.value === "" &&
      button.disabled &&
      selectedSessionId() === sessionId
      ? { childOperationId }
      : undefined
  }, "guided_follow_up_pending", guidedPendingDiagnostic)

  return {
    ok: true,
    sessionId,
    parentOperationId: running.parentOperationId,
    childOperationId: pending.childOperationId,
    initialUserRowIds: [...initialUserRowIds],
    initialAssistantRowIds: [...initialAssistantRowIds],
    submittedAt,
    rendererInteractive: submittedAt - startedAt,
    parentPartialVisible: true,
    composerModeVisible: true,
    followUpSubmitted: true,
    draftClearedAfterAcceptance: true,
    pendingVisible: true,
    parentOperationPreserved: true
  }

  function requiredComposer(mode: "submit") {
    const composer = document.querySelector(
      `[data-ui-composer][data-ui-composer-mode="${mode}"]`
    )
    const textarea = composer?.querySelector('textarea[name="text"]')
    if (
      !(composer instanceof HTMLFormElement) ||
      !(textarea instanceof HTMLTextAreaElement)
    ) {
      throw new Error("guided follow-up composer is unavailable")
    }
    return { composer, textarea }
  }

  function addedRows(
    initialIds: ReadonlySet<string>,
    role: "user" | "assistant"
  ): HTMLElement[] {
    return [...document.querySelectorAll(
      `[data-ui-conversation-row][data-ui-role="${role}"]`
    )].filter((row): row is HTMLElement =>
      row instanceof HTMLElement && !initialIds.has(conversationRowId(row))
    )
  }

  function conversationRowIds(
    owner: Element,
    role: "user" | "assistant"
  ): Set<string> {
    return new Set([...owner.querySelectorAll(
      `[data-ui-conversation-row][data-ui-role="${role}"]`
    )].map(conversationRowId))
  }

  function conversationRowId(row: Element): string {
    return row.getAttribute("data-ui-conversation-row") ?? ""
  }

  function selectedSessionId(): string | undefined {
    const value = document.querySelector(
      '[data-ui-session-select][aria-current="true"]'
    )?.getAttribute("data-ui-session-select") ?? ""
    return value.length === 0 ? undefined : value
  }

  function submitWithEnter(textarea: HTMLTextAreaElement, label: string): void {
    const enter = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true
    })
    textarea.dispatchEvent(enter)
    if (!enter.defaultPrevented) {
      throw new Error(`${label} was not submitted`)
    }
  }

  function setControlValue(control: HTMLTextAreaElement, value: string): void {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value"
    )?.set
    setter?.call(control, value)
    control.dispatchEvent(new Event("input", { bubbles: true }))
    control.dispatchEvent(new Event("change", { bubbles: true }))
  }

  function required(value: string | undefined, label: string): string {
    if (value === undefined || value.length === 0) {
      throw new Error(`${label} is required`)
    }
    return value
  }

  async function waitFor<T>(
    read: () => T | false | undefined,
    stage: string,
    diagnostic?: () => string
  ): Promise<T> {
    const end = Date.now() + 10_000
    while (Date.now() < end) {
      const value = read()
      if (value !== undefined && value !== false) return value
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    throw new Error(
      `guided follow-up proof timed out during ${stage}:${diagnostic?.() ?? "not_available"}`
    )
  }

  function guidedPendingDiagnostic(): string {
    const conversation = document.querySelector(
      '[data-ui-conversation-timeline]'
    )
    const pendingRow = conversation?.querySelector(
      '[data-ui-pending="queued-follow-up"]'
    )
    const composer = document.querySelector('[data-ui-composer]')
    const textarea = composer?.querySelector('textarea[name="text"]')
    const button = composer?.querySelector('button[type="submit"]')
    return [
      `conversation_${conversation?.getAttribute("data-ui-conversation-state") ?? "missing"}`,
      `parent_${String(conversation?.getAttribute("data-ui-operation-id") === running.parentOperationId)}`,
      `pending_${String(pendingRow !== null && pendingRow !== undefined)}`,
      `mode_${composer?.getAttribute("data-ui-composer-mode") ?? "missing"}`,
      `textarea_disabled_${String(textarea instanceof HTMLTextAreaElement && textarea.disabled)}`,
      `textarea_empty_${String(textarea instanceof HTMLTextAreaElement && textarea.value === "")}`,
      `button_disabled_${String(button instanceof HTMLButtonElement && button.disabled)}`,
      `session_${String(selectedSessionId() === sessionId)}`
    ].join("_")
  }
}

export async function runWanexDesktopProviderGuidedFollowUpSettlementProof(
  expected: WanexDesktopProviderGuidedFollowUpProofExpected,
  admission: WanexDesktopProviderGuidedFollowUpAdmission,
  createProofResult: typeof createWanexDesktopProviderRelaunchProofResult
): Promise<WanexDesktopProviderRelaunchProofResult> {
  const settled = await waitFor(() => {
    const conversation = document.querySelector(
      '[data-ui-conversation-timeline][data-ui-conversation-state="succeeded"]'
    )
    const operationId = conversation?.getAttribute(
      "data-ui-operation-id"
    ) ?? ""
    const addedUsers = addedRows(new Set(admission.initialUserRowIds), "user")
    const addedAssistants = addedRows(
      new Set(admission.initialAssistantRowIds),
      "assistant"
    )
    const parentUserVisible = addedUsers.some((row) =>
      row.textContent?.includes(expected.parentText) === true
    )
    const childUserVisible = addedUsers.some((row) =>
      row.textContent?.includes(expected.followUpText) === true
    )
    const parentResponseVisible = addedAssistants.some((row) =>
      row.textContent?.includes(expected.parentResponse) === true
    )
    const childResponseVisible = addedAssistants.some((row) =>
      row.textContent?.includes(expected.childResponse) === true
    )
    return conversation instanceof HTMLElement &&
      operationId === admission.childOperationId &&
      operationId !== admission.parentOperationId &&
      conversation.querySelector('[data-ui-pending="queued-follow-up"]') === null &&
      conversation.querySelector("[data-ui-transient-assistant]") === null &&
      addedUsers.length === 2 &&
      addedAssistants.length === 2 &&
      parentUserVisible &&
      childUserVisible &&
      parentResponseVisible &&
      childResponseVisible &&
      selectedSessionId() === admission.sessionId
      ? {
          parentUserVisible,
          childUserVisible,
          parentResponseVisible,
          childResponseVisible
        }
      : undefined
  })
  const settledAt = performance.now()
  const redacted =
    !document.documentElement.innerHTML.includes("secretRef") &&
    [...document.querySelectorAll('input[type="password"]')].every(
      (input) => !(input instanceof HTMLInputElement) || input.value === ""
    )
  return createProofResult("relaunch-guided-follow-up", {
    ok:
      admission.ok &&
      redacted &&
      settled.parentResponseVisible &&
      settled.childResponseVisible,
    initialConfiguredProviderCount: 1,
    configuredProviderCount: 1,
    providerConfigured: true,
    providerReady: true,
    providerEvidenceRedacted: redacted,
    modelId: expected.modelId,
    sessionId: admission.sessionId,
    conversationSubmitted: true,
    userVisible: settled.parentUserVisible && settled.childUserVisible,
    assistantVisible:
      settled.parentResponseVisible && settled.childResponseVisible,
    responseVisible: settled.childResponseVisible,
    guidedParentSubmitted: true,
    guidedParentPartialVisible: admission.parentPartialVisible,
    guidedComposerModeVisible: admission.composerModeVisible,
    guidedFollowUpSubmitted: admission.followUpSubmitted,
    guidedDraftClearedAfterAcceptance:
      admission.draftClearedAfterAcceptance,
    guidedPendingVisible: admission.pendingVisible,
    guidedParentOperationPreserved: admission.parentOperationPreserved,
    guidedParentResponseVisible: settled.parentResponseVisible,
    guidedChildFreshOperation:
      admission.childOperationId !== admission.parentOperationId,
    guidedChildPromoted: true,
    guidedChildResponseVisible: settled.childResponseVisible,
    guidedFollowUpSessionPreserved:
      selectedSessionId() === admission.sessionId,
    guidedParentCompletedWithoutCancellation: settled.parentResponseVisible,
    rendererInteractive: admission.rendererInteractive,
    conversationSettlement: settledAt - admission.submittedAt,
    rendererPostSettlement: performance.now() - settledAt
  })

  function addedRows(
    initialIds: ReadonlySet<string>,
    role: "user" | "assistant"
  ): HTMLElement[] {
    return [...document.querySelectorAll(
      `[data-ui-conversation-row][data-ui-role="${role}"]`
    )].filter((row): row is HTMLElement =>
      row instanceof HTMLElement &&
      !initialIds.has(row.getAttribute("data-ui-conversation-row") ?? "")
    )
  }

  function selectedSessionId(): string | undefined {
    const value = document.querySelector(
      '[data-ui-session-select][aria-current="true"]'
    )?.getAttribute("data-ui-session-select") ?? ""
    return value.length === 0 ? undefined : value
  }

  async function waitFor<T>(read: () => T | undefined): Promise<T> {
    const end = Date.now() + 10_000
    while (Date.now() < end) {
      const value = read()
      if (value !== undefined) return value
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    throw new Error("guided follow-up proof timed out during settlement")
  }
}
