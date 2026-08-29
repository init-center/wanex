import type {
  EditorTheme,
  OverlayHandle,
  SelectListTheme,
  TUI
} from "@earendil-works/pi-tui"
import type {
  PlanGenerationReadModel,
  PlanProposalReadModel,
  ReadPlanGenerationResult,
  ReadPlanProposalResult,
  ExecutePlanProposalResult,
  RevisePlanProposalRequest
} from "@wanex/assistant"
import type { PlanProposalStep } from "@wanex/protocol"
import type { SurfaceEvent } from "@wanex/assistant/surface"
import {
  TuiConfirmationOverlay,
  TuiInputOverlay,
  type TuiPlanAction
} from "./components.js"
import type { TuiStructuredFormOverlay } from "./structured-form.js"
import {
  createPlanReviewOverlay,
  planActions,
  decisionLabel,
  decisionPastTense,
  type TuiPlanReviewView
} from "./plan-actions.js"
import {
  buildPlanRevisionRequest,
  createPlanRevisionForm,
  type PlanRevisionFieldName
} from "./plan-revision.js"
import { safeErrorMessage } from "./error.js"
import type {
  TuiPlanClient
} from "./types.js"

export interface TuiPlan {
  open(): void
  close(): void
  isOpen(): boolean
  handleInvalidation(event: SurfaceEvent): void
  reconcileActive(): Promise<void>
  resetSession(sessionId: string | undefined): void
}

