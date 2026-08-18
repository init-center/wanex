import type { WanexDesktopProviderRelaunchProofResult } from "./proof-contract.js"
import type {
  WanexDesktopProviderJourneyProofContext
} from "./provider-multimodal-proof.js"

export interface WanexDesktopProviderGoalProofExpected {
  readonly modelId: string
  readonly goalObjective: string
  readonly goalCriterion: string
  readonly goalFirstResponse: string
  readonly goalFinalResponse: string
}

export async function runWanexDesktopProviderGoalProof(
  expected: WanexDesktopProviderGoalProofExpected,
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
  }, 10_000, "goal_ready")

  ready.workflows.click()
  const goalTab = await context.waitFor(() => {
    const candidate = document.querySelector('[data-ui-workflow-tab="goal"]')
    return candidate instanceof HTMLButtonElement ? candidate : undefined
  }, 10_000, "goal_tab")
  goalTab.click()
  const form = await context.waitFor(() => {
    const candidate = document.querySelector("[data-ui-goal-form]")
    const button = candidate?.querySelector('button[type="submit"]')
    return candidate instanceof HTMLFormElement &&
      button instanceof HTMLButtonElement &&
      !button.disabled
      ? { candidate, button }
      : undefined
  }, 10_000, "goal_form")

  setValue(form.candidate, "objective", expected.goalObjective)
  setValue(form.candidate, "successCriteria", expected.goalCriterion)
  setValue(form.candidate, "maxAttempts", "2")
  setValue(form.candidate, "maxConsecutiveBlockedAttempts", "1")
  const submittedAt = performance.now()
  form.button.click()

  const started = await context.waitFor(() => {
    const goal = document.querySelector(
      "[data-ui-goal][data-ui-goal-revision]"
    )
    const goalId = goal?.getAttribute("data-ui-goal") ?? ""
    return goal instanceof HTMLElement &&
      goalId.length > 0 &&
      selectedSessionId() === ready.sessionId
      ? { goalId }
      : undefined
  }, 10_000, "goal_started", goalDiagnostic)

  const terminal = await context.waitFor(() => {
    const goal = document.querySelector(
      `[data-ui-goal="${started.goalId}"][data-ui-goal-revision]`
    )
    if (
      !(goal instanceof HTMLElement) ||
      goal.getAttribute("data-ui-goal-state") !== "succeeded"
    ) {
      return undefined
    }
    const attempts = [...goal.querySelectorAll("[data-ui-goal-attempt]")]
    const attemptNumbers = attempts.map((attempt) =>
      Number(attempt.getAttribute("data-ui-goal-attempt"))
    )
    const verificationResults = attempts.map((attempt) =>
      attempt.querySelector("[data-ui-goal-verification]")
        ?.getAttribute("data-ui-verification-result") ?? ""
    )
    const automaticContinuation = attemptNumbers.join(",") === "1,2"
    const stopPolicyVisible = goal.textContent?.includes("2/2") === true
    const finalResponseVisible = [...document.querySelectorAll(
      '[data-ui-conversation-row][data-ui-role="assistant"]'
    )].some((row) => row.textContent?.includes(expected.goalFinalResponse))
    const userVisible = [...document.querySelectorAll(
      '[data-ui-conversation-row][data-ui-role="user"]'
    )].filter((row) => row.textContent?.includes(expected.goalObjective)).length === 2
    const assistantRows = [...document.querySelectorAll(
      '[data-ui-conversation-row][data-ui-role="assistant"]'
    )]
    const assistantVisible =
      assistantRows.some((row) =>
        row.textContent?.includes(expected.goalFirstResponse)
      ) && finalResponseVisible
    return attemptNumbers.join(",") === "1,2" &&
      verificationResults.join(",") === "failed,passed" &&
      automaticContinuation &&
      stopPolicyVisible &&
      userVisible &&
      assistantVisible &&
      finalResponseVisible &&
      selectedSessionId() === ready.sessionId
      ? {
          attemptCount: attempts.length,
          automaticContinuation,
          assistantVisible,
          finalResponseVisible,
          userVisible,
          verificationResults
        }
      : undefined
  }, 30_000, "goal_terminal", goalDiagnostic)

  const settledAt = performance.now()
  const redacted = context.redacted()
  return context.result({
    ok:
      redacted &&
      terminal.automaticContinuation &&
      terminal.finalResponseVisible &&
      selectedSessionId() === ready.sessionId,
    initialConfiguredProviderCount: 1,
    configuredProviderCount: 1,
    providerConfigured: true,
    providerReady: true,
    providerEvidenceRedacted: redacted,
    modelId: expected.modelId,
    sessionId: ready.sessionId,
    conversationSubmitted: true,
    userVisible: terminal.userVisible,
    assistantVisible: terminal.assistantVisible,
    responseVisible: true,
    goalStarted: true,
    goalAutonomousContinuation: terminal.automaticContinuation,
    goalSucceeded: true,
    goalSessionPreserved: selectedSessionId() === ready.sessionId,
    goalFinalResponseVisible: terminal.finalResponseVisible,
    goalAttemptCount: terminal.attemptCount,
    goalVerificationResults: terminal.verificationResults,
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

  function setValue(
    form: HTMLFormElement,
    name: string,
    value: string
  ): void {
    const control = form.elements.namedItem(name)
    if (
      !(control instanceof HTMLInputElement) &&
      !(control instanceof HTMLTextAreaElement)
    ) {
      throw new Error(`Provider Goal field is unavailable: ${name}`)
    }
    context.setControlValue(control, value)
  }

  function goalDiagnostic(): string {
    if (selectedSessionId() !== ready.sessionId) return "goal_session_changed"
    const section = document.querySelector("[data-ui-goal]")
    const state = section?.getAttribute("data-ui-goal-state") ?? "missing"
    const attempts = section?.querySelectorAll("[data-ui-goal-attempt]").length ?? 0
    return `goal_${state}:attempts_${String(attempts)}`
  }
}
