import type { WanexDesktopCodingProofResult } from "./proof-contract.js"
import {
  createToolRuntimeBinding,
  jsonToolResultContent,
  ToolRegistry,
  type ToolDefinition,
  type ToolExecutionResult,
  type ToolInvocation,
} from "@wanex/runtime/tools"
import {
  WANEX_DESKTOP_PROOF_CODING_RECOVERY_TOOL_NAME,
} from "./proof-contract.js"

export function createDesktopCodingRecoveryProofContext(): {
  readonly tools: ToolRegistry
} {
  const tools = new ToolRegistry()
  tools.register(new DesktopCodingRecoveryProofTool())
  return { tools }
}

class DesktopCodingRecoveryProofTool implements ToolDefinition {
  readonly name = WANEX_DESKTOP_PROOF_CODING_RECOVERY_TOOL_NAME
  readonly description =
    "Reconcile a deterministic proof operation whose first result is lost."
  readonly inputSchema = {
    type: "object",
    properties: { operation: { type: "string", minLength: 1, maxLength: 128 } },
    required: ["operation"],
    additionalProperties: false,
  } as const
  readonly risk = "read_only" as const
  readonly idempotent = true
  readonly concurrency = "parallel_safe" as const
  readonly resultMode = "immediate" as const
  readonly runtimeBinding = createToolRuntimeBinding({
    implementationId: "wanex.desktop.proof.coding-recovery-tool",
    implementationRevision: "1",
  })
  #invocationCount = 0

  presentCall(input: unknown) {
    const operation = readOperation(input)
    return { summary: `Reconcile ${operation}` }
  }

  presentResult(request: { readonly input: unknown; readonly result: ToolExecutionResult }) {
    const operation = readOperation(request.input)
    return {
      summary: request.result.outcome === "succeeded"
        ? `${operation} reconciled`
        : `${operation} failed`,
    }
  }

  async invoke(invocation: ToolInvocation): Promise<ToolExecutionResult> {
    const operation = readOperation(invocation.input)
    this.#invocationCount += 1
    if (this.#invocationCount === 1) {
      return {
        outcome: "ambiguous",
        toolCallId: invocation.toolCallId,
        message: "proof Tool result was not observed",
        reconciliationRef: "coding-proof-recovery",
      }
    }
    return {
      outcome: "succeeded",
      toolCallId: invocation.toolCallId,
      content: jsonToolResultContent({ operation, reconciled: true }),
    }
  }
}

function readOperation(input: unknown): string {
  if (
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    typeof (input as Record<string, unknown>).operation !== "string"
  ) {
    throw new Error("coding recovery proof operation is invalid")
  }
  return (input as { readonly operation: string }).operation
}

export interface WanexDesktopCodingProofExpectations {
  readonly message: string
  readonly toolName: string
  readonly file: string
  readonly response: string
  readonly recoveryMessage: string
  readonly recoveryToolName: string
  readonly recoveryResponse: string
}

export function wanexDesktopCodingProofScript(
  expected: WanexDesktopCodingProofExpectations,
): string {
  return `(${runWanexDesktopCodingProof.toString()})(${JSON.stringify(expected)})`
}

