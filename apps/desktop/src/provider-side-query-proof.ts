import type {
  WanexDesktopProviderRelaunchProofResult
} from "./proof-contract.js"
import type {
  createWanexDesktopProviderRelaunchProofResult
} from "./provider-relaunch-proof-result.js"

export interface WanexDesktopProviderSideQueryProofExpected {
  readonly modelId: string
  readonly parentText: string
  readonly question: string
  readonly answer: string
  readonly parentPartialResponse: string
  readonly parentResponse: string
}

export interface WanexDesktopProviderSideQueryAdmission {
  readonly ok: boolean
  readonly sessionId: string
  readonly parentOperationId: string
  readonly initialUserRowIds: readonly string[]
  readonly initialAssistantRowIds: readonly string[]
  readonly submittedAt: number
  readonly rendererInteractive: number
  readonly parentPartialVisible: boolean
  readonly disclosureVisible: boolean
  readonly querySubmitted: boolean
  readonly answerVisible: boolean
  readonly parentOperationPreserved: boolean
  readonly transcriptUnchanged: boolean
  readonly dismissed: boolean
}

export async function runWanexDesktopProviderSideQueryAdmissionProof(
  expected: WanexDesktopProviderSideQueryProofExpected
): Promise<WanexDesktopProviderSideQueryAdmission> {
  const startedAt = performance.now()
  const surface = await waitFor(() => {
    const candidate = document.querySelector(
      '[data-ui-assistant-shell]'
    )
    const composer = candidate?.querySelector(
      '[data-ui-composer][data-ui-composer-mode="submit"]'
    )
    const textarea = composer?.querySelector('textarea[name="text"]')
    const button = composer?.querySelector('button[type="submit"]')
    return candidate instanceof Element &&
      textarea instanceof HTMLTextAreaElement &&
      button instanceof HTMLButtonElement &&
      !textarea.disabled &&
      selectedSessionId() !== undefined
      ? candidate
      : undefined
  }, "side_query_ready")
  const sessionId = required(selectedSessionId(), "selected Session")
  const initialUserRowIds = conversationRowIds(surface, "user")
  const initialAssistantRowIds = conversationRowIds(surface, "assistant")
  const composer = requiredConversationComposer()
  setControlValue(composer, expected.parentText)
  await waitFor(() => {
    const button = document.querySelector(
      '[data-ui-composer] button[type="submit"]'
    )
    return button instanceof HTMLButtonElement && !button.disabled
      ? true
      : undefined
  }, "side_query_parent_draft")
  const submittedAt = performance.now()
  submitWithEnter(composer, "side-query parent")

  const running = await waitFor(() => {
    const conversation = document.querySelector(
      '[data-ui-conversation-timeline][data-ui-conversation-state="running"]'
    )
    const operationId = conversation?.getAttribute(
      "data-ui-operation-id"
    ) ?? ""
    const transient = conversation?.querySelector(
      "[data-ui-transient-assistant]"
    )
    const workflows = document.querySelector(
      "[data-ui-open-workflows]"
    )
    const addedUsers = addedRows(initialUserRowIds, "user")
    const addedAssistants = addedRows(initialAssistantRowIds, "assistant")
    return conversation instanceof HTMLElement &&
      operationId.length > 0 &&
      transient?.textContent?.includes(expected.parentPartialResponse) === true &&
      workflows instanceof HTMLButtonElement &&
      !workflows.disabled &&
      addedUsers.length === 1 &&
      addedUsers[0]?.textContent?.includes(expected.parentText) === true &&
      addedAssistants.length === 0 &&
      selectedSessionId() === sessionId
      ? { operationId, workflows }
      : undefined
  }, "side_query_parent_running")

  running.workflows.click()
  const asideTab = await waitFor(() => {
    const candidate = document.querySelector(
      '[data-ui-workflow-tab="aside"]'
    )
    return candidate instanceof HTMLButtonElement && !candidate.disabled
      ? candidate
      : undefined
  }, "side_query_workflows_open")
  asideTab.click()
  const queryForm = await waitFor(() => {
    const form = document.querySelector("[data-ui-side-query-form]")
    const textarea = form?.querySelector('textarea[name="question"]')
    const button = form?.querySelector('button[type="submit"]')
    return form instanceof HTMLFormElement &&
      textarea instanceof HTMLTextAreaElement &&
      button instanceof HTMLButtonElement &&
      !textarea.disabled
      ? { button, form, textarea }
      : undefined
  }, "side_query_disclosure_open")
  setControlValue(queryForm.textarea, expected.question)
  await waitFor(
    () => !queryForm.button.disabled ? true : undefined,
    "side_query_draft"
  )
  submitForm(queryForm.form, "side query")

  const answered = await waitFor(() => {
    const conversation = document.querySelector(
      '[data-ui-conversation-timeline][data-ui-conversation-state="running"]'
    )
    const operationId = conversation?.getAttribute(
      "data-ui-operation-id"
    ) ?? ""
    const transient = conversation?.querySelector(
      "[data-ui-transient-assistant]"
    )
    const sideQuery = document.querySelector(
      '[data-ui-side-query][data-ui-side-query-state="succeeded"]'
    )
    const queryId = sideQuery?.getAttribute("data-ui-side-query") ?? ""
    const dismiss = sideQuery?.querySelector(
      '[data-ui-action="dismiss-side-query"]'
    )
    const rowsUnchanged = transcriptMatchesParentOnly()
    return conversation instanceof HTMLElement &&
      operationId === running.operationId &&
      transient?.textContent?.includes(expected.parentPartialResponse) === true &&
      sideQuery instanceof HTMLElement &&
      queryId.length > 0 &&
      sideQuery.querySelector("[data-ui-side-query-question]")
        ?.textContent?.includes(expected.question) === true &&
      sideQuery.querySelector("[data-ui-side-query-answer]")
        ?.textContent?.includes(expected.answer) === true &&
      dismiss instanceof HTMLButtonElement &&
      !dismiss.disabled &&
      rowsUnchanged &&
      selectedSessionId() === sessionId
      ? { dismiss, queryId }
      : undefined
  }, "side_query_answer", sideQueryAnswerDiagnostic)

  answered.dismiss.click()
  await waitFor(() => {
    const conversation = document.querySelector(
      '[data-ui-conversation-timeline][data-ui-conversation-state="running"]'
    )
    const operationId = conversation?.getAttribute(
      "data-ui-operation-id"
    ) ?? ""
    const idle = document.querySelector("[data-ui-side-query-form]")
    return conversation instanceof HTMLElement &&
      operationId === running.operationId &&
      idle instanceof HTMLFormElement &&
      document.querySelector(
        `[data-ui-side-query="${answered.queryId}"]`
      ) === null &&
      !document.querySelector("[data-ui-workflows-panel]")
        ?.textContent?.includes(expected.question) &&
      !document.querySelector("[data-ui-workflows-panel]")
        ?.textContent?.includes(expected.answer) &&
      transcriptMatchesParentOnly() &&
      selectedSessionId() === sessionId
      ? true
      : undefined
  }, "side_query_dismissal", sideQueryDismissalDiagnostic)

  return {
    ok: true,
    sessionId,
    parentOperationId: running.operationId,
    initialUserRowIds: [...initialUserRowIds],
    initialAssistantRowIds: [...initialAssistantRowIds],
    submittedAt,
    rendererInteractive: submittedAt - startedAt,
    parentPartialVisible: true,
    disclosureVisible: true,
    querySubmitted: true,
    answerVisible: true,
    parentOperationPreserved: true,
    transcriptUnchanged: true,
    dismissed: true
  }

  function transcriptMatchesParentOnly(): boolean {
    const users = addedRows(initialUserRowIds, "user")
    const assistants = addedRows(initialAssistantRowIds, "assistant")
    return users.length === 1 &&
      users[0]?.textContent?.includes(expected.parentText) === true &&
      !users.some((row) => row.textContent?.includes(expected.question)) &&
      !assistants.some((row) => row.textContent?.includes(expected.answer)) &&
      assistants.length === 0
  }

  function requiredConversationComposer(): HTMLTextAreaElement {
    const textarea = document.querySelector(
      '[data-ui-composer] textarea[name="text"]'
    )
    if (!(textarea instanceof HTMLTextAreaElement) || textarea.disabled) {
      throw new Error("side-query parent composer is unavailable")
    }
    return textarea
  }

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

  function conversationRowIds(
    owner: Element,
    role: "user" | "assistant"
  ): Set<string> {
    return new Set([...owner.querySelectorAll(
      `[data-ui-conversation-row][data-ui-role="${role}"]`
    )].map((row) => row.getAttribute("data-ui-conversation-row") ?? ""))
  }

  function selectedSessionId(): string | undefined {
    const value = document.querySelector(
      '[data-ui-session-select][aria-current="true"]'
    )?.getAttribute("data-ui-session-select") ?? ""
    return value.length === 0 ? undefined : value
  }

  function submitWithEnter(textarea: HTMLTextAreaElement, label: string): void {
    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true
    })
    textarea.dispatchEvent(event)
    if (!event.defaultPrevented) throw new Error(`${label} was not submitted`)
  }

  function submitForm(form: HTMLFormElement, label: string): void {
    const event = new Event("submit", { bubbles: true, cancelable: true })
    form.dispatchEvent(event)
    if (!event.defaultPrevented) throw new Error(`${label} was not submitted`)
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
      `side-query proof timed out during ${stage}:${diagnostic?.() ?? "not_available"}`
    )
  }

  function sideQueryAnswerDiagnostic(): string {
    const conversation = document.querySelector(
      '[data-ui-conversation-timeline]'
    )
    const sideQuery = document.querySelector('[data-ui-side-query]')
    const dismiss = sideQuery?.querySelector(
      '[data-ui-action="dismiss-side-query"]'
    )
    return [
      `conversation_${conversation?.getAttribute("data-ui-conversation-state") ?? "missing"}`,
      `parent_${String(conversation?.getAttribute("data-ui-operation-id") === running.operationId)}`,
      `partial_${String(conversation?.querySelector("[data-ui-transient-assistant]")?.textContent?.includes(expected.parentPartialResponse) === true)}`,
      `query_${sideQuery?.getAttribute("data-ui-side-query-state") ?? "missing"}`,
      `question_${String(sideQuery?.querySelector("[data-ui-side-query-question]")?.textContent?.includes(expected.question) === true)}`,
      `answer_${String(sideQuery?.querySelector("[data-ui-side-query-answer]")?.textContent?.includes(expected.answer) === true)}`,
      `dismiss_${String(dismiss instanceof HTMLButtonElement && !dismiss.disabled)}`,
      `rows_${String(transcriptMatchesParentOnly())}`,
      `session_${String(selectedSessionId() === sessionId)}`
    ].join("_")
  }

  function sideQueryDismissalDiagnostic(): string {
    const conversation = document.querySelector(
      '[data-ui-conversation-timeline]'
    )
    return [
      `conversation_${conversation?.getAttribute("data-ui-conversation-state") ?? "missing"}`,
      `parent_${String(conversation?.getAttribute("data-ui-operation-id") === running.operationId)}`,
      `form_${String(document.querySelector("[data-ui-side-query-form]") instanceof HTMLFormElement)}`,
      `query_absent_${String(document.querySelector(`[data-ui-side-query="${answered.queryId}"]`) === null)}`,
      `rows_${String(transcriptMatchesParentOnly())}`,
      `session_${String(selectedSessionId() === sessionId)}`
    ].join("_")
  }
}