export function createTuiPlan(options: {
  readonly tui: TUI
  readonly terminalRows: () => number
  readonly editorTheme: EditorTheme
  readonly theme: SelectListTheme
  readonly client: TuiPlanClient
  readonly canOpen: () => boolean
  readonly sessionId: () => string | undefined
  readonly perform: (action: () => Promise<void>) => Promise<void>
  readonly refreshCanonical: () => Promise<void>
  readonly adoptOperation: (
    operation: ExecutePlanProposalResult["operation"] | undefined
  ) => void
  readonly accepted: (message: string) => void
  readonly rejected: (message: string) => void
}): TuiPlan {
  let overlay: OverlayHandle | undefined
  let active = false
  let workflow = 0
  let generation: PlanGenerationReadModel | undefined
  let proposal: PlanProposalReadModel | undefined
  let generationOperationId: string | undefined
  let proposalId: string | undefined
  let currentSession = options.sessionId()
  let sessionAtOpen: string | undefined
  let revisionForm:
    | TuiStructuredFormOverlay<PlanRevisionFieldName>
    | undefined
  let revisionBaseProposal: PlanProposalReadModel | undefined
  let revisionDraft: RevisePlanProposalRequest | undefined
  let reconcileTail = Promise.resolve()

  return {
    open() {
      if (!options.canOpen() || active) return
      active = true
      sessionAtOpen = options.sessionId()
      const token = ++workflow
      showReview(token, {
        loading: true,
        generation: undefined,
        proposal: undefined,
        actions: [{ value: "close", label: "Close" }]
      })
      void reconcile(token).catch((error) => rejectAndClose(token, safeErrorMessage(error)))
    },
    close,
    isOpen: () => active,
    handleInvalidation(event) {
      if (event.type !== "assistant.surface.plan.invalidated" || event.plan === undefined) return
      const planEvent = event.plan
      if (
        planEvent.sessionId !== undefined &&
        planEvent.sessionId !== currentSession
      ) {
        return
      }
      if (planEvent.operationId !== undefined) generationOperationId = planEvent.operationId
      if (planEvent.proposalId !== undefined) proposalId = planEvent.proposalId
      if (active) {
        reconcileTail = reconcileTail
          .then(async () => await reconcile(workflow))
          .catch((error) => {
            if (active) rejectAndClose(workflow, safeErrorMessage(error))
          })
      }
    },
    async reconcileActive() {
      if (!active) return
      reconcileTail = reconcileTail.then(async () => await reconcile(workflow))
      await reconcileTail
    },
    resetSession(sessionId) {
      if (currentSession !== sessionId) {
        currentSession = sessionId
        generation = undefined
        proposal = undefined
        generationOperationId = undefined
        proposalId = undefined
        if (active) close()
      }
    }
  }

  async function reconcile(token: number): Promise<void> {
    if (!isCurrent(token)) return
    if (sessionAtOpen !== options.sessionId()) {
      close()
      return
    }
    const [proposalEnvelope, generationEnvelope] = await Promise.all([
      options.client.readPlanProposal(
        proposalId === undefined ? undefined : { proposalId }
      ),
      generationOperationId === undefined
        ? Promise.resolve(undefined)
        : options.client.readPlanGeneration({
            operationId: generationOperationId
          })
    ])
    if (!isCurrent(token)) return
    if (!proposalEnvelope.ok) throw new Error(proposalEnvelope.error.message)
    applyProposal(proposalEnvelope.value)
    if (generationEnvelope !== undefined) {
      if (!generationEnvelope.ok) throw new Error(generationEnvelope.error.message)
      applyGeneration(generationEnvelope.value)
    }
    if (generation?.state === "succeeded" && generation.proposalId !== undefined) {
      proposalId = generation.proposalId
      const generatedProposal = await options.client.readPlanProposal({
        proposalId: generation.proposalId
      })
      if (!isCurrent(token)) return
      if (!generatedProposal.ok) throw new Error(generatedProposal.error.message)
      applyProposal(generatedProposal.value)
    }
    if (revisionForm !== undefined && proposal !== undefined) {
      showOverlay(revisionForm, token)
      return
    }
    if (proposal === undefined && generation === undefined) {
      showInput(token)
      return
    }
    showReview(token, { generation, proposal, actions: planActions(generation, proposal) })
  }

  function showInput(token: number): void {
    showOverlay(
      new TuiInputOverlay({
        title: "Create Plan",
        description: "Describe the outcome you want to review before execution.",
        onCancel: close,
        onSubmit(value) {
          const text = value.trim()
          if (text.length === 0) return "planning request must not be empty"
          if (text.length > 32_768) return "planning request is too long"
          void startGeneration(text, token)
          return undefined
        }
      }),
      token
    )
  }

  async function startGeneration(text: string, token: number): Promise<void> {
    hideOverlay()
    await options.perform(async () => {
      try {
        const result = await options.client.startPlanGeneration({
          text,
          ...(sessionAtOpen === undefined ? {} : { sessionId: sessionAtOpen })
        })
        if (!isCurrent(token)) return
        if (!result.ok) {
          rejectAndClose(token, result.error.message)
          return
        }
        generation = result.value
        generationOperationId = result.value.operationId
        proposal = undefined
        proposalId = undefined
        options.accepted("Plan generation started")
        showReview(token, {
          generation,
          proposal,
          actions: planActions(generation, proposal)
        })
        await options.refreshCanonical()
      } catch (error) {
        rejectAndClose(token, safeErrorMessage(error))
      }
    })
  }

  function handleAction(action: TuiPlanAction, token: number): void {
    if (!isCurrent(token)) return
    switch (action) {
      case "close":
        close()
        return
      case "start-generation":
        clearRevision()
        showInput(token)
        return
      case "cancel-generation":
        void cancelGeneration(token)
        return
      case "dismiss-generation":
        void dismissGeneration(token)
        return
      case "edit":
        showRevisionForm(token)
        return
      case "approve":
      case "reject":
      case "withdraw":
        showDecisionConfirmation(action, token)
        return
      case "execute":
        showExecutionConfirmation(token)
        return
    }
  }

  function showRevisionForm(token: number): void {
    const current = proposal
    if (current === undefined || current.state !== "open") return
    if (revisionForm !== undefined) {
      showOverlay(revisionForm, token)
      return
    }
    revisionBaseProposal = current
    revisionDraft = undefined
    revisionForm = createPlanRevisionForm({
      proposal: current,
      tui: options.tui,
      theme: options.editorTheme,
      terminalRows: options.terminalRows,
      onCancel: () => cancelRevision(token),
      onComplete: (values) => showRevisionConfirmation(values, token)
    })
    showOverlay(revisionForm, token)
  }

  function showRevisionConfirmation(
    values: Readonly<Record<PlanRevisionFieldName, string>>,
    token: number
  ): void {
    const base = revisionBaseProposal
    if (base === undefined) return
    try {
      revisionDraft = buildPlanRevisionRequest(base, values)
    } catch (error) {
      options.rejected(safeErrorMessage(error))
      showRevisionEditorOverlay(token)
      return
    }
    const draft = revisionDraft
    showOverlay(
      new TuiConfirmationOverlay({
        title: "Revise Plan?",
        details: [
          draft.title,
          `${draft.steps.length} steps | Revision ${draft.expectedRevision}`,
          "The revised Plan remains open for approval."
        ],
        theme: options.theme,
        confirmLabel: "Revise Plan",
        onCancel: () => showRevisionEditorOverlay(token),
        onConfirm: () => void submitRevision(token)
      }),
      token
    )
  }

  async function submitRevision(token: number): Promise<void> {
    const draft = revisionDraft
    if (draft === undefined || revisionForm === undefined) return
    hideOverlay()
    await options.perform(async () => {
      try {
        const result = await options.client.revisePlanProposal(draft)
        if (!isCurrent(token)) return
        if (!result.ok) {
          options.rejected(result.error.message)
          showRevisionEditorOverlay(token)
          return
        }
        if (result.value.kind !== "assistant.plan-proposal.found") {
          throw new Error("revised Plan proposal is unavailable")
        }
        applyProposal(result.value)
        clearRevision()
        options.accepted("Plan revised")
        showReview(token, {
          generation,
          proposal,
          actions: planActions(generation, proposal)
        })
        await options.refreshCanonical()
      } catch (error) {
        options.rejected(safeErrorMessage(error))
        if (isCurrent(token)) showRevisionEditorOverlay(token)
      }
    })
  }

  function cancelRevision(token: number): void {
    clearRevision()
    showReview(token, {
      generation,
      proposal,
      actions: planActions(generation, proposal)
    })
  }

  function showRevisionEditorOverlay(token: number): void {
    if (revisionForm !== undefined) showOverlay(revisionForm, token)
  }

  function showDecisionConfirmation(
    decision: "approve" | "reject" | "withdraw",
    token: number
  ): void {
    const current = proposal
    if (current === undefined) return
    showOverlay(
      new TuiConfirmationOverlay({
        title: `${decisionLabel(decision)} Plan?`,
        details: [
          current.title,
          `Revision ${current.revision}`,
          decision === "approve"
            ? "The approved Plan can be executed from this review."
            : "This decision changes the current Plan proposal."
        ],
        theme: options.theme,
        confirmLabel: decisionLabel(decision),
        onCancel: () => showReview(token, {
          generation,
          proposal,
          actions: planActions(generation, proposal)
        }),
        onConfirm: () => void decide(decision, current, token)
      }),
      token
    )
  }

  function showExecutionConfirmation(token: number): void {
    const current = proposal
    if (current === undefined || current.state !== "approved" || current.execution !== undefined) return
    showOverlay(
      new TuiConfirmationOverlay({
        title: "Execute Plan?",
        details: [
          current.title,
          `Revision ${current.revision}`,
          "This submits the approved steps to the current conversation."
        ],
        theme: options.theme,
        confirmLabel: "Execute Plan",
        onCancel: () => showReview(token, {
          generation,
          proposal,
          actions: planActions(generation, proposal)
        }),
        onConfirm: () => void execute(current, token)
      }),
      token
    )
  }

  async function decide(
    decision: "approve" | "reject" | "withdraw",
    current: PlanProposalReadModel,
    token: number
  ): Promise<void> {
    hideOverlay()
    await options.perform(async () => {
      try {
        const result = await options.client.decidePlanProposal({
          proposalId: current.proposalId,
          expectedRevision: current.revision,
          decision
        })
        if (!isCurrent(token)) return
        if (!result.ok) {
          rejectAndClose(token, result.error.message)
          return
        }
        applyProposal(result.value)
        options.accepted(`Plan ${decisionPastTense(decision)}`)
        showReview(token, {
          generation,
          proposal,
          actions: planActions(generation, proposal)
        })
        await options.refreshCanonical()
      } catch (error) {
        rejectAndClose(token, safeErrorMessage(error))
      }
    })
  }

  async function execute(
    current: PlanProposalReadModel,
    token: number
  ): Promise<void> {
    hideOverlay()
    await options.perform(async () => {
      try {
        const result = await options.client.executePlanProposal({
          proposalId: current.proposalId,
          expectedRevision: current.revision
        })
        if (!isCurrent(token)) return
        if (!result.ok) {
          rejectAndClose(token, result.error.message)
          return
        }
        options.adoptOperation(result.value.operation)
        options.accepted("Plan execution started")
        close()
        await options.refreshCanonical()
      } catch (error) {
        rejectAndClose(token, safeErrorMessage(error))
      }
    })
  }

  async function cancelGeneration(token: number): Promise<void> {
    const current = generation
    if (current === undefined || current.state !== "running") return
    hideOverlay()
    await options.perform(async () => {
      try {
        const result = await options.client.cancelPlanGeneration({
          operationId: current.operationId
        })
        if (!isCurrent(token)) return
        if (!result.ok) {
          rejectAndClose(token, result.error.message)
          return
        }
        generation = result.value
        options.accepted("Plan generation cancelled")
        showReview(token, {
          generation,
          proposal,
          actions: planActions(generation, proposal)
        })
        await options.refreshCanonical()
      } catch (error) {
        rejectAndClose(token, safeErrorMessage(error))
      }
    })
  }

  async function dismissGeneration(token: number): Promise<void> {
    const current = generation
    if (current === undefined || current.state === "running") return
    hideOverlay()
    await options.perform(async () => {
      try {
        const result = await options.client.dismissPlanGeneration({
          operationId: current.operationId
        })
        if (!isCurrent(token)) return
        if (!result.ok) {
          rejectAndClose(token, result.error.message)
          return
        }
        generation = undefined
        generationOperationId = undefined
        options.accepted("Plan generation dismissed")
        if (proposal === undefined) showInput(token)
        else {
          showReview(token, {
            generation: undefined,
            proposal,
            actions: planActions(undefined, proposal)
          })
        }
        await options.refreshCanonical()
      } catch (error) {
        rejectAndClose(token, safeErrorMessage(error))
      }
    })
  }

  function showReview(
    token: number,
    view: TuiPlanReviewView
  ): void {
    showOverlay(
      createPlanReviewOverlay({
        ...view,
        terminalRows: options.terminalRows,
        theme: options.theme,
        onAction: (action) => handleAction(action, token),
        onCancel: close
      }),
      token
    )
  }

  function showOverlay(component: Parameters<TUI["showOverlay"]>[0], token: number): void {
    if (!isCurrent(token)) return
    hideOverlay()
    overlay = options.tui.showOverlay(component, {
      width: "88%",
      minWidth: 40,
      maxHeight: "82%",
      margin: 1
    })
  }

  function hideOverlay(): void {
    overlay?.hide()
    overlay = undefined
  }

  function close(): void {
    hideOverlay()
    active = false
    workflow += 1
    clearRevision()
  }

  function clearRevision(): void {
    revisionForm = undefined
    revisionBaseProposal = undefined
    revisionDraft = undefined
  }

  function rejectAndClose(token: number, message: string): void {
    if (!isCurrent(token)) return
    close()
    options.rejected(message)
  }

  function isCurrent(token: number): boolean { return active && workflow === token }

  function applyGeneration(
    result: ReadPlanGenerationResult
  ): void {
    if (result.kind === "assistant.plan-generation.found") {
      generation = result.generation
      generationOperationId = result.generation.operationId
      return
    }
    if (generationOperationId === result.operationId) {
      generation = undefined
      generationOperationId = undefined
    }
  }

  function applyProposal(result: ReadPlanProposalResult): void {
    if (result.kind === "assistant.plan-proposal.found") {
      proposal = result.proposal
      proposalId = result.proposal.proposalId
      return
    }
    proposal = undefined
    if (result.kind !== "assistant.plan-proposal.no-selection") proposalId = result.proposalId
  }
}