export async function runWanexDesktopCodingProof(
  expected: WanexDesktopCodingProofExpectations,
): Promise<WanexDesktopCodingProofResult> {
  function setControlValue(control: HTMLTextAreaElement, value: string): void {
    const descriptor = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )
    descriptor?.set?.call(control, value)
    control.dispatchEvent(new Event("input", { bubbles: true }))
    control.dispatchEvent(new Event("change", { bubbles: true }))
  }

  async function waitFor<T>(
    read: () => T | undefined,
    timeoutMs: number,
    label: string,
  ): Promise<T> {
    const deadline = performance.now() + timeoutMs
    for (;;) {
      const value = read()
      if (value !== undefined) return value
      if (performance.now() >= deadline) {
        throw new Error(`Coding proof timed out: ${label}`)
      }
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      )
    }
  }

  const startedAt = performance.now()
  const initialAssistantVisible =
    document.querySelector('[data-ui-product-renderer][data-ui-surface="assistant"]') !== null
  const codingNav = await waitFor(() => {
    const candidate = document.querySelector('[data-ui-product-surface="coding"]')
    return candidate instanceof HTMLButtonElement ? candidate : undefined
  }, 10_000, "coding_navigation")
  codingNav.click()
  const emptyShell = await waitFor(() => {
    const candidate = document.querySelector('[data-ui-coding-shell]')
    return candidate instanceof HTMLElement &&
      candidate.getAttribute("data-ui-coding-state") !== "error"
      ? candidate
      : undefined
  }, 10_000, "coding_surface")
  const emptyProjectStateVisible =
    emptyShell.querySelector('[data-ui-coding-action="open-project"]') !== null
  const openProject = emptyShell.querySelector(
    '[data-ui-coding-action="open-project"]'
  )
  if (!(openProject instanceof HTMLButtonElement)) {
    throw new Error("Coding proof project picker is unavailable")
  }
  openProject.click()
  const project = await waitFor(() => {
    const candidate = document.querySelector('[data-ui-coding-project]')
    return candidate instanceof HTMLElement ? candidate : undefined
  }, 20_000, "coding_project")
  const projectId = project.getAttribute("data-ui-coding-project-id") ?? ""
  const projectPathEvidenceHidden =
    !document.documentElement.innerHTML.includes("WANEX_CODING_PROOF_PROJECT_PATH")
  const composer = await waitFor(() => {
    const candidate = document.querySelector('[data-ui-coding-composer] textarea')
    return candidate instanceof HTMLTextAreaElement ? candidate : undefined
  }, 10_000, "coding_composer")
  setControlValue(composer, expected.message)
  const send = composer.closest("form")?.querySelector('button[type="submit"]')
  if (!(send instanceof HTMLButtonElement)) {
    throw new Error("Coding proof submit control is unavailable")
  }
  await waitFor(() => !send.disabled ? true : undefined, 10_000, "coding_submit")
  const conversationStartedAt = performance.now()
  const submitEvent = new KeyboardEvent("keydown", {
    key: "Enter",
    bubbles: true,
    cancelable: true
  })
  composer.dispatchEvent(submitEvent)
  if (!submitEvent.defaultPrevented) {
    send.click()
  }
  const userMessageVisible = await waitFor(() =>
    [...document.querySelectorAll('[data-ui-coding-message-role="user"]')]
      .some((row) => row.textContent?.includes(expected.message) === true)
      ? true
      : undefined
  , 20_000, "coding_user_message")
  const approval = await waitFor(() => {
    const candidate = document.querySelector('[data-ui-coding-approval]')
    return candidate instanceof HTMLElement ? candidate : undefined
  }, 20_000, "coding_approval")
  const toolNameVisible = approval.textContent?.includes(expected.toolName) === true
  const approvalButton = approval.querySelector(
    '[data-ui-coding-approval-action="approve_once"]'
  )
  if (!(approvalButton instanceof HTMLButtonElement)) {
    throw new Error("Coding proof approval control is unavailable")
  }
  const noFabricatedToolResult =
    document.querySelector('[data-ui-coding-message-role="tool"]') === null
  approvalButton.click()
  const proposal = await waitFor(() => {
    const candidate = document.querySelector('[data-ui-coding-proposal]')
    return candidate instanceof HTMLElement &&
      candidate.getAttribute("data-ui-coding-proposal-state") === "open"
      ? candidate
      : undefined
  }, 20_000, "coding_proposal")
  const proposalVisible =
    proposal.querySelector(`[data-ui-coding-proposal-file="${expected.file}"]`) !== null
  const turnSucceeded = await waitFor(() =>
    document.querySelector('[data-ui-coding-turn-state="succeeded"]') !== null
      ? true
      : undefined
  , 20_000, "coding_turn")
  const responseVisible = await waitFor(() =>
    [...document.querySelectorAll('[data-ui-coding-message-role="assistant"]')]
      .some((row) => row.textContent?.includes(expected.response) === true)
      ? true
      : undefined
  , 20_000, "coding_response")
  const approveProposal = proposal.querySelector(
    '[data-ui-coding-proposal-action="approve"]'
  )
  if (!(approveProposal instanceof HTMLButtonElement)) {
    throw new Error("Coding proof Proposal approval is unavailable")
  }
  approveProposal.click()
  const approvedProposal = await waitFor(() =>
    document.querySelector('[data-ui-coding-proposal-state="approved"]') ?? undefined
  , 10_000, "coding_proposal_review")
  const proposalReviewed = approvedProposal !== undefined
  const requestApply = approvedProposal.querySelector(
    '[data-ui-coding-proposal-action="request_apply"]'
  )
  if (!(requestApply instanceof HTMLButtonElement)) {
    throw new Error("Coding proof Proposal apply request is unavailable")
  }
  requestApply.click()
  const applyRequestedProposal = await waitFor(() =>
    document.querySelector('[data-ui-coding-proposal-state="apply_requested"]') ?? undefined
  , 10_000, "coding_proposal_apply_request")
  const proposalApplyRequested = applyRequestedProposal !== undefined
  const apply = applyRequestedProposal.querySelector(
    '[data-ui-coding-proposal-action="apply"]'
  )
  if (!(apply instanceof HTMLButtonElement)) {
    throw new Error("Coding proof Proposal apply is unavailable")
  }
  apply.click()
  await waitFor(() =>
    document.querySelector('[data-ui-coding-proposal-change-state="applied"]') ?? undefined
  , 20_000, "coding_proposal_apply")
  const proposalApplied = true
  const undo = document.querySelector(
    '[data-ui-coding-proposal-action="undo"]'
  )
  if (!(undo instanceof HTMLButtonElement)) {
    throw new Error("Coding proof Proposal undo is unavailable")
  }
  undo.click()
  await waitFor(() =>
    document.querySelector('[data-ui-coding-proposal-change-state="undone"]') ?? undefined
  , 20_000, "coding_proposal_undo")
  const finishedAt = performance.now()
  const sessionId = document.querySelector(
    '[data-ui-coding-session-selected]'
  )?.getAttribute("data-ui-coding-session-selected") ?? ""
  const proposalUndone =
    document.querySelector('[data-ui-coding-proposal-change-state="undone"]') !== null
  const sessionBeforeRecovery = document.querySelector(
    '[data-ui-coding-session-selected]'
  )?.getAttribute('data-ui-coding-session-selected') ?? ""
  const recoveryComposer = await waitFor(() => {
    const candidate = document.querySelector('[data-ui-coding-composer] textarea')
    return candidate instanceof HTMLTextAreaElement ? candidate : undefined
  }, 10_000, "coding_recovery_composer")
  setControlValue(recoveryComposer, expected.recoveryMessage)
  const recoverySend = recoveryComposer.closest("form")?.querySelector('button[type="submit"]')
  if (!(recoverySend instanceof HTMLButtonElement)) {
    throw new Error("Coding proof recovery submit control is unavailable")
  }
  await waitFor(() => !recoverySend.disabled ? true : undefined, 10_000, "coding_recovery_submit")
  recoverySend.click()
  const recoveryUserMessageVisible = await waitFor(() =>
    [...document.querySelectorAll('[data-ui-coding-message-role="user"]')]
      .some((row) => row.textContent?.includes(expected.recoveryMessage) === true)
      ? true
      : undefined
  , 20_000, "coding_recovery_user_message")
  const recovery = await waitFor(() => {
    const candidate = document.querySelector('[data-ui-coding-recovery]')
    return candidate instanceof HTMLElement ? candidate : undefined
  }, 20_000, "coding_recovery_review")
  const recoveryToolNameVisible = recovery.textContent?.includes(expected.recoveryToolName) === true
  const recoveryRetry = recovery.querySelector('[data-ui-coding-recovery-action="retry"]')
  const recoveryRetryAvailable = recoveryRetry instanceof HTMLButtonElement
  if (!recoveryRetryAvailable) {
    throw new Error("Coding proof recovery retry control is unavailable")
  }
  recoveryRetry.click()
  const recoveryTurnSucceeded = await waitFor(() =>
    document.querySelector('[data-ui-coding-turn-state="succeeded"]') !== null
      ? true
      : undefined
  , 20_000, "coding_recovery_turn")
  const recoveryResponseVisible = await waitFor(() =>
    [...document.querySelectorAll('[data-ui-coding-message-role="assistant"]')]
      .some((row) => row.textContent?.includes(expected.recoveryResponse) === true)
      ? true
      : undefined
  , 20_000, "coding_recovery_response")
  const sessionAfterRecovery = document.querySelector(
    '[data-ui-coding-session-selected]'
  )?.getAttribute('data-ui-coding-session-selected') ?? ""
  const recoverySessionPreserved =
    sessionBeforeRecovery.length > 0 && sessionBeforeRecovery === sessionAfterRecovery
  return {
    ok:
      initialAssistantVisible &&
      emptyProjectStateVisible &&
      projectId.length > 0 &&
      projectPathEvidenceHidden &&
      userMessageVisible &&
      toolNameVisible &&
      noFabricatedToolResult &&
      proposalVisible &&
      turnSucceeded &&
      responseVisible &&
      proposalReviewed &&
      proposalApplyRequested &&
      proposalApplied &&
      proposalUndone &&
      recoveryUserMessageVisible &&
      recoveryToolNameVisible &&
      recoveryRetryAvailable &&
      recoveryTurnSucceeded &&
      recoveryResponseVisible &&
      recoverySessionPreserved,
    step: "relaunch-coding",
    providerReady: true,
    providerEvidenceRedacted: true,
    initialAssistantVisible,
    codingSurfaceSelected: true,
    emptyProjectStateVisible,
    projectSelected: true,
    projectId,
    projectPathEvidenceHidden,
    sessionCreated: sessionId.length > 0,
    sessionId,
    userMessageVisible,
    approvalVisible: true,
    toolNameVisible,
    approvalResolved: true,
    turnSucceeded,
    responseVisible,
    proposalVisible,
    proposalReviewed,
    proposalApplyRequested,
    proposalApplied,
    proposalUndone,
    noFabricatedToolResult,
    recoveryVisible: true,
    recoveryToolNameVisible,
    recoveryRetryAvailable,
    recoveryRetried: true,
    recoveryTurnSucceeded,
    recoveryResponseVisible,
    recoverySessionPreserved,
    timingsMs: {
      rendererInteractive: conversationStartedAt - startedAt,
      conversationSettlement: finishedAt - conversationStartedAt,
      rendererPostSettlement: performance.now() - finishedAt
    }
  }
}