export async function runWanexDesktopProviderSideQuerySettlementProof(
  expected: WanexDesktopProviderSideQueryProofExpected,
  admission: WanexDesktopProviderSideQueryAdmission,
  createProofResult: typeof createWanexDesktopProviderRelaunchProofResult
): Promise<WanexDesktopProviderRelaunchProofResult> {
  const settled = await waitFor(() => {
    const conversation = document.querySelector(
      '[data-ui-conversation-timeline][data-ui-conversation-state="succeeded"]'
    )
    const operationId = conversation?.getAttribute(
      "data-ui-operation-id"
    ) ?? ""
    const users = addedRows(new Set(admission.initialUserRowIds), "user")
    const assistants = addedRows(
      new Set(admission.initialAssistantRowIds),
      "assistant"
    )
    const parentUserVisible = users.length === 1 &&
      users[0]?.textContent?.includes(expected.parentText) === true
    const parentResponseVisible = assistants.length === 1 &&
      assistants[0]?.textContent?.includes(expected.parentResponse) === true
    const sideContentAbsent =
      !users.some((row) => row.textContent?.includes(expected.question)) &&
      !assistants.some((row) => row.textContent?.includes(expected.answer)) &&
      !conversation?.textContent?.includes(expected.question) &&
      !conversation?.textContent?.includes(expected.answer)
    return conversation instanceof HTMLElement &&
      operationId === admission.parentOperationId &&
      conversation.querySelector("[data-ui-transient-assistant]") === null &&
      parentUserVisible &&
      parentResponseVisible &&
      sideContentAbsent &&
      selectedSessionId() === admission.sessionId
      ? { parentResponseVisible, parentUserVisible, sideContentAbsent }
      : undefined
  })
  const settledAt = performance.now()
  const redacted =
    !document.documentElement.innerHTML.includes("secretRef") &&
    [...document.querySelectorAll('input[type="password"]')].every(
      (input) => !(input instanceof HTMLInputElement) || input.value === ""
    )
  return createProofResult("relaunch-side-query", {
    ok:
      admission.ok &&
      redacted &&
      settled.parentResponseVisible &&
      settled.sideContentAbsent,
    initialConfiguredProviderCount: 1,
    configuredProviderCount: 1,
    providerConfigured: true,
    providerReady: true,
    providerEvidenceRedacted: redacted,
    modelId: expected.modelId,
    sessionId: admission.sessionId,
    conversationSubmitted: true,
    userVisible: settled.parentUserVisible,
    assistantVisible: settled.parentResponseVisible,
    responseVisible: settled.parentResponseVisible,
    sideQueryParentSubmitted: true,
    sideQueryParentPartialVisible: admission.parentPartialVisible,
    sideQueryDisclosureVisible: admission.disclosureVisible,
    sideQuerySubmitted: admission.querySubmitted,
    sideQueryAnswerVisible: admission.answerVisible,
    sideQueryParentOperationPreserved: admission.parentOperationPreserved,
    sideQueryTranscriptUnchanged:
      admission.transcriptUnchanged && settled.sideContentAbsent,
    sideQueryDismissed: admission.dismissed,
    sideQueryParentResponseVisible: settled.parentResponseVisible,
    sideQuerySessionPreserved: selectedSessionId() === admission.sessionId,
    sideQueryParentCompletedWithoutCancellation: settled.parentResponseVisible,
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
    throw new Error("side-query proof timed out during parent settlement")
  }
}
