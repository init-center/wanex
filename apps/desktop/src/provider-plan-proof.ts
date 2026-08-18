import type { WanexDesktopProviderRelaunchProofResult } from "./proof-contract.js"
import type {
  WanexDesktopProviderJourneyProofContext
} from "./provider-multimodal-proof.js"

export interface WanexDesktopProviderPlanProofExpected {
  readonly modelId: string
  readonly planRequest: string
  readonly planTitle: string
  readonly planSummary: string
  readonly planStepId: string
  readonly planStepTitle: string
  readonly planResponse: string
}

export async function runWanexDesktopProviderPlanProof(
  expected: WanexDesktopProviderPlanProofExpected,
  context: WanexDesktopProviderJourneyProofContext
): Promise<WanexDesktopProviderRelaunchProofResult> {
  const ready = await context.waitFor(() => {
    const sessionId = selectedSessionId()
    const workflows = document.querySelector("[data-ui-open-workflows]")
    if (
      context.configuredProviderCount() !== 1 ||
      !context.providerReady() ||
      sessionId === undefined ||
      !(workflows instanceof HTMLButtonElement) ||
      workflows.disabled
    ) {
      return undefined
    }
    return { sessionId, workflows }
  }, 10_000, "plan_ready")

  ready.workflows.click()
  const planTab = await context.waitFor(() => {
    const candidate = document.querySelector('[data-ui-workflow-tab="plan"]')
    return candidate instanceof HTMLButtonElement ? candidate : undefined
  }, 10_000, "plan_tab")
  planTab.click()
  const form = await context.waitFor(() => {
    const candidate = document.querySelector("[data-ui-plan-form]")
    const textarea = candidate?.querySelector('textarea[name="text"]')
    const button = candidate?.querySelector('button[type="submit"]')
    return (
      candidate instanceof HTMLFormElement &&
      textarea instanceof HTMLTextAreaElement &&
      button instanceof HTMLButtonElement &&
      !textarea.disabled
    )
      ? { textarea, button }
      : undefined
  }, 10_000, "plan_form")

  context.setControlValue(form.textarea, expected.planRequest)
  await context.waitFor(() => !form.button.disabled ? true : undefined, 10_000, "plan_draft")
  const submittedAt = performance.now()
  form.button.click()

  const openProposal = await context.waitFor(readOpenProposal, 20_000, "plan_open", planDiagnostic)

  function readOpenProposal(): {
    readonly proposalId: string
    readonly revision: number
    readonly executionAbsent: boolean
  } | undefined {
    const proposal = document.querySelector(
      '[data-ui-plan-proposal][data-ui-plan-proposal-state="open"]'
    )
    if (!(proposal instanceof HTMLElement)) return undefined
    const proposalId = proposal.getAttribute("data-ui-plan-proposal") ?? ""
    const revision = Number(proposal.getAttribute("data-ui-plan-revision"))
    const title = proposal.querySelector("h3")?.textContent?.trim()
    const step = proposal.querySelector(
      `[data-ui-plan-step="${expected.planStepId}"] strong`
    )?.textContent?.trim()
    const executionAbsent =
      proposal.querySelector("[data-ui-plan-execution]") === null
    return (
      selectedSessionId() === ready.sessionId &&
      proposalId.length > 0 &&
      revision === 1 &&
      title === expected.planTitle &&
      proposal.textContent?.includes(expected.planSummary) === true &&
      step === expected.planStepTitle &&
      executionAbsent
    )
      ? { proposalId, revision, executionAbsent }
      : undefined
  }

  const approve = await context.waitFor(() => {
    const button = decisionButton(openProposal.proposalId, "approve")
    return button.disabled ? undefined : button
  }, 10_000, "plan_approval_ready", planDiagnostic)
  approve.click()
  const approved = await context.waitFor(() => {
    const proposal = proposalById(openProposal.proposalId)
    if (
      proposal?.getAttribute("data-ui-plan-proposal-state") !== "approved" ||
      proposal.querySelector("[data-ui-plan-execution]") !== null
    ) {
      return undefined
    }
    const revision = Number(proposal.getAttribute("data-ui-plan-revision"))
    return revision === openProposal.revision + 1
      ? { revision }
      : undefined
  }, 10_000, "plan_approved", planDiagnostic)

  const execute = await context.waitFor(() => {
    const button = proposalById(openProposal.proposalId)?.querySelector(
      '[data-ui-action="execute-plan-proposal"]'
    )
    return button instanceof HTMLButtonElement && !button.disabled
      ? button
      : undefined
  }, 10_000, "plan_execution_ready", planDiagnostic)
  execute.click()

  await context.waitFor(() => {
    const proposal = proposalById(openProposal.proposalId)
    const execution = proposal?.querySelector(
      '[data-ui-plan-execution][data-ui-job-state="succeeded"]'
    )
    const conversation = document.querySelector(
      '[data-ui-conversation-timeline][data-ui-conversation-state="succeeded"]'
    )
    const responseVisible = [...document.querySelectorAll(
      '[data-ui-conversation-row][data-ui-role="assistant"]'
    )].some((row) => row.textContent?.includes(expected.planResponse))
    const executionInputVisible = [...document.querySelectorAll(
      '[data-ui-conversation-row][data-ui-role="user"]'
    )].some((row) => row.textContent?.includes(expected.planTitle))
    return (
      selectedSessionId() === ready.sessionId &&
      execution instanceof HTMLElement &&
      conversation instanceof HTMLElement &&
      executionInputVisible &&
      responseVisible
    )
      ? true
      : undefined
  }, 20_000, "plan_execution", planDiagnostic)

  const settledAt = performance.now()
  const redacted = context.redacted()
  return context.result({
    ok:
      redacted &&
      openProposal.executionAbsent &&
      selectedSessionId() === ready.sessionId,
    initialConfiguredProviderCount: 1,
    configuredProviderCount: 1,
    providerConfigured: true,
    providerReady: true,
    providerEvidenceRedacted: redacted,
    modelId: expected.modelId,
    sessionId: ready.sessionId,
    conversationSubmitted: true,
    userVisible: true,
    assistantVisible: true,
    responseVisible: true,
    planGenerated: true,
    planOpenBeforeApproval: true,
    planExecutionAbsentBeforeApproval: openProposal.executionAbsent,
    planApproved: true,
    planExecuted: true,
    planSessionPreserved: selectedSessionId() === ready.sessionId,
    planResponseVisible: true,
    planProposalRevision: approved.revision,
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

  function proposalById(proposalId: string): HTMLElement | undefined {
    const proposal = document.querySelector(
      `[data-ui-plan-proposal="${proposalId}"]`
    )
    return proposal instanceof HTMLElement ? proposal : undefined
  }

  function decisionButton(
    proposalId: string,
    decision: "approve"
  ): HTMLButtonElement {
    const proposal = proposalById(proposalId)
    const button = proposal?.querySelector(
      `[data-ui-action="decide-plan-proposal"][data-ui-decision="${decision}"]`
    )
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error("Provider Plan approval control is unavailable")
    }
    return button
  }

  function planDiagnostic(): string {
    if (readOpenProposal() !== undefined) return "plan_open_ready"
    if (selectedSessionId() !== ready.sessionId) return "plan_session_changed"
    const proposals = document.querySelectorAll("[data-ui-plan-proposal]")
    const proposal = proposals[0]
    if (!(proposal instanceof HTMLElement)) {
      const plan = document.querySelector("[data-ui-plan]")
      return `plan_proposal_missing:${plan?.getAttribute("data-ui-plan-state") ?? "no_generation"}`
    }
    const proposalId = proposal.getAttribute("data-ui-plan-proposal") ?? ""
    const state = proposal.getAttribute("data-ui-plan-proposal-state") ?? "unknown"
    const revision = proposal.getAttribute("data-ui-plan-revision") ?? "unknown"
    const execution = proposal.querySelector("[data-ui-plan-execution]")
      ?.getAttribute("data-ui-job-state") ?? "none"
    const titleMatches =
      proposal.querySelector("h3")?.textContent?.trim() === expected.planTitle
    const summaryMatches =
      proposal.textContent?.includes(expected.planSummary) === true
    const stepMatches = proposal.querySelector(
      `[data-ui-plan-step="${expected.planStepId}"] strong`
    )?.textContent?.trim() === expected.planStepTitle
    const sessionMatches = selectedSessionId() === ready.sessionId
    const revisionMatches = Number(revision) === 1
    const executionAbsent =
      proposal.querySelector("[data-ui-plan-execution]") === null
    return [
      `plan_${state}`,
      `revision_${revision}`,
      `execution_${execution}`,
      `proposal_${proposalId.length > 0}`,
      `title_${titleMatches}`,
      `summary_${summaryMatches}`,
      `step_${stepMatches}`,
      `session_${sessionMatches}`,
      `revision_match_${revisionMatches}`,
      `execution_absent_${executionAbsent}`,
      `proposal_count_${proposals.length}`
    ].join(":")
  }
}
